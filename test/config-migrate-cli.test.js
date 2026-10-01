import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-migrate-cli-'));

// Lanza el CLI como proceso aparte (no se tocan stdout ni el entorno del runner de pruebas).
const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

async function run(args, cwd, home, noMigrate = false) {
  const env = { ...process.env, AGENTRELAY_HOME: home };
  if (noMigrate) env.AGENTRELAY_NO_MIGRATE = '1';
  else delete env.AGENTRELAY_NO_MIGRATE;
  const res = spawnSync(process.execPath, [BIN, ...args, '--cwd', cwd], { cwd, encoding: 'utf8', env });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test('config migrate mueve los archivos antiguos e informa de las copias; la segunda vez no hay nada', async () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home);
    const settings = path.join(home, 'settings.json');
    const local = path.join(dir, 'agentrelay.config.local.json');
    writeFileSync(settings, '{"level":2}');
    writeFileSync(local, '{"level":4}');

    const first = await run(['config', 'migrate'], dir, home);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(first.stdout.includes(`Migrado ${settings} → ${path.join(home, 'config.json')} (copia: ${settings}.bak)`));
    assert.ok(first.stdout.includes(`Migrado ${local} → ${path.join(dir, 'agentrelay.config.json')} (copia: ${local}.bak)`));
    assert.equal(existsSync(`${settings}.bak`), true);
    assert.equal(existsSync(`${local}.bak`), true);

    const second = await run(['config', 'migrate'], dir, home);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, 'Nada que migrar\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config migrate --dry-run informa sin escribir ni renombrar archivos', async () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home);
    const settings = path.join(home, 'settings.json');
    writeFileSync(settings, '{"level":2}');

    const result = await run(['config', 'migrate', '--dry-run'], dir, home);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Se migraría/);
    assert.equal(existsSync(settings), true);
    assert.equal(existsSync(`${settings}.bak`), false);
    assert.equal(existsSync(path.join(home, 'config.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('la migración automática conserva la configuración efectiva y avisa una vez por stderr', async () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home);
    const settings = path.join(home, 'settings.json');
    const local = path.join(dir, 'agentrelay.config.local.json');
    writeFileSync(settings, '{"level":2,"executor":{"model":"desde-ajustes"}}');
    writeFileSync(local, '{"level":4}');
    const before = loadConfig({ cwd: dir, home }).config;

    const result = await run(['config'], dir, home);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stderr.trim(), 'Configuración unificada: 2 archivo(s) antiguo(s) migrado(s) (copia .bak)');
    assert.deepEqual(loadConfig({ cwd: dir, home }).config, before);
    assert.equal(readFileSync(path.join(home, 'config.json'), 'utf8').includes('desde-ajustes'), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AGENTRELAY_NO_MIGRATE=1 desactiva la migración automática', async () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home);
    const settings = path.join(home, 'settings.json');
    writeFileSync(settings, '{"level":2}');

    const result = await run(['config'], dir, home, true);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(existsSync(settings), true);
    assert.equal(existsSync(path.join(home, 'config.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
