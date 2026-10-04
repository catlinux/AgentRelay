import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockStatus, GLOBAL_BLOCK, PROJECT_BLOCK } from '../src/instructions.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function doctor(cwd, claudeDir) {
  return spawnSync(process.execPath, [BIN, '--cwd', cwd, 'doctor', '--claude-dir', claudeDir], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AGENTRELAY_HOME: path.join(cwd, 'home') },
  });
}

test('blockStatus distingue archivo inexistente, sin bloque, desactualizado y al día', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-blockstatus-'));
  try {
    const file = path.join(dir, 'CLAUDE.md');
    assert.equal(blockStatus(file, GLOBAL_BLOCK), 'nofile');
    writeFileSync(file, '# Mis notas\n');
    assert.equal(blockStatus(file, GLOBAL_BLOCK), 'missing');
    writeFileSync(file, `# Mis notas\n\n${GLOBAL_BLOCK}\n`);
    assert.equal(blockStatus(file, GLOBAL_BLOCK), 'current');
    writeFileSync(file, `# Mis notas\n\n${GLOBAL_BLOCK.replace('## AgentRelay', '## AgentRelay (antiguo)')}\n`);
    assert.equal(blockStatus(file, GLOBAL_BLOCK), 'outdated');
    // No modifica el archivo.
    assert.ok(readFileSync(file, 'utf8').includes('(antiguo)'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor avisa cuando las instrucciones del orquestador faltan o están desactualizadas', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-doctor-blocks-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    const claudeDir = path.join(dir, 'claude');

    const missing = doctor(dir, claudeDir);
    assert.match(missing.stdout, /Los comandos de Claude Code .*instalados\. Ejecuta "agentrelay setup"/);
    assert.match(missing.stdout, /\[aviso\] Las instrucciones globales del orquestador no están instaladas\. Ejecuta "agentrelay setup"/);
    assert.match(missing.stdout, /\[aviso\] Este proyecto no tiene las instrucciones de AgentRelay\. Ejecuta "agentrelay init"/);

    spawnSync(process.execPath, [BIN, 'setup', '--yes', '--claude-dir', claudeDir], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENTRELAY_EXECUTORS_DIR: path.join(dir, 'ex') } });
    writeFileSync(path.join(dir, 'CLAUDE.md'), `${PROJECT_BLOCK.replace('## Delegación con AgentRelay', '## Delegación (versión anterior)')}\n`);

    writeFileSync(path.join(claudeDir, 'commands', 'ar', 'estado.md'), 'anterior\n<!-- agentrelay:managed -->');
    const outdated = doctor(dir, claudeDir);
    assert.match(outdated.stdout, /Los comandos de Claude Code .*desactualizados\. Ejecuta "agentrelay setup"/);
    const legacyDir = path.join(claudeDir, 'commands', 'agentrelay');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(path.join(legacyDir, 'modelo.md'), 'anterior\n<!-- agentrelay:managed -->');
    const legacy = doctor(dir, claudeDir);
    assert.match(legacy.stdout, /Quedan comandos antiguos \/agentrelay:â€¦ de una versión anterior/);
    rmSync(legacyDir, { recursive: true, force: true });
    assert.match(outdated.stdout, /Instrucciones globales del orquestador: al día/);
    assert.match(outdated.stdout, /\[aviso\] Las instrucciones de AgentRelay de este proyecto están desactualizadas\. Ejecuta "agentrelay init"/);

    spawnSync(process.execPath, [BIN, 'setup', '--yes', '--claude-dir', claudeDir], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENTRELAY_EXECUTORS_DIR: path.join(dir, 'ex') } });
    spawnSync(process.execPath, [BIN, 'init', '--yes'], { cwd: dir, encoding: 'utf8' });
    const current = doctor(dir, claudeDir);
    assert.match(current.stdout, /Comandos de Claude Code .*al d[aí]a/);
    assert.match(current.stdout, /Instrucciones de AgentRelay en este proyecto: al día/);
    for (const name of ['estado', 'modelo', 'esfuerzo', 'nivel', 'ejecutor', 'usar']) {
      writeFileSync(path.join(claudeDir, 'commands', 'ar', `${name}.md`), 'archivo propio');
    }
    const foreign = doctor(dir, claudeDir);
    assert.match(foreign.stdout, /Los comandos de Claude Code existentes son tuyos/);
    assert.doesNotMatch(foreign.stdout, /Los comandos de Claude Code .*Ejecuta "agentrelay setup"/);

    writeFileSync(path.join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
    writeFileSync(path.join(dir, 'AGENTS.md'), `${PROJECT_BLOCK}\n`);
    const importedCurrent = doctor(dir, claudeDir);
    assert.match(importedCurrent.stdout, /Instrucciones de AgentRelay en este proyecto: al d.a/);

    writeFileSync(path.join(dir, 'AGENTS.md'), `${PROJECT_BLOCK.replace('AgentRelay', 'Other')}\n`);
    const importedOutdated = doctor(dir, claudeDir);
    assert.match(importedOutdated.stdout, /\[aviso\].*desactualizadas.*agentrelay init/);

    writeFileSync(path.join(dir, 'AGENTS.md'), '# Mis notas\n');
    const importedMissing = doctor(dir, claudeDir);
    assert.match(importedMissing.stdout, /\[aviso\] Este proyecto no tiene las instrucciones de AgentRelay\. Ejecuta "agentrelay init"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
