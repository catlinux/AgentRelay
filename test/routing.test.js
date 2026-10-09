import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEvents } from '../src/events.js';
import { isAvailable, markQuotaExhausted } from '../src/quota-state.js';
import { routerHooks, startRun } from '../src/orchestrator.js';
import { loadState } from '../src/store.js';
import { normalizeTask } from '../src/task.js';
import { baseTask, FAKE_CLINE, fakePlan, makeRepo, testConfig } from './helpers.js';

const GOOD = { write: { 'hello.txt': 'hi\n' } };
const quotaFailure = { finishReason: 'insufficient_quota', text: 'insufficient_quota', exitCode: 1, report: null };
const routeEntry = (model, paid = false) => ({
  key: `cline:${model}`,
  type: 'cline',
  model,
  api: false,
  paid,
  quotaId: `quota:${model}`,
  tier: 'A',
  trainsOnData: false,
  label: model,
});

afterEach(() => {
  routerHooks.entries = null;
  routerHooks.usable = null;
});

async function withRun({ entries, plan, routing = {}, task = {}, beforeStart, mode = 'auto', onEntries } = {}, check) {
  const repo = makeRepo();
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-routing-home-'));
  const envNames = ['AGENTRELAY_HOME', 'FAKE_CLINE_PLAN', 'FAKE_CLINE_LOG'];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.AGENTRELAY_HOME = home;
  fakePlan(repo, plan ?? { implement: GOOD });
  routerHooks.entries = (args) => {
    onEntries?.(args);
    return entries ?? [];
  };
  routerHooks.usable = async () => ({ ok: true });

  try {
    await beforeStart?.({ repo, home });
    const state = await startRun({
      root: repo.dir,
      task: normalizeTask(baseTask(task)),
      config: testConfig({
        executor: { type: 'cline', command: [process.execPath, FAKE_CLINE], provider: 'fake', model: 'configured-model', timeoutSeconds: 60 },
        routing: { mode, paidOrder: [], maxSwitches: 5, ...routing },
      }),
    });
    await check({ state, repo, home, events: readEvents(repo.dir, state.id) });
  } finally {
    routerHooks.entries = null;
    routerHooks.usable = null;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
    repo.cleanup();
    rmSync(home, { recursive: true, force: true });
  }
}

test('routing off no añade state.route y usa el ejecutor configurado', async () => {
  let entriesCalled = false;
  await withRun({
    mode: 'off',
    onEntries: () => { entriesCalled = true; },
  }, ({ state, repo }) => {
    assert.equal(state.route, undefined);
    assert.equal(repo.calls()[0].model, 'configured-model');
    assert.equal(entriesCalled, false);
  });
});

test('routing auto empieza por la primera entrada y conserva route.first en el estado', async () => {
  const first = routeEntry('free-a');
  await withRun({ entries: [first, routeEntry('free-b')] }, ({ state, repo }) => {
    assert.equal(state.route.first, first.key);
    assert.equal(loadState(repo.dir, state.id).route.first, first.key);
    assert.equal(state.route.current.key, first.key);
    assert.equal(repo.calls()[0].model, 'free-a');
    assert.equal(state.attempts[0].route, first.key);
  });
});

test('si se agota una cuota durante la tarea, cambia a fix con el nuevo modelo sin consumir reintentos', async () => {
  const first = routeEntry('free-a');
  const second = routeEntry('free-b');
  await withRun({
    entries: [first, second],
    plan: {
      byModel: {
        'free-a': { implement: { ...quotaFailure, write: { 'partial.txt': 'partial\n' } } },
        'free-b': { fix: GOOD },
      },
    },
  }, ({ state, repo, home, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((attempt) => attempt.kind), ['implement', 'fix']);
    assert.equal(state.attempts[1].model.id, 'free-b');
    assert.equal(repo.calls()[1].model, 'free-b');
    assert.equal(state.retriesUsed, 0);
    assert.equal(isAvailable(first.quotaId, new Date(), { home }), false);
    const [change] = events.filter((event) => event.type === 'route_switch');
    assert.deepEqual(
      { from: change.from, to: change.to, reason: change.reason, paid: change.paid },
      { from: first.key, to: second.key, reason: 'cuota agotada', paid: false },
    );
  });
});

test('una ejecución nueva vuelve a elegir una cuota gratuita cuyo agotamiento ya caducó', async () => {
  const first = routeEntry('free-a');
  await withRun({
    entries: [first, routeEntry('free-b')],
    beforeStart: ({ home }) => {
      markQuotaExhausted(first.quotaId, {
        home,
        now: new Date(Date.now() - 2 * 60 * 1000),
        unknownDelayMs: 60 * 1000,
      });
      assert.equal(isAvailable(first.quotaId, new Date(), { home }), true);
    },
  }, ({ state, repo }) => {
    assert.equal(state.route.first, first.key);
    assert.equal(repo.calls()[0].model, 'free-a');
  });
});

test('si se agotan todas las entradas, el estado falla e indica que routing no tiene alternativas', async () => {
  const entries = [routeEntry('free-a'), routeEntry('free-b'), routeEntry('paid-a', true)];
  const byModel = Object.fromEntries(entries.map(({ model }) => [model, { implement: quotaFailure, fix: quotaFailure }]));
  await withRun({ entries, plan: { byModel } }, ({ state, repo, home }) => {
    assert.equal(state.status, 'failed');
    assert.match(state.statusReasons.join(' '), /No queda ninguna entrada de routing disponible/);
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['free-a', 'free-b', 'paid-a']);
    assert.equal(state.route.switches.at(-1).paid, true);
    assert.equal(repo.calls().length, entries.length);
    for (const entry of entries) assert.equal(isAvailable(entry.quotaId, new Date(), { home }), false);
  });
});

test('routing.maxSwitches 0 impide el cambio de ejecutor', async () => {
  const first = routeEntry('free-a');
  await withRun({
    entries: [first, routeEntry('free-b')],
    plan: { byModel: { 'free-a': { implement: quotaFailure } } },
    routing: { maxSwitches: 0 },
  }, ({ state, repo, events }) => {
    assert.equal(state.status, 'failed');
    assert.match(state.statusReasons.join(' '), /routing\.maxSwitches/);
    assert.equal(state.attempts.length, 1);
    assert.equal(repo.calls().length, 1);
    assert.deepEqual(events.filter((event) => event.type === 'route_switch'), []);
  });
});

test('un modelo fijado en la tarea desactiva routing auto', async () => {
  let entriesCalled = false;
  await withRun({
    entries: [routeEntry('free-a')],
    task: { model: 'task-model' },
    onEntries: () => { entriesCalled = true; },
  }, ({ state, repo }) => {
    assert.equal(state.route, undefined);
    assert.equal(repo.calls()[0].model, 'task-model');
    assert.equal(state.attempts[0].model.id, 'task-model');
    assert.equal(entriesCalled, false);
  });
});
