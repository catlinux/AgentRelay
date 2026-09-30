// Tests de los comandos setup e init ejecutando la CLI real como proceso hijo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOBAL_BLOCK, PROJECT_BLOCK } from '../src/instructions.js';
import { git, makeRepo } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function run(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
}

test('setup --yes instala, es idempotente y --uninstall lo retira', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
  try {
    const claude = path.join(dir, 'CLAUDE.md');

    const r1 = run(['setup', '--yes', '--claude-dir', dir]);
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(readFileSync(claude, 'utf8'), GLOBAL_BLOCK + '\n');

    // Repetirlo no cambia nada.
    const before = readFileSync(claude, 'utf8');
    const r2 = run(['setup', '--yes', '--claude-dir', dir]);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(readFileSync(claude, 'utf8'), before);

    // Con contenido previo lo conserva.
    const dir2 = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
    try {
      const claude2 = path.join(dir2, 'CLAUDE.md');
      writeFileSync(claude2, 'Contenido propio\n');
      const r3 = run(['setup', '--yes', '--claude-dir', dir2]);
      assert.equal(r3.status, 0, r3.stderr);
      assert.equal(readFileSync(claude2, 'utf8'), 'Contenido propio\n\n' + GLOBAL_BLOCK + '\n');
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }

    // --uninstall retira el bloque y borra el archivo si solo tenía el bloque.
    const r4 = run(['setup', '--uninstall', '--yes', '--claude-dir', dir]);
    assert.equal(r4.status, 0, r4.stderr);
    assert.equal(existsSync(claude), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup sin --yes y sin TTY no escribe y sale con código 1', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
  try {
    const claude = path.join(dir, 'CLAUDE.md');
    const r = run(['setup', '--claude-dir', dir]);
    assert.equal(r.status, 1);
    assert.equal(existsSync(claude), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --yes en repo limpio crea CLAUDE.md y hace un commit solo de CLAUDE.md', () => {
  const repo = makeRepo();
  try {
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), PROJECT_BLOCK + '\n');
    // Repo limpio tras el commit.
    assert.equal(git(repo.dir, 'status', '--porcelain', '--untracked-files=all').trim(), '');
    const names = git(repo.dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split(/\r?\n/).filter(Boolean);
    assert.deepEqual(names, ['CLAUDE.md']);
  } finally {
    repo.cleanup();
  }
});

test('init sin --yes en repo limpio crea CLAUDE.md pero no hace commit', () => {
  const repo = makeRepo();
  try {
    const r = run(['init'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), PROJECT_BLOCK + '\n');
    const status = git(repo.dir, 'status', '--porcelain', '--untracked-files=all').trim();
    assert.ok(status.includes('CLAUDE.md'));
  } finally {
    repo.cleanup();
  }
});

test('init --yes conserva el contenido propio de CLAUDE.md', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), 'Contenido propio\n');
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), 'Contenido propio\n\n' + PROJECT_BLOCK + '\n');
  } finally {
    repo.cleanup();
  }
});

test('init --yes en repo con cambios pendientes añade el bloque pero no hace commit', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'extra.txt'), 'cambio\n');
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), PROJECT_BLOCK + '\n');
    const status = git(repo.dir, 'status', '--porcelain', '--untracked-files=all').trim();
    assert.ok(status.includes('extra.txt'));
    assert.ok(status.includes('CLAUDE.md'));
    const names = git(repo.dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split(/\r?\n/).filter(Boolean);
    assert.ok(!names.includes('CLAUDE.md'));
  } finally {
    repo.cleanup();
  }
});

test('init --yes con CLAUDE.md en .gitignore no intenta el commit', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, '.gitignore'), 'CLAUDE.md\n');
    git(repo.dir, 'add', '-A');
    git(repo.dir, 'commit', '-q', '-m', 'gitignore');
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), PROJECT_BLOCK + '\n');
    assert.equal(git(repo.dir, 'status', '--porcelain', '--untracked-files=all').trim(), '');
    const names = git(repo.dir, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split(/\r?\n/).filter(Boolean);
    assert.ok(!names.includes('CLAUDE.md'));
  } finally {
    repo.cleanup();
  }
});

test('init --with-config crea agentrelay.config.json', () => {
  const repo = makeRepo();
  try {
    const r = run(['init', '--yes', '--with-config'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(path.join(repo.dir, 'agentrelay.config.json')));
    assert.ok(existsSync(path.join(repo.dir, 'CLAUDE.md')));
  } finally {
    repo.cleanup();
  }
});
