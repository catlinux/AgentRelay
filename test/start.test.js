import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function run(cwd, args = ['start', '--yes']) {
  return spawnSync(process.execPath, [BIN, '--cwd', cwd, ...args], {
    cwd, encoding: 'utf8', env: {
      ...process.env,
      AGENTRELAY_HOME: path.join(cwd, 'home'),
      AGENTRELAY_EXECUTORS_DIR: path.join(cwd, 'executors'),
      AGENTRELAY_NO_MIGRATE: '1',
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'Test',
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'test@example.invalid',
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? 'Test',
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? 'test@example.invalid',
    },
  });
}

function temp(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-start-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

test('start prepara una carpeta nueva, crea el estado y muestra el mensaje al orquestador', (t) => {
  const dir = temp(t);
  const result = run(dir);
  assert.ok(['0', '1'].includes(String(result.status)), result.stderr);
  assert.equal(git(dir, ['rev-parse', '--is-inside-work-tree']).stdout.trim(), 'true');
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.agentrelay/ESTADO.md']) assert.ok(readFileSync(path.join(dir, file), 'utf8'));
  assert.match(result.stdout, /Mensaje para tu orquestador \(pégalo en su chat\):/);
  assert.match(result.stdout, /Sigue lo que hace el ejecutor con: agentrelay watch/);
  assert.equal(git(dir, ['status', '--porcelain']).stdout.trim(), '');
});

test('start es idempotente y conserva el mensaje en la segunda ejecución', (t) => {
  const dir = temp(t);
  run(dir);
  const result = run(dir);
  assert.match(result.stdout, /Mensaje para tu orquestador/);
  assert.equal(git(dir, ['status', '--porcelain']).stdout.trim(), '');
});

test('start confirma cambios no sensibles con --yes', (t) => {
  const dir = temp(t);
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', 'base.txt']);
  git(dir, ['commit', '-qm', 'base']);
  writeFileSync(path.join(dir, 'nota.txt'), 'pendiente\n');
  const result = run(dir);
  assert.match(git(dir, ['log', '-1', '--pretty=%s']).stdout, /^Estado inicial$/m);
  assert.equal(git(dir, ['status', '--porcelain']).stdout.trim(), '');
  assert.match(result.stdout, /Mensaje para tu orquestador/);
});

test('start no confirma un archivo sensible con --yes', (t) => {
  const dir = temp(t);
  git(dir, ['init', '-q']);
  writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', 'base.txt']);
  git(dir, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base']);
  writeFileSync(path.join(dir, '.env.local'), 'SECRET=value\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /archivos sensibles/);
  assert.doesNotMatch(git(dir, ['log', '--all', '--pretty=%s']).stdout, /Estado inicial/);
});

test('start sin --yes y sin terminal no confirma cambios pendientes', (t) => {
  const dir = temp(t);
  git(dir, ['init', '-q']);
  writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', 'base.txt']);
  git(dir, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base']);
  writeFileSync(path.join(dir, 'nota.txt'), 'pendiente\n');
  const result = run(dir, ['start']);
  assert.match(result.stderr, /árbol limpio para delegar/);
  assert.equal(git(dir, ['log', '--all', '--pretty=%s']).stdout.includes('Estado inicial'), false);
  assert.notEqual(git(dir, ['status', '--porcelain']).stdout.trim(), '');
});
