import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  buildProbe, checksFile, evaluateProbe, isDue, isFreeModel, loadChecks, markDay, saveChecks, startDailyCheck,
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

test('isFreeModel e isDue identifican modelos gratuitos y el día de revisión', () => {
  const today = new Date(2026, 9, 4, 10);
  assert.equal(isFreeModel('vendor/model-free'), true);
  assert.equal(isFreeModel('vendor/model'), false);
  assert.equal(isDue({ lastRun: '2026-10-03' }, today), true);
  assert.equal(isDue({ lastRun: '2026-10-04' }, today), false);
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
    assert.equal(warnings[0], 'Actualizando en segundo plano el ranquing de modelos gratuitos de OpenCode y el informe diario (solo se usan tareas de ejemplo, nunca tu código).');
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

test('executors check calcula el ranking listado, omite agotados y solo repite con --force', () => {
  const cwd = temp();
  const home = path.join(cwd, 'home');
  const executors = path.join(cwd, 'executors');
  const fakeBin = path.join(cwd, 'fake-bin');
  const reports = path.join(cwd, 'reports');
  const runner = path.join(cwd, 'fake-opencode.mjs');
  const runLog = path.join(cwd, 'opencode-runs.log');
  const command = path.join(fakeBin, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
  mkdirSync(home);
  mkdirSync(executors);
  mkdirSync(fakeBin);
  writeFileSync(runner, String.raw`import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'list') {
  process.stdout.write('OpenCode Console Personal stored\n');
} else if (args[0] === 'models') {
  process.stdout.write('opencode/alpha-free\nopencode/beta-free\nopencode/gamma-free\n');
} else if (args[0] === 'run') {
  appendFileSync(process.env.FAKE_OPENCODE_LOG, args[args.indexOf('-m') + 1] + '\n');
  writeFileSync(path.join(process.cwd(), 'sumar.js'), 'export const sumar = (a, b) => a + b;\nexport const restar = (a, b) => a - b;\n');
  writeFileSync(path.join(process.cwd(), 'analizar.js'), [
    'export function analizar(texto) {',
    '  const personas = [];',
    '  for (const [i, linea] of texto.split(/\r?\n/).entries()) {',
    '    const valor = linea.trim();',
    '    if (!valor || valor.startsWith("#")) continue;',
    '    const campos = valor.split(";").map((campo) => campo.trim());',
    '    const edad = Number(campos[1]);',
    '    if (campos.length !== 3 || !Number.isInteger(edad) || edad < 0) throw new Error(String(i + 1));',
    '    personas.push({ nombre: campos[0], edad, ciudad: campos[2] });',
    '  }',
    '  return personas;',
    '}',
    'export function agrupar(personas) {',
    '  const ciudades = [...new Set(personas.map((persona) => persona.ciudad))].sort((a, b) => a.localeCompare(b));',
    '  return Object.fromEntries(ciudades.map((ciudad) => [ciudad, personas.filter((p) => p.ciudad === ciudad).map((p) => p.nombre).sort((a, b) => a.localeCompare(b))]));',
    '}',
  ].join('\n'));
  const report = { status: 'done', summary: 'Prueba sintética', filesChanged: ['sumar.js', 'analizar.js'] };
  const text = JSON.stringify(report);
  process.stdout.write(JSON.stringify({ type: 'text', part: { text } }) + '\n');
} else {
  process.exitCode = 1;
}
`);
  if (process.platform === 'win32') {
    writeFileSync(command, '@echo off\r\n"%NODE_EXE%" "%FAKE_OPENCODE_RUNNER%" %*\r\n');
  } else {
    writeFileSync(command, '#!/bin/sh\n"$NODE_EXE" "$FAKE_OPENCODE_RUNNER" "$@"\n');
    chmodSync(command, 0o755);
  }
  const now = new Date();
  writeFileSync(path.join(home, 'models-dev.json'), `${JSON.stringify({
    fetchedAt: now.toISOString(), opencode: { models: {} },
  })}\n`);
  saveChecks({
    lastRun: null, models: {},
    exhausted: { 'opencode/beta-free': { until: new Date(now.getTime() + 60_000).toISOString() } },
  }, home);
  const env = {
    ...process.env,
    AGENTRELAY_HOME: home,
    AGENTRELAY_EXECUTORS_DIR: executors,
    AGENTRELAY_REPORT_ROOT: reports,
    AGENTRELAY_NO_MIGRATE: '1',
    DEEPSEEK_API_KEY: undefined,
    PATH: fakeBin,
    NODE_EXE: process.execPath,
    FAKE_OPENCODE_RUNNER: runner,
    FAKE_OPENCODE_LOG: runLog,
  };
  delete env.NODE_TEST_CONTEXT;
  const run = (args = []) => spawnSync(process.execPath, [bin, '--cwd', cwd, 'executors', 'check', ...args], { cwd, encoding: 'utf8', env });
  try {
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const checks = JSON.parse(readFileSync(checksFile(home), 'utf8'));
    assert.deepEqual(checks.ranking.entries.map(({ id }) => id).sort(), ['opencode/alpha-free', 'opencode/gamma-free']);
    assert.deepEqual(readFileSync(runLog, 'utf8').trim().split(/\r?\n/).sort(), [
      'opencode/alpha-free', 'opencode/alpha-free', 'opencode/gamma-free', 'opencode/gamma-free',
    ]);
    const dailyReport = readFileSync(reportPath(reports), 'utf8');
    assert.match(dailyReport, /OpenCode: mejores gratuitos de hoy/);
    assert.match(dailyReport, /Agotados hoy: opencode\/beta-free/);
    assert.doesNotMatch(dailyReport, /opencode\/beta-free —/);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Ya se hizo hoy \(usa --force para repetirlo\)/);
    assert.equal(readFileSync(runLog, 'utf8').trim().split(/\r?\n/).length, 4);
    const forced = run(['--force']);
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(readFileSync(runLog, 'utf8').trim().split(/\r?\n/).length, 8);
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
