// Tests de `agentrelay init` en carpetas sin repositorio git, ejecutando la CLI
// real como proceso hijo, más tests unitarios de src/prepare.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_BLOCK } from '../src/instructions.js';
import { DEFAULT_GITIGNORE, describePlan, looksPublic, scanFolder, SENSITIVE_PATTERNS } from '../src/prepare.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

// Identidad de git usada para que los commits de los tests funcionen.
const GIT_IDENT = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

// Configuración global vacía para que git no lea la del usuario del equipo.
const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), `agentrelay-test-gitconfig-${process.pid}-${Date.now()}`);
writeFileSync(EMPTY_GIT_CONFIG, '');

function gitEnv(extra = {}) {
  return { GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG, GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

function fullEnv(extra = {}) {
  return { ...process.env, ...gitEnv(), ...extra };
}

function runCli(args, cwd, { env = fullEnv(), input } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env, input });
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: fullEnv() });
}

test('init --yes en una carpeta sin git prepara el repositorio y hace un único commit', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const r = runCli(['init', '--yes'], dir, { env: fullEnv(GIT_IDENT) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(path.join(dir, '.git')));
    assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), DEFAULT_GITIGNORE);
    assert.equal(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
    assert.equal(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), PROJECT_BLOCK + '\n');
    assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '1');
    const names = git(dir, 'ls-tree', '-r', '--name-only', 'HEAD').split(/\r?\n/).filter(Boolean).sort();
    assert.deepEqual(names, ['.gitignore', 'AGENTS.md', 'CLAUDE.md'].sort());
    assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all').trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --yes deja fuera los archivos sensibles y los menciona en la salida', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), '<html></html>\n');
    writeFileSync(path.join(dir, '.env'), 'SECRETO=1\n');
    writeFileSync(path.join(dir, 'clave.pem'), 'PRIVATE KEY\n');
    const r = runCli(['init', '--yes'], dir, { env: fullEnv(GIT_IDENT) });
    assert.equal(r.status, 0, r.stderr);
    const tracked = git(dir, 'ls-files').split(/\r?\n/).filter(Boolean);
    assert.ok(tracked.includes('index.html'));
    assert.ok(!tracked.includes('.env'));
    assert.ok(!tracked.includes('clave.pem'));
    assert.ok(r.stdout.includes('.env'), r.stdout);
    assert.ok(r.stdout.includes('clave.pem'), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --yes respeta un .gitignore existente', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const existing = 'clave.pem\n';
    writeFileSync(path.join(dir, '.gitignore'), existing);
    const r = runCli(['init', '--yes'], dir, { env: fullEnv(GIT_IDENT) });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), existing);
    assert.ok(r.stdout.includes('Se respetará el .gitignore existente'), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init sin --yes y sin terminal interactivo no cambia nada y sale con código 1', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const r = runCli(['init'], dir, { env: fullEnv(GIT_IDENT) });
    assert.equal(r.status, 1);
    assert.equal(existsSync(path.join(dir, '.git')), false);
    assert.equal(existsSync(path.join(dir, 'CLAUDE.md')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('init avisa cuando la carpeta parece servida públicamente', () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const dir = path.join(base, 'public_html', 'sitio');
    mkdirSync(dir, { recursive: true });
    const r = runCli(['init', '--yes'], dir, { env: fullEnv(GIT_IDENT) });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('servida públicamente'), r.stdout);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('run, watch y show fuera de un repositorio indican ejecutar agentrelay init', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const task = path.join(dir, 'task.json');
    writeFileSync(task, '{"objective":"test"}');
    for (const args of [['run', task], ['watch'], ['show']]) {
      const r = runCli(args, dir, { env: fullEnv() });
      assert.equal(r.status, 1, `${args[0]} debería fallar: ${r.stderr}`);
      assert.ok(r.stderr.includes('agentrelay init'), `${args[0]}: ${r.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --yes sin identidad de git deja el repositorio creado y explica cómo configurarla', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-init-'));
  try {
    const env = fullEnv();
    delete env.GIT_AUTHOR_NAME;
    delete env.GIT_AUTHOR_EMAIL;
    delete env.GIT_COMMITTER_NAME;
    delete env.GIT_COMMITTER_EMAIL;
    // En macOS (y en algunos Linux) git deduce una identidad del usuario del sistema:
    // useConfigOnly obliga a que venga de la configuración, como en una instalación nueva.
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'user.useConfigOnly';
    env.GIT_CONFIG_VALUE_0 = 'true';
    const r = runCli(['init', '--yes'], dir, { env });
    assert.equal(r.status, 1);
    assert.ok(existsSync(path.join(dir, '.git')));
    assert.ok(r.stderr.includes('user.name'), r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare.js exporta los símbolos esperados', () => {
  assert.equal(typeof DEFAULT_GITIGNORE, 'string');
  const patrones = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'id_ed25519*', 'credentials.json', 'secrets.json', 'node_modules/', '.agentrelay/', '*.log', '.DS_Store', 'Thumbs.db'];
  for (const pattern of patrones) assert.ok(DEFAULT_GITIGNORE.includes(pattern), pattern);
  assert.ok(Array.isArray(SENSITIVE_PATTERNS));
  assert.ok(SENSITIVE_PATTERNS.length >= 4);
});


test('scanFolder ignora .git/node_modules/.agentrelay, detecta sensibles y respeta limit', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-scan-'));
  try {
    writeFileSync(path.join(dir, '.env'), 'A=1\n');
    writeFileSync(path.join(dir, 'clave.pem'), 'pem\n');
    writeFileSync(path.join(dir, 'id_rsa'), 'rsa\n');
    writeFileSync(path.join(dir, 'normal.txt'), 'ok\n');
    mkdirSync(path.join(dir, '.git'));
    writeFileSync(path.join(dir, '.git', 'config'), 'x\n');
    mkdirSync(path.join(dir, 'node_modules'));
    writeFileSync(path.join(dir, 'node_modules', 'dep.js'), 'x\n');
    mkdirSync(path.join(dir, '.agentrelay'));
    writeFileSync(path.join(dir, '.agentrelay', 'runs.json'), 'x\n');
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'sub', 'credentials.json'), '{}');

    const scan = scanFolder(dir);
    assert.equal(scan.count, 5);
    assert.equal(scan.truncated, false);
    assert.deepEqual([...scan.sensitive].sort(), ['.env', 'clave.pem', 'id_rsa', 'sub/credentials.json'].sort());
    assert.equal(scan.sample.length, 5);

    const limited = scanFolder(dir, { limit: 2 });
    assert.equal(limited.count, 2);
    assert.equal(limited.truncated, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('looksPublic detecta directorios servidos públicamente', () => {
  assert.equal(looksPublic('/var/www/x'), true);
  assert.equal(looksPublic(path.join('C:', 'inetpub', 'wwwroot')), true);
  assert.equal(looksPublic('/home/u/proyecto'), false);
});

test('describePlan explica el plan y avisa de sensibles y carpetas públicas', () => {
  const scan = { count: 3, sensitive: ['.env', 'clave.pem'], sample: ['.env', 'clave.pem', 'index.html'], truncated: false };
  const lines = describePlan('/tmp/x', scan, { hasGitignore: false, public: false });
  assert.ok(lines.some((l) => l.includes('no es un repositorio git')));
  assert.ok(lines.includes('git init'));
  assert.ok(lines.some((l) => l.includes('Crear .gitignore')));
  // Con un .gitignore nuevo, los sensibles no cuentan ni se listan como incluidos.
  assert.ok(lines.some((l) => l.includes('con 1 archivo(s)')));
  assert.ok(lines.includes('  index.html'));
  assert.equal(lines.filter((l) => l === '  .env').length, 1); // solo en la lista de sensibles
  assert.ok(lines.some((l) => l.includes('quedarán excluidos por el .gitignore')));

  const withGitignore = describePlan('/tmp/x', scan, { hasGitignore: true, public: false });
  assert.ok(withGitignore.some((l) => l.includes('con 3 archivo(s)')));
  assert.ok(withGitignore.some((l) => l.includes('Se respetará el .gitignore existente')));
  assert.ok(withGitignore.some((l) => l.includes('revisa que tu .gitignore los excluya')));

  const isPublic = describePlan('/tmp/x', scan, { hasGitignore: false, public: true });
  assert.ok(isPublic.some((l) => l.includes('servida públicamente')));
});
