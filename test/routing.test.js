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
import { baseTask, fakePlan, makeRepo, testConfig } from './helpers.js';

const GOOD = { write: { 'hello.txt': 'hi\n' } };
const quotaFailure = { error: 'insufficient_quota', exitCode: 1, report: null };
const routeEntry = (model, paid = false) => ({
  key: `opencode:${model}`,
  type: 'opencode',
  model,
  api: false,
  paid,
  quotaId: model,
  tier: 'A',
  trainsOnData: false,
  label: model,
});

afterEach(() => {
  routerHooks.entries = null;
  routerHooks.usable = null;
  routerHooks.sleep = null;
});

async function withRun({ entries, plan, routing = {}, task = {}, beforeStart, mode = 'auto', onEntries } = {}, check) {
  const pauses = [];
  const repo = makeRepo();
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-routing-home-'));
  const envNames = ['AGENTRELAY_HOME', 'FAKE_OPENCODE_PLAN', 'FAKE_OPENCODE_LOG', 'FAKE_OPENCODE_MODELS', 'FAKE_OPENCODE_STORED'];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.AGENTRELAY_HOME = home;
  fakePlan(repo, plan ?? { implement: GOOD });
  routerHooks.entries = (args) => {
    onEntries?.(args);
    return entries ?? [];
  };
  routerHooks.usable = async () => ({ ok: true });
  routerHooks.sleep = async (ms) => { pauses.push(ms); };

  try {
    await beforeStart?.({ repo, home });
    const state = await startRun({
      root: repo.dir,
      task: normalizeTask(baseTask(task)),
      config: testConfig({
        routing: { mode, paidOrder: [], maxSwitches: 5, ...routing },
      }),
    });
    await check({ state, repo, home, events: readEvents(repo.dir, state.id), pauses });
  } finally {
    routerHooks.entries = null;
    routerHooks.usable = null;
    routerHooks.sleep = null;
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
    assert.equal(repo.calls()[0].model, 'fake-model');
    assert.equal(entriesCalled, false);
  });
});

test('routing auto empieza por la primera entrada y conserva route.first en el estado', async () => {
  const first = routeEntry('fake/free-a');
  await withRun({ entries: [first, routeEntry('fake/free-b')] }, ({ state, repo }) => {
    assert.equal(state.route.first, first.key);
    assert.equal(loadState(repo.dir, state.id).route.first, first.key);
    assert.equal(state.route.current.key, first.key);
    assert.equal(repo.calls()[0].model, 'fake/free-a');
    assert.equal(state.attempts[0].route, first.key);
  });
});

test('si se agota una cuota durante la tarea, cambia a fix con el nuevo modelo sin consumir reintentos', async () => {
  const first = routeEntry('fake/free-a');
  const second = routeEntry('fake/free-b');
  await withRun({
    entries: [first, second],
    plan: {
      byModel: {
        'fake/free-a': { implement: { ...quotaFailure, write: { 'partial.txt': 'partial\n' } }, fix: quotaFailure },
        'fake/free-b': { fix: GOOD },
      },
    },
  }, ({ state, repo, home, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((attempt) => attempt.kind), ['implement', 'fix', 'fix']);
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['fake/free-a', 'fake/free-a', 'fake/free-b']);
    assert.equal(repo.calls()[2].model, 'fake/free-b');
    assert.equal(events.filter((event) => event.type === 'route_retry').length, 1);
    assert.equal(state.retriesUsed, 0);
    assert.equal(isAvailable(first.quotaId, new Date(), { home }), false);
    const [change] = events.filter((event) => event.type === 'route_switch');
    assert.deepEqual(
      { from: change.from, to: change.to, reason: change.reason, paid: change.paid },
      { from: first.key, to: second.key, reason: 'cuota agotada', paid: false },
    );
  });
});

