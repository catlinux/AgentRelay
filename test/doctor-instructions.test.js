import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.match(missing.stdout, /\[aviso\] Las instrucciones globales del orquestador no están instaladas\. Ejecuta "agentrelay setup"/);
    assert.match(missing.stdout, /\[aviso\] Este proyecto no tiene las instrucciones de AgentRelay\. Ejecuta "agentrelay init"/);

    spawnSync(process.execPath, [BIN, 'setup', '--yes', '--claude-dir', claudeDir], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENTRELAY_EXECUTORS_DIR: path.join(dir, 'ex') } });
    writeFileSync(path.join(dir, 'CLAUDE.md'), `${PROJECT_BLOCK.replace('## Delegación con AgentRelay', '## Delegación (versión anterior)')}\n`);

    const outdated = doctor(dir, claudeDir);
    assert.match(outdated.stdout, /Instrucciones globales del orquestador: al día/);
    assert.match(outdated.stdout, /\[aviso\] Las instrucciones de AgentRelay de este proyecto están desactualizadas\. Ejecuta "agentrelay init"/);

    spawnSync(process.execPath, [BIN, 'init', '--yes'], { cwd: dir, encoding: 'utf8' });
    const current = doctor(dir, claudeDir);
    assert.match(current.stdout, /Instrucciones de AgentRelay en este proyecto: al día/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
