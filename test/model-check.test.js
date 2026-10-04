import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_PER_DAY, MAX_SECONDS, buildProbe, checkModel, checksFile, evaluateProbe,
  isDue, isFreeModel, loadChecks, markDay, pendingModels, runChecks, saveChecks, startDailyCheck,
} from '../src/model-check.js';
import { reportPath } from '../src/executors-report.js';
import { fileURLToPath } from 'node:url';

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

test('pendingModels reintenta fallos de más de siete días, pero conserva aprobados y fallos recientes', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const checks = { models: {
    'viejo-free': { status: 'failed', checkedAt: '2026-09-26T11:59:59Z' },
    'reciente-free': { status: 'failed', checkedAt: '2026-09-27T12:00:01Z' },
    'aprobado-free': { status: 'approved', checkedAt: '2026-09-01T00:00:00Z' },
  } };
  assert.deepEqual(pendingModels(['viejo-free', 'reciente-free', 'aprobado-free'], checks, MAX_PER_DAY, now), ['viejo-free']);
});

test('startDailyCheck respeta las condiciones restantes y lanza sin OpenCode', async () => {
  const home = temp();
  const now = new Date('2026-10-04T12:00:00Z');
  const calls = [];
  const spawnFn = (...args) => { calls.push(args); return { unref() { calls.push('unref'); } }; };
  const options = { executor: {}, home, now, spawnFn, env: {} };
  try {
    assert.equal(await startDailyCheck({ ...options, env: { AGENTRELAY_NO_MODEL_CHECK: '1' } }), false);
    assert.equal(await startDailyCheck({ ...options, env: { NODE_TEST_CONTEXT: 'child-v8' } }), false);
    saveChecks({ lastRun: '2026-10-04', models: {} }, home);
    assert.equal(await startDailyCheck(options), false);
    saveChecks({ lastRun: null, models: {} }, home);
    const warnings = [];
    assert.equal(await startDailyCheck({ ...options, log: (line) => warnings.push(line) }), true);
    assert.deepEqual(calls[0][0], process.execPath);
    assert.deepEqual(calls[0][1].slice(-3), ['executors', 'check', '--background']);
    assert.deepEqual(calls[0][2], { detached: true, stdio: 'ignore', windowsHide: true });
    assert.equal(calls[1], 'unref');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Preparando en segundo plano el informe diario de ejecutores/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('markDay actualiza la fecha local y conserva los modelos', () => {
  const home = temp();
  const models = { 'x-free': { status: 'approved' } };
  try {
    saveChecks({ lastRun: '2026-10-03', models }, home);
    markDay(home, new Date(2026, 9, 4, 12));
    assert.deepEqual(loadChecks(home), { lastRun: '2026-10-04', models });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('executors check genera informe sin OpenCode y no repite el informe el mismo día', () => {
  const cwd = temp();
  const home = path.join(cwd, 'home');
  const executors = path.join(cwd, 'executors');
  const reports = path.join(cwd, 'reports');
  const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
  mkdirSync(executors);
  const env = { ...process.env, AGENTRELAY_HOME: home, AGENTRELAY_EXECUTORS_DIR: executors,
    AGENTRELAY_REPORT_ROOT: reports, AGENTRELAY_NO_MIGRATE: '1', PATH: '', DEEPSEEK_API_KEY: undefined };
  delete env.NODE_TEST_CONTEXT;
  const run = (args = []) => spawnSync(process.execPath, [bin, '--cwd', cwd, 'executors', 'check', ...args], { cwd, encoding: 'utf8', env });
  try {
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /OpenCode no está instalado .*se omite la prueba de modelos/);
    assert.ok(existsSync(reportPath(reports)));
    assert.match(first.stdout, new RegExp(`Informe: ${reportPath(reports).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Ya se hizo hoy \(usa --force para repetirlo\)/);
    const forced = run(['--force']);
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /Informe:/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
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
