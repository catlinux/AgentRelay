import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-refresh-'));
function run(args, cwd, home, codexHome) {
  return spawnSync(process.execPath, [bin, 'config', 'refresh', ...args, '--only', 'codex'], {
    cwd, encoding: 'utf8', env: { ...process.env, AGENTRELAY_HOME: home, CODEX_HOME: codexHome, AGENTRELAY_NO_MIGRATE: '1' },
  });
}
function setup(dir) {
  const home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(path.join(codexHome, 'models_cache.json'), JSON.stringify({ models: [
    { slug: 'gpt-test', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'high' },
  ] }));
  return { home, codexHome, file: path.join(home, 'config.json') };
}

test('refresh crea config.json desde la plantilla e inserta el bloque de modelos', () => {
  const dir = temp(), { home, codexHome, file } = setup(dir);
  try {
    const result = run([], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(file, 'utf8');
    assert.match(text, /Configuración personal de AgentRelay/);
    assert.match(text, /agentrelay:models:start/);
    assert.match(text, /gpt-test/);
    assert.match(text, /en uso/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('refresh repetido solo cambia la fecha del bloque', () => {
  const dir = temp(), { home, codexHome, file } = setup(dir);
  try {
    assert.equal(run([], dir, home, codexHome).status, 0);
    const first = readFileSync(file, 'utf8');
    assert.equal(run([], dir, home, codexHome).status, 0);
    const second = readFileSync(file, 'utf8');
    assert.equal(second.replace(/(Actualizado: )\d{4}-\d{2}-\d{2}/, '$1DATE'), first.replace(/(Actualizado: )\d{4}-\d{2}-\d{2}/, '$1DATE'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('refresh conserva valores y comentarios editados por el usuario', () => {
  const dir = temp(), { home, codexHome, file } = setup(dir);
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(file, '{\n  // comentario personal\n  "level": 4,\n  "executor": {"model": "modelo-personal"}\n}\n');
    const result = run([], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(file, 'utf8');
    assert.match(text, /\/\/ comentario personal/);
    assert.match(text, /"level": 4/);
    assert.match(text, /"model": "modelo-personal"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--dry-run imprime el bloque sin escribir config.json', () => {
  const dir = temp(), { home, codexHome, file } = setup(dir);
  try {
    const result = run(['--dry-run'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /agentrelay:models:start/);
    assert.equal(existsSync(file), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