test('con routing, un límite de velocidad salta al siguiente modelo y deja el actual en espera', async () => {
  const first = routeEntry('fake/free-a');
  const second = routeEntry('fake/free-b');
  await withRun({
    entries: [first, second],
    plan: {
      byModel: {
        'fake/free-a': {
          implement: { error: 'Upstream request failed: Rate limit exceeded. Please try again later.', exitCode: 1, report: null },
          fix: { error: 'Upstream request failed: Rate limit exceeded. Please try again later.', exitCode: 1, report: null },
        },
        'fake/free-b': { fix: GOOD },
      },
    },
  }, ({ state, home }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.equal(state.attempts[2].model.id, 'fake/free-b');
    assert.equal(state.retriesUsed, 0);
    assert.equal(isAvailable(first.quotaId, new Date(), { home }), false);
  });
});

test('una ejecución nueva vuelve a elegir una cuota gratuita cuyo agotamiento ya caducó', async () => {
  const first = routeEntry('fake/free-a');
  await withRun({
    entries: [first, routeEntry('fake/free-b')],
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
    assert.equal(repo.calls()[0].model, 'fake/free-a');
  });
});

test('si se agotan todas las entradas, el estado falla e indica que routing no tiene alternativas', async () => {
  const entries = [routeEntry('fake/free-a'), routeEntry('fake/free-b'), routeEntry('fake/paid-a', true)];
  const byModel = Object.fromEntries(entries.map(({ model }) => [model, { implement: quotaFailure, fix: quotaFailure }]));
  await withRun({ entries, plan: { byModel } }, ({ state, repo, home }) => {
    assert.equal(state.status, 'failed');
    assert.match(state.statusReasons.join(' '), /Se detiene el enrutado[\s\S]*PREGUNTA al usuario[\s\S]*agentrelay orden pago/);
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['fake/free-a', 'fake/free-a', 'fake/free-b', 'fake/free-b', 'fake/paid-a']);
    assert.equal(state.route.switches.at(-1).paid, true);
    assert.equal(repo.calls().length, 5);
    for (const entry of entries) assert.equal(isAvailable(entry.quotaId, new Date(), { home }), false);
  });
});

test('routing.maxSwitches 0 impide el cambio de ejecutor', async () => {
  const first = routeEntry('fake/free-a');
  await withRun({
    entries: [first, routeEntry('fake/free-b')],
    plan: { byModel: { 'fake/free-a': { implement: quotaFailure, fix: quotaFailure } } },
    routing: { maxSwitches: 0 },
  }, ({ state, repo, events }) => {
    assert.equal(state.status, 'failed');
    assert.match(state.statusReasons.join(' '), /routing\.maxSwitches/);
    assert.equal(state.attempts.length, 2);
    assert.equal(repo.calls().length, 2);
    assert.deepEqual(events.filter((event) => event.type === 'route_switch'), []);
  });
});

test('un error definitivo de la IA de pago (cuota) la detiene sin reintentos y pregunta', async () => {
  const paid = routeEntry('fake/paid-a', true);
  await withRun({
    entries: [paid],
    plan: { byModel: { 'fake/paid-a': { implement: quotaFailure } } },
  }, ({ state, repo, events }) => {
    assert.equal(state.status, 'failed');
    assert.equal(state.attempts.length, 1);
    assert.equal(repo.calls().length, 1);
    assert.match(state.statusReasons.join(' '), /PREGUNTA al usuario qué IA usar/);
    assert.deepEqual(events.filter((event) => event.type === 'route_retry'), []);
  });
});

test('si el error indica cuándo se restablece la cuota, la gratuita no se reintenta: salta enseguida', async () => {
  const first = routeEntry('fake/free-a');
  const second = routeEntry('fake/free-b');
  await withRun({
    entries: [first, second],
    plan: {
      byModel: {
        'fake/free-a': { implement: { error: 'Usage limit reached; {"resets_in_seconds": 3600}', exitCode: 1, report: null } },
        'fake/free-b': { fix: GOOD },
      },
    },
  }, ({ state, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['fake/free-a', 'fake/free-b']);
    assert.deepEqual(events.filter((event) => event.type === 'route_retry'), []);
  });
});

