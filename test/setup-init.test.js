// Tests de los comandos setup e init ejecutando la CLI real como proceso hijo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOBAL_BLOCK, PROJECT_BLOCK } from '../src/instructions.js';
import { FAKE_CODEX, git, makeRepo } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function run(args, cwd, extra = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      SSH_CONNECTION: '', SSH_TTY: '', DISPLAY: '', WAYLAND_DISPLAY: '', WSL_DISTRO_NAME: '',
      ...extra,
    },
  });
}

function fakeCodexConfig(dir) {
  writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({
    executor: { type: 'codex', command: [process.execPath, FAKE_CODEX] },
  }));
}

test('setup --yes instala, es idempotente y --uninstall lo retira', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
  try {
    fakeCodexConfig(dir);
    const claude = path.join(dir, 'CLAUDE.md');

    const r1 = run(['setup', '--yes', '--claude-dir', dir], dir);
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /<!-- agentrelay:start -->/);
    assert.match(r1.stdout, /<!-- agentrelay:end -->/);
    assert.ok(r1.stdout.includes(claude));
    assert.match(r1.stdout, /agentrelay setup --uninstall/);
    const commandDir = path.join(dir, 'commands', 'ar');
    assert.ok(existsSync(path.join(commandDir, 'estado.md')));
    assert.match(r1.stdout, /comandos creados: 6/);
    assert.match(r1.stdout, /Comandos de Claude Code: \/ar:estado/);
    assert.equal(readFileSync(claude, 'utf8'), GLOBAL_BLOCK + '\n');

    // Repetirlo no cambia nada.
    const before = readFileSync(claude, 'utf8');
    const r2 = run(['setup', '--yes', '--claude-dir', dir], dir);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(readFileSync(claude, 'utf8'), before);
    assert.match(r2.stdout, /sin cambios/);

    // Con contenido previo lo conserva.
    const dir2 = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
    try {
      fakeCodexConfig(dir2);
      const claude2 = path.join(dir2, 'CLAUDE.md');
      writeFileSync(claude2, 'Contenido propio\n');
      const r3 = run(['setup', '--yes', '--claude-dir', dir2], dir2);
      assert.equal(r3.status, 0, r3.stderr);
      assert.equal(readFileSync(claude2, 'utf8'), 'Contenido propio\n\n' + GLOBAL_BLOCK + '\n');
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }

    // --uninstall retira el bloque y borra el archivo si solo tenía el bloque.
    const r4 = run(['setup', '--uninstall', '--yes', '--claude-dir', dir], dir);
    assert.equal(r4.status, 0, r4.stderr);
    assert.match(r4.stdout, /<!-- agentrelay:start -->/);
    assert.equal(existsSync(claude), false);
    assert.equal(existsSync(commandDir), false);
    const legacyDir = path.join(dir, 'commands', 'agentrelay');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(path.join(legacyDir, 'estado.md'), '<!-- agentrelay:managed --> old');
    const r5 = run(['setup', '--uninstall', '--yes', '--claude-dir', dir], dir);
    assert.equal(r5.status, 0, r5.stderr);
    assert.equal(existsSync(legacyDir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup --no-commands omite la instalación de comandos', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-no-commands-'));
  try {
    fakeCodexConfig(dir);
    const result = run(['setup', '--yes', '--no-commands', '--claude-dir', dir], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(dir, 'commands', 'ar')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup migra comandos gestionados antiguos y conserva archivos propios', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-legacy-'));
  try {
    fakeCodexConfig(dir);
    const oldDir = path.join(dir, 'commands', 'agentrelay');
    const newDir = path.join(dir, 'commands', 'ar');
    mkdirSync(oldDir, { recursive: true });
    writeFileSync(path.join(oldDir, 'estado.md'), '<!-- agentrelay:managed --> viejo');
    writeFileSync(path.join(oldDir, 'nota.md'), 'archivo propio');
    const result = run(['setup', '--yes', '--claude-dir', dir], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Comandos antiguos retirados \(ahora son \/ar:/);
    assert.ok(existsSync(path.join(newDir, 'estado.md')));
    assert.equal(existsSync(path.join(oldDir, 'estado.md')), false);
    assert.equal(readFileSync(path.join(oldDir, 'nota.md'), 'utf8'), 'archivo propio');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup sin --yes y sin TTY no escribe y sale con código 1', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-'));
  try {
    fakeCodexConfig(dir);
    const claude = path.join(dir, 'CLAUDE.md');
    const r = run(['setup', '--claude-dir', dir], dir);
    assert.equal(r.status, 1);
    assert.equal(existsSync(claude), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup --yes sugiere la cuenta y el login posterior sin iniciar sesión', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-login-'));
  const log = path.join(dir, 'calls.log');
  try {
    fakeCodexConfig(dir);
    const result = run(['setup', '--yes', '--claude-dir', dir], dir, { FAKE_CODEX_LOG: log, FAKE_CODEX_LOGGED_IN: '0' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /https:\/\/chatgpt\.com/);
    assert.match(result.stdout, /Puedes hacerlo más tarde con: agentrelay login/);
    assert.equal(existsSync(log) && readFileSync(log, 'utf8').includes('["login"]'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup --login inicia sesión con Codex y muestra el resultado', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-login-'));
  const log = path.join(dir, 'calls.log');
  const session = path.join(dir, 'session');
  try {
    fakeCodexConfig(dir);
    const result = run(['setup', '--yes', '--login', '--claude-dir', dir], dir, {
      FAKE_CODEX_LOG: log, FAKE_CODEX_LOGGED_IN: '0', FAKE_CODEX_SESSION_FILE: session,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✔ Sesión iniciada/);
    const browserPlatform = process.platform === 'win32' || process.platform === 'darwin';
    assert.equal(readFileSync(log, 'utf8').trim(), browserPlatform ? '["login"]' : '["login","--device-auth"]');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup con sesión activa la reconoce sin ejecutar login', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-login-'));
  const log = path.join(dir, 'calls.log');
  try {
    fakeCodexConfig(dir);
    const result = run(['setup', '--yes', '--claude-dir', dir], dir, { FAKE_CODEX_LOG: log, FAKE_CODEX_LOGGED_IN: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✔ Sesión activa: Logged in using ChatGPT/);
    assert.equal(existsSync(log) && readFileSync(log, 'utf8').includes('["login"]'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup omite el login para un ejecutor que no lo ofrece', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-setup-login-'));
  try {
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'cline' } }));
    const result = run(['setup', '--yes', '--claude-dir', dir], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Conectar ahora|Sesión activa|Puedes hacerlo más tarde/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init --yes en repo limpio crea CLAUDE.md y hace un commit solo de CLAUDE.md', () => {
  const repo = makeRepo();
  try {
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /<!-- agentrelay:start -->/);
    assert.match(r.stdout, /<!-- agentrelay:end -->/);
    assert.match(r.stdout, /el resto del archivo se conserva/);
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

test('init solo escribe en CLAUDE.md cuando no existe AGENTS.md', () => {
  const repo = makeRepo();
  try {
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), PROJECT_BLOCK + '\n');
    assert.equal(existsSync(path.join(repo.dir, 'AGENTS.md')), false);
  } finally {
    repo.cleanup();
  }
});

test('init escribe en CLAUDE.md y AGENTS.md cuando CLAUDE.md no importa AGENTS.md', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), 'Instrucciones de Claude\n');
    writeFileSync(path.join(repo.dir, 'AGENTS.md'), 'Instrucciones compartidas\n');
    const r = run(['init', '--yes'], repo.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(repo.dir, 'CLAUDE.md'), 'utf8'), 'Instrucciones de Claude\n\n' + PROJECT_BLOCK + '\n');
    assert.equal(readFileSync(path.join(repo.dir, 'AGENTS.md'), 'utf8'), 'Instrucciones compartidas\n\n' + PROJECT_BLOCK + '\n');
  } finally {
    repo.cleanup();
  }
});

test('init solo escribe en AGENTS.md cuando CLAUDE.md lo importa y es idempotente', () => {
  const repo = makeRepo();
  try {
    const claude = path.join(repo.dir, 'CLAUDE.md');
    const agents = path.join(repo.dir, 'AGENTS.md');
    const claudeContent = 'Instrucciones de Claude\n@AGENTS.md\n';
    writeFileSync(claude, claudeContent);
    writeFileSync(agents, 'Instrucciones compartidas\n');

    const first = run(['init', '--yes'], repo.dir);
    assert.equal(first.status, 0, first.stderr);
    const agentsContent = readFileSync(agents, 'utf8');
    assert.equal(readFileSync(claude, 'utf8'), claudeContent);
    assert.equal(agentsContent, 'Instrucciones compartidas\n\n' + PROJECT_BLOCK + '\n');

    const second = run(['init', '--yes'], repo.dir);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(claude, 'utf8'), claudeContent);
    assert.equal(readFileSync(agents, 'utf8'), agentsContent);
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
