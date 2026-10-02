import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-update-'));
  const bare = path.join(dir, 'origin.git'), install = path.join(dir, 'install'), writer = path.join(dir, 'writer');
  git(dir, 'init', '--bare', '-q', bare);
  git(dir, 'clone', '-q', bare, writer);
  git(writer, 'config', 'user.name', 'Test'); git(writer, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(path.join(writer, 'package.json'), '{"name":"fake-install","version":"1.0.0"}\n');
  writeFileSync(path.join(writer, 'package-lock.json'), '{"name":"fake-install","lockfileVersion":3,"packages":{}}\n');
  git(writer, 'add', '-A'); git(writer, 'commit', '-q', '-m', 'initial'); git(writer, 'branch', '-M', 'main'); git(writer, 'push', '-q', '-u', 'origin', 'main');
  git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(dir, 'clone', '-q', bare, install);
  git(install, 'config', 'user.name', 'Test'); git(install, 'config', 'user.email', 'test@example.invalid');
  const npmDir = path.join(dir, 'npm'), npmLog = path.join(dir, 'npm.log');
  const home = path.join(dir, 'home');
  mkdirSync(npmDir, { recursive: true });
  if (process.platform === 'win32') writeFileSync(path.join(npmDir, 'npm.cmd'), '@echo off\r\necho %*>>"%FAKE_NPM_LOG%"\r\nexit /b 0\r\n');
  else { const script = path.join(npmDir, 'npm'); writeFileSync(script, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_NPM_LOG"\nexit 0\n'); chmodSync(script, 0o755); }
  return { dir, bare, install, writer, npmDir, npmLog, home };
}
function run(f, ...args) {
  return spawnSync(process.execPath, [BIN, 'update', ...args], { cwd: f.dir, encoding: 'utf8', env: {
    ...process.env, AGENTRELAY_INSTALL_DIR: f.install, AGENTRELAY_HOME: f.home,
    AGENTRELAY_NO_MIGRATE: '1', AGENTRELAY_NO_STATE: '1', FAKE_NPM_LOG: f.npmLog,
    PATH: `${f.npmDir}${path.delimiter}${process.env.PATH || process.env.Path || ''}`,
  } });
}
function advance(f, message = 'new release') {
  writeFileSync(path.join(f.writer, 'release.txt'), `${message}\n`);
  git(f.writer, 'add', '-A'); git(f.writer, 'commit', '-q', '-m', message); git(f.writer, 'push', '-q');
}
function cleanup(f) { rmSync(f.dir, { recursive: true, force: true }); }

test('update informa cuando ya está al día', () => {
  const f = fixture(); try { const r = run(f); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Ya tienes la última versión/); assert.equal(existsSync(f.npmLog), false); } finally { cleanup(f); }
});

test('update --check lista commits sin cambiar la instalación', () => {
  const f = fixture(); try { advance(f, 'release visible'); const before = git(f.install, 'rev-parse', 'HEAD'); const r = run(f, '--check'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /release visible/); assert.equal(git(f.install, 'rev-parse', 'HEAD'), before); assert.equal(existsSync(f.npmLog), false); } finally { cleanup(f); }
});

test('update --yes avanza, corre npm ci y deja package-lock intacto', () => {
  const f = fixture(); try { advance(f); const r = run(f, '--yes'); assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); assert.match(r.stdout, /Actualización:/); assert.equal(git(f.install, 'rev-parse', 'HEAD'), git(f.writer, 'rev-parse', 'HEAD')); assert.match(readFileSync(f.npmLog, 'utf8'), /ci/); assert.equal(git(f.install, 'status', '--porcelain').trim(), ''); } finally { cleanup(f); }
});

test('update aborta sin tocar una instalación sucia', () => {
  const f = fixture(); try { writeFileSync(path.join(f.install, 'local.txt'), 'local'); const r = run(f, '--yes'); assert.equal(r.status, 1); assert.match(r.stderr, /cambios locales/); assert.equal(existsSync(f.npmLog), false); } finally { cleanup(f); }
});

test('update aborta ante divergencia', () => {
  const f = fixture(); try { writeFileSync(path.join(f.install, 'local.txt'), 'local'); git(f.install, 'add', '-A'); git(f.install, 'commit', '-q', '-m', 'local commit'); advance(f); const before = git(f.install, 'rev-parse', 'HEAD'); const r = run(f, '--yes'); assert.equal(r.status, 1); assert.match(r.stderr, /no están/); assert.equal(git(f.install, 'rev-parse', 'HEAD'), before); assert.equal(existsSync(f.npmLog), false); } finally { cleanup(f); }
});

test('update rechaza una instalación que no es un checkout git', () => {
  const f = fixture(); try { rmSync(path.join(f.install, '.git'), { recursive: true, force: true }); const r = run(f, '--yes'); assert.equal(r.status, 1); assert.match(r.stderr, /npm i -g/); } finally { cleanup(f); }
});
