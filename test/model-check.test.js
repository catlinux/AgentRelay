import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_PER_DAY, MAX_SECONDS, buildProbe, checkModel, checksFile, evaluateProbe,
  isDue, isFreeModel, loadChecks, pendingModels, runChecks, saveChecks,
} from '../src/model-check.js';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-model-check-test-'));
const report = { status: 'done', summary: 'Listo', filesChanged: ['sumar.js'], checks: [], issues: [], questions: [], needsEscalation: false };

test('loadChecks tolera archivo ausente e inválido y saveChecks crea el JSON esperado', () => {
  const home = temp();
  try {
    assert.deepEqual(loadChecks(home), { lastRun: null, models: {} });
    writeFileSync(checksFile(home), '{');
    assert.deepEqual(loadChecks(home), { lastRun: null, models: {} });
    const value = { lastRun: '2026-10-04', models: { 'x-free': { status: 'approved' } } };
    saveChecks(value, home);
    assert.equal(readFileSync(checksFile(home), 'utf8'), `${JSON.stringify(value, null, 2)}\n`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('isFreeModel, isDue y pendingModels filtran y limitan modelos', () => {
  const today = new Date(2026, 9, 4, 10);
  assert.equal(isFreeModel('vendor/model-free'), true);
  assert.equal(isFreeModel('vendor/model'), false);
  assert.equal(isDue({ lastRun: '2026-10-03' }, today), true);
  assert.equal(isDue({ lastRun: '2026-10-04' }, today), false);
  assert.deepEqual(pendingModels(['paid', 'a-free', 'b-free', 'a-free', 'c-free'], { models: { 'b-free': {} } }, 2), ['a-free', 'a-free']);
  assert.equal(MAX_PER_DAY, 5);
});

test('buildProbe mantiene el chequeo en el padre y crea un work aislado', () => {
  const base = temp();
  const probe = buildProbe(base);
  try {
    assert.equal(path.dirname(probe.checkFile), probe.root);
    assert.ok(existsSync(path.join(probe.workDir, 'package.json')));
    assert.match(readFileSync(probe.checkFile, 'utf8'), /sumar\(2, 3\) === 5/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('evaluateProbe aprueba solo comprobación e informe correctos', () => {
  const good = { ok: true, timedOut: false, report, durationMs: 1000, error: null };
  assert.equal(evaluateProbe({ result: good, checkPassed: true }).status, 'approved');
  assert.equal(evaluateProbe({ result: good, checkPassed: false }).status, 'failed');
  assert.match(evaluateProbe({ result: { ...good, timedOut: true }, checkPassed: true }).reason, /tiempo/);
  assert.match(evaluateProbe({ result: { ...good, error: 'HTTP 429' }, checkPassed: true }).reason, /API/);
});

test('checkModel aprueba, rechaza implementación incorrecta y limpia siempre el temporal', async () => {
  const base = temp();
  const created = [];
  const makeAdapter = (source, overrides = {}) => ({ run: async ({ cwd, executor }) => {
    assert.equal(executor.model, 'demo-free');
    assert.equal(executor.timeoutSeconds, MAX_SECONDS);
    writeFileSync(path.join(cwd, 'sumar.js'), source);
    created.push(path.dirname(cwd));
    return { ok: true, timedOut: false, report, durationMs: 1500, error: null, ...overrides };
  } });
  try {
    const good = await checkModel({ id: 'demo-free', executor: {}, adapter: makeAdapter('export const sumar = (a,b) => a+b; export const restar = (a,b) => a-b;'), tmpBase: base });
    assert.equal(good.status, 'approved');
    const bad = await checkModel({ id: 'demo-free', executor: {}, adapter: makeAdapter('export const sumar = () => 0; export const restar = () => 0;'), tmpBase: base });
    assert.equal(bad.status, 'failed');
    const timeout = await checkModel({ id: 'demo-free', executor: {}, adapter: makeAdapter('', { ok: false, timedOut: true, error: 'timeout' }), tmpBase: base });
    assert.equal(timeout.status, 'failed');
    assert.ok(created.every((root) => !existsSync(root)));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('runChecks guarda la fecha antes de probar, persiste cada resultado y respeta el límite diario', async () => {
  const home = temp();
  const now = new Date(2026, 9, 4, 12);
  const adapter = { listModels: async () => Array.from({ length: 7 }, (_, i) => ({ id: `m${i}-free` })) };
  const seenBefore = [];
  try {
    const result = await runChecks({
      executor: {}, adapter, home, now,
      check: async ({ id }) => {
        const stored = loadChecks(home);
        seenBefore.push(stored.lastRun === '2026-10-04' && Object.keys(stored.models).length === seenBefore.length);
        return { status: 'approved', reason: 'ok', checkedAt: now.toISOString(), seconds: 1 };
      },
    });
    assert.equal(result.checked.length, MAX_PER_DAY);
    assert.ok(seenBefore.every(Boolean));
    assert.equal(Object.keys(loadChecks(home).models).length, MAX_PER_DAY);
    assert.deepEqual(await runChecks({ executor: {}, adapter, home, now }), { checked: [] });
    assert.deepEqual(await runChecks({ executor: {}, adapter: { listModels: async () => [] }, home, now: new Date(2026, 9, 5) }), { checked: [] });
    assert.equal(loadChecks(home).lastRun, '2026-10-04');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('runChecks marca el día aunque no haya modelos nuevos y force lo repite el mismo día', async () => {
  const home = temp();
  const now = new Date(2026, 9, 4, 12);
  const adapter = { listModels: async () => [{ id: 'viejo-free' }, { id: 'pago' }] };
  const probado = [];
  const check = async ({ id }) => { probado.push(id); return { status: 'failed', reason: 'x', checkedAt: now.toISOString(), seconds: 0 }; };
  try {
    saveChecks({ lastRun: '2026-10-03', models: { 'viejo-free': { status: 'approved' } } }, home);
    assert.deepEqual(await runChecks({ executor: {}, adapter, home, now, check }), { checked: [] });
    assert.equal(loadChecks(home).lastRun, '2026-10-04');
    const nuevo = { listModels: async () => [{ id: 'viejo-free' }, { id: 'nuevo-free' }] };
    assert.deepEqual(await runChecks({ executor: {}, adapter: nuevo, home, now, check }), { checked: [] });
    const forced = await runChecks({ executor: {}, adapter: nuevo, home, now, check, force: true });
    assert.deepEqual(forced.checked.map((item) => item.id), ['nuevo-free']);
    assert.deepEqual(probado, ['nuevo-free']);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
