import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executorsDir, installExecutor, isInstalled } from '../src/executors/catalog.js';
import { authStatus as opencodeAuthStatus, commandParts as opencodeCommandParts } from '../src/executors/opencode.js';
import { runProcess } from '../src/proc.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const FAKE_OPENCODE = fileURLToPath(new URL('./fixtures/fake-opencode.mjs', import.meta.url));

function temporary(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cli(cwd, args, env = {}) {
  return spawnSync(process.execPath, [BIN, '--cwd', cwd, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('executorsDir permite una carpeta por variable de entorno', () => {
  assert.equal(executorsDir({ AGENTRELAY_EXECUTORS_DIR: 'custom/path' }, 'home'), 'custom/path');
  assert.equal(executorsDir({}, 'home'), path.join('home', '.agentrelay', 'executors'));
});

test('OpenCode se instala con npm y queda detectable en la carpeta gestionada', async () => {
  const dir = temporary('agentrelay-opencode-');
  try {
    let call;
    await installExecutor('opencode', {
      dir,
      run: async (...args) => {
        call = args;
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    assert.equal(call[0], 'npm');
    assert.deepEqual(call[1], ['install', '--prefix', dir, '--no-audit', '--no-fund', 'opencode-ai@1']);
    const link = path.join(dir, 'node_modules', '.bin', `opencode${process.platform === 'win32' ? '.cmd' : ''}`);
    assert.equal(await isInstalled('opencode', { dir, env: { PATH: '' }, exists: (file) => file === link }), true);
    assert.equal(await isInstalled('opencode', { dir, env: { PATH: '' }, exists: () => false }), false);
    assert.equal(await isInstalled('opencode', {
      dir,
      env: { PATH: path.join(dir, 'bin') },
      exists: (file) => file === path.join(dir, 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode'),
    }), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('OpenCode commandParts prioriza el enlace gestionado y conserva los comandos explícitos', () => {
  const dir = path.join('user', 'executors');
  const link = path.join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  assert.deepEqual(opencodeCommandParts('opencode', { executorsDir: dir, exists: (file) => file === link }), [link]);
  assert.deepEqual(opencodeCommandParts('opencode', { executorsDir: dir, exists: () => false }), ['opencode']);
  assert.deepEqual(opencodeCommandParts('/custom/opencode', { executorsDir: dir, exists: () => true }), ['/custom/opencode']);
});

test('OpenCode authStatus reconoce cuentas guardadas y conserva el motivo cuando falla', async () => {
  const executor = { command: [process.execPath, FAKE_OPENCODE] };
  const check = (env) => opencodeAuthStatus(executor, {
    run: (command, args, options) => runProcess(command, args, {
      ...options,
      env: { ...process.env, ...env },
    }),
  });

  assert.deepEqual(await check({ FAKE_OPENCODE_AUTH_OUTPUT: 'stored\n' }), { ok: true, message: 'stored' });
  assert.deepEqual(await check({ FAKE_OPENCODE_AUTH_OUTPUT: 'OpenCode Console  Personal  stored\nOpenCode Zen  API key  active\n' }), {
    ok: true, message: 'OpenCode Console  Personal  stored',
  });
  const empty = await check({ FAKE_OPENCODE_AUTH_OUTPUT: 'No authenticated integrations\n' });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /agentrelay login opencode/);
  assert.deepEqual(await check({ FAKE_OPENCODE_AUTH_OUTPUT: 'OpenCode Zen  API key  active\n' }), {
    ok: true, message: 'OpenCode Zen  API key  active',
  });
  const failed = await check({ FAKE_OPENCODE_AUTH_OUTPUT: 'credential store unavailable\n', FAKE_OPENCODE_AUTH_CODE: '2' });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /credential store unavailable/);
});

test('login opencode sin instalar su ejecutor y login con un nombre desconocido muestran un error', () => {
  const cwd = temporary('agentrelay-login-opencode-');
  try {
    const env = {
      AGENTRELAY_HOME: path.join(cwd, 'home'),
      AGENTRELAY_EXECUTORS_DIR: path.join(cwd, 'executors'),
      AGENTRELAY_NO_MIGRATE: '1',
      PATH: '',
    };
    const missing = cli(cwd, ['login', 'opencode'], env);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Instálalo con: agentrelay executors add opencode/);
    const unknown = cli(cwd, ['login', 'xyz'], env);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Ejecutor no admitido para login: xyz/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('use --list muestra el estado, el ejecutor activo y una instalación del directorio de usuario', async () => {
  const cwd = temporary('agentrelay-list-');
  const dir = path.join(cwd, 'user-executors');
  try {
    const env = {
      AGENTRELAY_EXECUTORS_DIR: dir,
      AGENTRELAY_HOME: path.join(cwd, 'home'),
    };
    let listed = cli(cwd, ['use', '--list'], env);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Codex \(OpenAI\) \(codex\) · instalado · cuenta de ChatGPT · en uso/);
    assert.match(listed.stdout, /OpenCode \(opencode\) · (instalado|no instalado) · gratis/);

    const bin = path.join(dir, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, process.platform === 'win32' ? 'opencode.cmd' : 'opencode'), '');
    assert.equal(await isInstalled('opencode', { dir }), true);
    listed = cli(cwd, ['use', '--list'], env);
    assert.match(listed.stdout, /OpenCode \(opencode\) · instalado · gratis/);

    const codex = cli(cwd, ['executors', 'add', 'codex'], env);
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(codex.stdout, /Codex ya viene incluido con AgentRelay/);
    const unknown = cli(cwd, ['executors', 'add', 'foo'], env);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /codex, opencode/);
    const retired = cli(cwd, ['executors', 'add', 'cline'], env);
    assert.equal(retired.status, 1);
    assert.match(retired.stderr, /Ejecutor desconocido: cline[\s\S]*Cline se retiró; usa: agentrelay use opencode deepseek\/deepseek-flash/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
