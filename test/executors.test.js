import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executorsDir, installExecutor, isInstalled } from '../src/executors/catalog.js';
import { findBundledCline } from '../src/executors/cline.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

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

test('installExecutor crea el package.json aislado e invoca npm sin red en la prueba', async () => {
  const dir = temporary('agentrelay-executors-');
  try {
    let call;
    const result = await installExecutor('cline', {
      dir,
      run: async (...args) => {
        call = args;
        return { code: 0, stdout: 'ok', stderr: '' };
      },
    });
    assert.deepEqual(call[0], 'npm');
    assert.deepEqual(call[1], ['install', '--prefix', dir, '--no-audit', '--no-fund', 'cline@3']);
    assert.equal(call[2].timeoutMs, 10 * 60 * 1000);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')), {
      name: 'agentrelay-executors', private: true,
    });
    assert.deepEqual(result, { ok: true, error: null, output: 'ok' });
    const failure = await installExecutor('cline', {
      dir,
      run: async () => ({ code: 1, stdout: '', stderr: 'network disabled' }),
    });
    assert.equal(failure.ok, false);
    assert.match(failure.error, /código 1/);
    assert.equal(failure.output, 'network disabled');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findBundledCline prioriza AgentRelay y encuentra la carpeta de ejecutores', () => {
  const root = path.join('project');
  const dir = path.join('user', 'executors');
  const projectBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cline.cmd' : 'cline');
  const managedBin = path.join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'cline.cmd' : 'cline');
  const managedLauncher = path.join(dir, 'node_modules', 'cline', 'bin', 'cline');
  assert.deepEqual(findBundledCline(root, (file) => file === projectBin || file === managedBin, dir), [projectBin]);
  assert.deepEqual(findBundledCline(root, (file) => file === managedBin, dir), [managedBin]);
  assert.deepEqual(findBundledCline(root, (file) => file === managedLauncher, dir), [process.execPath, managedLauncher]);
});

test('executors lista el estado, la configuración activa y una instalación del directorio de usuario', async () => {
  const cwd = temporary('agentrelay-list-');
  const dir = path.join(cwd, 'user-executors');
  try {
    const env = { AGENTRELAY_EXECUTORS_DIR: dir };
    let listed = cli(cwd, ['executors'], env);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Codex \(OpenAI\) \(codex\) — incluido · en uso/);
    assert.match(listed.stdout, /Cline \(cline\) — no instalado/);
    assert.match(listed.stdout, /OpenCode \(opencode\) — (instalado|no instalado)/);

    const bin = path.join(dir, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, process.platform === 'win32' ? 'cline.cmd' : 'cline'), '');
    assert.equal(await isInstalled('cline', { dir }), true);
    listed = cli(cwd, ['executors'], env);
    assert.match(listed.stdout, /Cline \(cline\) — instalado/);

    const codex = cli(cwd, ['executors', 'add', 'codex'], env);
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(codex.stdout, /Codex ya viene incluido con AgentRelay/);
    const unknown = cli(cwd, ['executors', 'add', 'foo'], env);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /codex, cline/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('setup --executors cline usa un npm falso y escribe solo en la carpeta de ejecutores', () => {
  const cwd = temporary('agentrelay-setup-executor-');
  const dir = path.join(cwd, 'managed');
  const npmDir = path.join(cwd, 'fake-npm');
  const log = path.join(cwd, 'npm-args.log');
  try {
    mkdirSync(npmDir);
    if (process.platform === 'win32') {
      writeFileSync(path.join(npmDir, 'npm.cmd'), '@echo off\r\necho %* > "%FAKE_NPM_LOG%"\r\nexit /b 0\r\n');
    } else {
      const script = path.join(npmDir, 'npm');
      writeFileSync(script, '#!/bin/sh\nprintf "%s\\n" "$*" > "$FAKE_NPM_LOG"\nexit 0\n');
      chmodSync(script, 0o755);
    }
    const env = {
      AGENTRELAY_EXECUTORS_DIR: dir,
      FAKE_NPM_LOG: log,
      PATH: `${npmDir}${path.delimiter}${process.env.PATH || process.env.Path || ''}`,
    };
    const setup = cli(cwd, ['setup', '--yes', '--claude-dir', cwd, '--executors', 'cline'], env);
    assert.equal(setup.status, 0, setup.stderr);
    assert.match(setup.stdout, /Cline instalado en/);
    assert.match(setup.stdout, /agentrelay use cline/);
    assert.ok(existsSync(path.join(dir, 'package.json')));
    assert.ok(readFileSync(log, 'utf8').includes('install'));
    assert.ok(readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8').includes('agentrelay:start'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('doctor explica cómo instalar Cline no instalado', () => {
  const cwd = temporary('agentrelay-doctor-cline-');
  const dir = path.join(cwd, 'managed');
  try {
    writeFileSync(path.join(cwd, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'cline' } }));
    const result = cli(cwd, ['doctor'], { AGENTRELAY_EXECUTORS_DIR: dir });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Ejecutor cline no disponible[\s\S]*Instálalo con "agentrelay executors add cline"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
