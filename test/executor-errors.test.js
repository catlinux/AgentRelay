import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEvents } from '../src/events.js';
import { startRun } from '../src/orchestrator.js';
import { normalizeTask } from '../src/task.js';
import { classifyExecutorError } from '../src/executors/common.js';
import { isExhausted } from '../src/free-ranking.js';
import { loadChecks } from '../src/model-check.js';
import { baseTask, fakePlan, makeRepo, testConfig } from './helpers.js';

test('clasifica errores de credenciales', () => {
  for (const text of ['401 Unauthorized', 'Authentication Fails', 'invalid API key', 'incorrect api key', 'invalid_api_key', 'Not logged in', 'Session expired']) {
    assert.equal(classifyExecutorError(text), 'credentials', text);
  }
});

test('clasifica errores de cuota o saldo', () => {
  for (const text of ['insufficient_quota', 'Quota exceeded', 'exceeded your current quota', 'billing issue', 'insufficient balance', 'out of credits', 'payment required', 'HTTP 402']) {
    assert.equal(classifyExecutorError(text), 'quota', text);
  }
});

test('no clasifica límites de velocidad ni errores normales', () => {
  for (const text of ['429', 'rate limit', 'too many requests', '429 too many requests', 'network timeout', 'at file.js:401', 'took 402 ms', '']) {
    assert.equal(classifyExecutorError(text), null, text);
  }
});

test('detiene errores de credenciales y cuota sin reintentos ni self-review', async () => {
  for (const [error, reason] of [
    ['invalid api key', /credenciales.*agentrelay doctor.*agentrelay login/],
    ['insufficient_quota', /cuota o saldo.*elige otro ejecutor\.[\s\S]*Alternativas \(no se cambia nada solo; elige una\):[\s\S]*agentrelay use codex[\s\S]*Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>\./],
  ]) {
    const repo = makeRepo();
    try {
      fakePlan(repo, { implement: { finishReason: error, text: error, report: null } });
      const oldHome = process.env.AGENTRELAY_HOME;
      const oldExecutors = process.env.AGENTRELAY_EXECUTORS_DIR;
      process.env.AGENTRELAY_HOME = repo.dir;
      process.env.AGENTRELAY_EXECUTORS_DIR = repo.dir;
      let state;
      try {
        state = await startRun({
          root: repo.dir,
          task: normalizeTask(baseTask({ complexity: 'complex' })),
          config: testConfig({ level: 3 }),
        });
      } finally {
        if (oldHome === undefined) delete process.env.AGENTRELAY_HOME;
        else process.env.AGENTRELAY_HOME = oldHome;
        if (oldExecutors === undefined) delete process.env.AGENTRELAY_EXECUTORS_DIR;
        else process.env.AGENTRELAY_EXECUTORS_DIR = oldExecutors;
      }
      assert.equal(state.status, 'failed');
      assert.equal(state.attempts.length, 1);
      assert.equal(state.attempts[0].kind, 'implement');
      assert.match(state.statusReasons.join(' '), reason);
      const events = readEvents(repo.dir, state.id);
      assert.equal(events.some((event) => event.type === 'retry'), false);
      assert.equal(events.some((event) => event.type.startsWith('self_review')), false);
      assert.equal(repo.calls().length, 1);
    } finally {
      repo.cleanup();
    }
  }
});

test('un error normal continúa reintentándose', async () => {
  const repo = makeRepo();
  try {
    fakePlan(repo, {
      implement: { finishReason: 'error', text: 'network timeout', report: null },
      fix: {},
    });
    const state = await startRun({
      root: repo.dir,
      task: normalizeTask(baseTask()),
      config: testConfig({ level: 3 }),
    });
    assert.deepEqual(state.attempts.slice(0, 2).map((attempt) => attempt.kind), ['implement', 'fix']);
    assert.equal(readEvents(repo.dir, state.id).some((event) => event.type === 'retry'), true);
  } finally {
    repo.cleanup();
  }
});

test('marca agotado un modelo de OpenCode cuando la ejecución falla por cuota', async () => {
  const repo = makeRepo();
  const home = `${repo.dir}/agentrelay-home`;
  const oldHome = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  try {
    const model = 'vendor/model-free';
    const state = await startRun({
      root: repo.dir,
      task: normalizeTask(baseTask()),
      config: testConfig({
        executor: {
          type: 'opencode', provider: 'fake', model,
          command: [process.execPath, '-e', "const args=process.argv.slice(1); if (args[0] === 'auth') process.stdout.write('OpenCode account stored'); else if (args[0] === '--version') process.stdout.write('opencode test'); else { process.stderr.write('insufficient_quota'); process.exit(1); }"],
        },
      }),
    });

    assert.equal(state.status, 'failed');
    assert.equal(isExhausted(loadChecks(home), model), true);
  } finally {
    if (oldHome === undefined) delete process.env.AGENTRELAY_HOME;
    else process.env.AGENTRELAY_HOME = oldHome;
    repo.cleanup();
  }
});
