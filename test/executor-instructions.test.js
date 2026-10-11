import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executorInstructionsNotice, PROJECT_BLOCK, projectRulesForExecutor } from '../src/instructions.js';
import { collectProjectState, renderProjectState } from '../src/project-state.js';
import { buildFixPrompt, buildImplementPrompt, buildSelfReviewPrompt } from '../src/prompts.js';
import { applyReview, startRun } from '../src/orchestrator.js';
import { runDir } from '../src/store.js';
import { normalizeTask } from '../src/task.js';
import { baseTask, FAKE_CODEX, fakePlan, makeRepo, testConfig } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'agentrelay-instr-'));
}

test('sin AGENTS.md y con CLAUDE.md propio, Codex recibe las normas sin el bloque de AgentRelay', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), `Regla crítica: no bloquear el hilo principal.\n\n${PROJECT_BLOCK}\n`);
    const rules = projectRulesForExecutor(dir, 'codex');
    assert.equal(rules.source, 'CLAUDE.md');
    assert.equal(rules.text, 'Regla crítica: no bloquear el hilo principal.');
    assert.match(executorInstructionsNotice(dir, 'codex'), /codex no lee CLAUDE\.md y no hay AGENTS\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('con AGENTS.md existente no se inyecta nada: el ejecutor ya lo lee', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'Normas de Claude\n');
    writeFileSync(path.join(dir, 'AGENTS.md'), 'Normas compartidas\n');
    assert.equal(projectRulesForExecutor(dir, 'codex'), null);
    assert.equal(executorInstructionsNotice(dir, 'codex'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('OpenCode lee CLAUDE.md por su cuenta: no se inyecta', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'Normas de Claude\n');
    assert.equal(projectRulesForExecutor(dir, 'opencode'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un CLAUDE.md que solo tiene el bloque o la importación no aporta normas', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), `${PROJECT_BLOCK}\n`);
    assert.equal(projectRulesForExecutor(dir, 'codex'), null);
    writeFileSync(path.join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
    assert.equal(projectRulesForExecutor(dir, 'codex'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin CLAUDE.md ni AGENTS.md no hay nada que inyectar', () => {
  const dir = tempDir();
  try {
    assert.equal(projectRulesForExecutor(dir, 'codex'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('los prompts incluyen las normas del proyecto solo si se pasan', () => {
  const task = normalizeTask(baseTask());
  const projectRules = { source: 'CLAUDE.md', text: 'REGLA-X' };
  const common = { validationCommands: [], selfReview: 'none' };
  const built = [
    buildImplementPrompt(task, { ...common, projectRules }),
    buildFixPrompt(task, { ...common, projectRules, feedback: 'f', validations: [] }),
    buildSelfReviewPrompt(task, { validationCommands: [], changedFiles: [], diff: '', validations: [], projectRules }),
  ];
  for (const text of built) assert.match(text, /# Project instructions \(from CLAUDE\.md\)[\s\S]*REGLA-X/);
  assert.doesNotMatch(buildImplementPrompt(task, common), /Project instructions/);
});

test('la ejecución con OpenCode no duplica CLAUDE.md en el prompt', async () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), 'REGLA-DEL-PROYECTO\n');
    fakePlan(repo, { implement: { write: { 'hello.txt': 'hi\n' } } });
    const state = await startRun({
      root: repo.dir, task: normalizeTask(baseTask()), config: testConfig(), allowDirty: true,
    });
    const text = readFileSync(path.join(runDir(repo.dir, state.id), 'attempt-1-implement.prompt.md'), 'utf8');
    assert.doesNotMatch(text, /REGLA-DEL-PROYECTO/);
    await applyReview({ root: repo.dir, id: state.id, decision: 'reject' });
  } finally {
    repo.cleanup();
  }
});

test('la ejecución con Codex incluye CLAUDE.md en el prompt cuando no hay AGENTS.md', async () => {
  const repo = makeRepo();
  const keys = ['AGENTRELAY_HOME', 'FAKE_CODEX_LOG', 'FAKE_CODEX_LOGGED_IN'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.AGENTRELAY_HOME = path.join(repo.dir, 'home');
    process.env.FAKE_CODEX_LOG = path.join(repo.dir, 'codex.log');
    process.env.FAKE_CODEX_LOGGED_IN = '1';
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), `REGLA-DEL-PROYECTO

${PROJECT_BLOCK}
`);
    const config = testConfig({ executor: { type: 'codex', command: [process.execPath, FAKE_CODEX], model: 'gpt-6-luna', timeoutSeconds: 10 } });
    const state = await startRun({ root: repo.dir, task: normalizeTask(baseTask()), config, allowDirty: true });
    const text = readFileSync(path.join(runDir(repo.dir, state.id), 'attempt-1-implement.prompt.md'), 'utf8');
    assert.match(text, /# Project instructions \(from CLAUDE\.md\)[\s\S]*REGLA-DEL-PROYECTO/);
    assert.doesNotMatch(text, /agentrelay:start/);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    repo.cleanup();
  }
});

test('status avisa de que Codex no lee CLAUDE.md y no hay AGENTS.md', async () => {
  const repo = makeRepo();
  const originalHome = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = path.join(repo.dir, 'home');
  try {
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), `Normas propias\n\n${PROJECT_BLOCK}\n`);
    const state = await collectProjectState(repo.dir);
    assert.equal(state.executor.type, 'codex');
    assert.match(state.instructions.executorNotice, /codex no lee CLAUDE\.md/);
    assert.match(renderProjectState(state), /- Instrucciones del ejecutor: .*no hay AGENTS\.md/);

    writeFileSync(path.join(repo.dir, 'AGENTS.md'), `Normas propias\n\n${PROJECT_BLOCK}\n`);
    const withAgents = await collectProjectState(repo.dir);
    assert.equal(withAgents.instructions.executorNotice, null);
    assert.doesNotMatch(renderProjectState(withAgents), /Instrucciones del ejecutor/);
  } finally {
    if (originalHome === undefined) delete process.env.AGENTRELAY_HOME;
    else process.env.AGENTRELAY_HOME = originalHome;
    repo.cleanup();
  }
});

test('init con Codex y un CLAUDE.md existente avisa y no crea AGENTS.md', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), 'Normas propias\n');
    const r = spawnSync(process.execPath, [BIN, 'init', '--yes'], {
      cwd: repo.dir, encoding: 'utf8',
      env: { ...process.env, AGENTRELAY_HOME: path.join(repo.dir, 'home'), AGENTRELAY_NO_MIGRATE: '1' },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Aviso: El ejecutor codex no lee CLAUDE\.md y no hay AGENTS\.md/);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), `Normas propias\n\n${PROJECT_BLOCK}\n`);
    assert.throws(() => readFileSync(path.join(repo.dir, 'AGENTS.md')));
  } finally {
    repo.cleanup();
  }
});
