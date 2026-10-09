import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_CODEX } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function setup({ apiFallback } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-login-api-'));
  const home = path.join(dir, 'agentrelay-home');
  const log = path.join(dir, 'calls.log');
  const codexHome = path.join(dir, 'chatgpt-codex');
  const executor = { type: 'codex', command: [process.execPath, FAKE_CODEX] };
  if (apiFallback !== undefined) executor.apiFallback = apiFallback;
  writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor }, null, 2));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return { dir, home, log, codexHome, apiHome: path.join(home, 'codex-api') };
}

function cli(context, args, { input, ...extra } = {}) {
  return spawnSync(process.execPath, [BIN, '--cwd', context.dir, ...args], {
    cwd: context.dir,
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      HOME: context.dir,
      USERPROFILE: context.dir,
      AGENTRELAY_HOME: context.home,
      AGENTRELAY_NO_MIGRATE: '1',
      CODEX_HOME: context.codexHome,
      FAKE_CODEX_LOG: context.log,
      ...extra,
    },
  });
}

test('login --api guarda la clave en el perfil separado y nunca la muestra', () => {
  const context = setup();
  const key = 'sk-secret-api-test';
  try {
    const result = cli(context, ['login', '--api'], { input: `${key}\n` });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(context.apiHome, 'auth.json')), true);
    assert.match(result.stdout, /Respaldo por API de pago configurado/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(key));
    assert.equal(existsSync(path.join(context.codexHome, 'auth.json')), false);
  } finally { rmSync(context.dir, { recursive: true, force: true }); }
});

test('login --api --remove elimina solo el perfil y permite repetirlo', () => {
  const context = setup();
  try {
    mkdirSync(context.apiHome, { recursive: true });
    writeFileSync(path.join(context.apiHome, 'auth.json'), '{}');
    const removed = cli(context, ['login', '--api', '--remove']);
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /Respaldo por API eliminado/);
    assert.equal(existsSync(context.apiHome), false);
    const repeated = cli(context, ['login', '--api', '--remove']);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /No había respaldo por API/);
    mkdirSync(context.apiHome, { recursive: true });
    writeFileSync(path.join(context.apiHome, 'auth.json'), '{}');
    writeFileSync(path.join(context.dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'opencode' } }));
    const removedWithOtherExecutor = cli(context, ['login', '--api', '--remove']);
    assert.equal(removedWithOtherExecutor.status, 0, removedWithOtherExecutor.stderr);
    assert.equal(existsSync(context.apiHome), false);
  } finally { rmSync(context.dir, { recursive: true, force: true }); }
});

test('login --api rechaza la entrada vacía y combinaciones no válidas', () => {
  const context = setup();
  try {
    const empty = cli(context, ['login', '--api'], { input: ' \n' });
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /clave de API está vacía/);
    const positional = cli(context, ['login', '--api', 'opencode']);
    assert.equal(positional.status, 1);
    assert.match(positional.stderr, /no se puede combinar/);
    const device = cli(context, ['login', '--api', '--device']);
    assert.equal(device.status, 1);
    assert.match(device.stderr, /no se puede combinar/);
  } finally { rmSync(context.dir, { recursive: true, force: true }); }
});

test('doctor muestra los tres estados del respaldo por API y set permite desactivarlo', () => {
  const context = setup();
  try {
    const env = { FAKE_CODEX_LOGGED_IN: '1' };
    const missing = cli(context, ['doctor'], env);
    assert.match(missing.stdout, /Respaldo por API de pago: no configurado/);

    mkdirSync(context.apiHome, { recursive: true });
    writeFileSync(path.join(context.apiHome, 'auth.json'), '{}');
    const configured = cli(context, ['doctor'], env);
    assert.match(configured.stdout, /Respaldo por API de pago: configurado/);

    writeFileSync(path.join(context.dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'codex', command: [process.execPath, FAKE_CODEX], apiFallback: false } }, null, 2));
    const off = cli(context, ['doctor'], env);
    assert.match(off.stdout, /Respaldo por API de pago: desactivado \(executor\.apiFallback = false\)/);
  } finally { rmSync(context.dir, { recursive: true, force: true }); }
});

test('el informe avisa cuando el ejecutor usa API tras agotar la cuota gratuita', () => {
  const context = setup();
  try {
    mkdirSync(context.apiHome, { recursive: true });
    writeFileSync(path.join(context.apiHome, 'auth.json'), '{}');
    const taskFile = path.join(context.dir, 'task.json');
    writeFileSync(taskFile, JSON.stringify({
      title: 'Informe con API', objective: 'Ejecutar una tarea simulada', context: '', type: 'feature', complexity: 'normal',
      files: [], acceptanceCriteria: [], validation: [], doNotModify: [],
    }));
    const result = cli(context, ['run', taskFile, '--allow-dirty'], {
      FAKE_CODEX_LOGGED_IN: '1',
      FAKE_CODEX_QUOTA_UNLESS_HOME: context.apiHome,
    });
    assert.ok(result.status === 0 || result.status === 2, result.stderr + result.stdout);
    const runIds = readdirSync(path.join(context.dir, '.agentrelay', 'runs'));
    assert.equal(runIds.length, 1);
    const report = path.join(context.dir, '.agentrelay', 'runs', runIds[0], 'report.md');
    const text = readFileSync(report, 'utf8');
    assert.match(text, /la cuota gratuita de ChatGPT se agotó y este trabajo se hizo con tu clave de API/);
  } finally { rmSync(context.dir, { recursive: true, force: true }); }
});

test('set executor.apiFallback valida y guarda el booleano en el proyecto', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-apifallback-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'codex' } }, null, 2));
    const env = { ...process.env, AGENTRELAY_HOME: path.join(dir, 'home'), AGENTRELAY_NO_MIGRATE: '1' };
    const run = (args) => spawnSync(process.execPath, [BIN, '--cwd', dir, ...args], { cwd: dir, encoding: 'utf8', env });
    const ok = run(['set', 'executor.apiFallback', 'false', '--local']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(path.join(dir, 'agentrelay.config.json'), 'utf8'), /"apiFallback": false/);
    const bad = run(['set', 'executor.apiFallback', 'quizas', '--local']);
    assert.equal(bad.status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