test('un éxito reinicia la cuenta de fallos de la entrada', async () => {
  const first = routeEntry('fake/free-a');
  await withRun({
    entries: [first, routeEntry('fake/free-b')],
    plan: { byModel: { 'fake/free-a': { implement: quotaFailure, fix: GOOD } } },
  }, ({ state, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['fake/free-a', 'fake/free-a']);
    assert.equal(state.route.strikes, 0);
    assert.deepEqual(events.filter((event) => event.type === 'route_switch'), []);
  });
});

const rateLimit = { error: 'Upstream request failed: Rate limit exceeded. Please try again later.', exitCode: 1, report: null };
const netError = { error: 'request failed: ECONNRESET socket hang up', exitCode: 1, report: null };

test('la IA de pago reintenta un fallo pasajero con pausas de 5 y 15 s y se completa', async () => {
  await withRun({
    entries: [routeEntry('fake/paid-a', true)],
    plan: { byModel: { 'fake/paid-a': { implement: rateLimit, fix: [rateLimit, GOOD] } } },
  }, ({ state, pauses, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.equal(state.attempts.length, 3);
    assert.deepEqual(pauses, [5000, 15000]);
    assert.equal(events.filter((event) => event.type === 'route_retry').length, 2);
  });
});

test('si la IA de pago sigue fallando tras tres intentos, se detiene y pregunta', async () => {
  await withRun({
    entries: [routeEntry('fake/paid-a', true)],
    plan: { byModel: { 'fake/paid-a': { implement: netError, fix: netError } } },
  }, ({ state, pauses }) => {
    assert.equal(state.status, 'failed');
    assert.equal(state.attempts.length, 3);
    assert.deepEqual(pauses, [5000, 15000]);
    assert.match(state.statusReasons.join(' '), /varias veces seguidas[\s\S]*PREGUNTA al usuario/);
  });
});

test('la IA de pago no reintenta un saldo insuficiente: se detiene a la primera', async () => {
  await withRun({
    entries: [routeEntry('fake/paid-a', true)],
    plan: { byModel: { 'fake/paid-a': { implement: { error: 'Insufficient Balance (request_id: x)', exitCode: 1, report: null } } } },
  }, ({ state, pauses }) => {
    assert.equal(state.status, 'failed');
    assert.equal(state.attempts.length, 1);
    assert.deepEqual(pauses, []);
    assert.match(state.statusReasons.join(' '), /PREGUNTA al usuario/);
  });
});

test('una gratuita con fallos de red espera 5 s, reintenta una vez y salta a la siguiente', async () => {
  await withRun({
    entries: [routeEntry('fake/free-a'), routeEntry('fake/free-b')],
    plan: { byModel: { 'fake/free-a': { implement: netError, fix: netError }, 'fake/free-b': { fix: GOOD } } },
  }, ({ state, pauses, events }) => {
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((attempt) => attempt.model.id), ['fake/free-a', 'fake/free-a', 'fake/free-b']);
    assert.deepEqual(pauses, [5000]);
    assert.equal(events.find((event) => event.type === 'route_switch').reason, 'fallos repetidos del proveedor');
  });
});

test('un modelo fijado en la tarea desactiva routing auto', async () => {
  let entriesCalled = false;
  await withRun({
    entries: [routeEntry('fake/free-a')],
    task: { model: 'task-model' },
    onEntries: () => { entriesCalled = true; },
  }, ({ state, repo }) => {
    assert.equal(state.route, undefined);
    assert.equal(repo.calls()[0].model, 'task-model');
    assert.equal(state.attempts[0].model.id, 'task-model');
    assert.equal(entriesCalled, false);
  });
});
