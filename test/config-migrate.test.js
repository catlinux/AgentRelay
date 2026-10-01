import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { legacyFilesFor, migrateConfig } from '../src/config-migrate.js';
import { parseJsonc } from '../src/config.js';
import { configTemplate } from '../src/config-template.js';
import { setConfigValue } from '../src/config-file.js';

function temporaryDirectory() {
  return mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-migrate-'));
}

test('migra settings a una configuración de usuario nueva desde la plantilla', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'project');
  mkdirSync(home);
  mkdirSync(cwd);
  try {
    const legacy = path.join(home, 'settings.json');
    writeFileSync(legacy, '{\n  "executor": { "model": "nuevo", "extraArgs": ["uno", "dos"] },\n  "nueva": { "anidada": true }\n}');

    const result = migrateConfig({ home, cwd });
    const target = path.join(home, 'config.json');
    const migrated = readFileSync(target, 'utf8');
    assert.equal(result.changed, true);
    assert.deepEqual(result.actions[0].keys, ['executor.model', 'executor.extraArgs', 'nueva.anidada']);
    assert.deepEqual(parseJsonc(migrated), { executor: { model: 'nuevo', extraArgs: ['uno', 'dos'] }, nueva: { anidada: true } });
    assert.ok(migrated.includes('// Configuraci'));
    assert.ok(existsSync(`${legacy}.bak`));
    assert.equal(legacyFilesFor({ home, cwd }).settings, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('migra settings a una configuración existente y conserva comentarios', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  mkdirSync(home);
  try {
    const target = path.join(home, 'config.json');
    const legacy = path.join(home, 'settings.json');
    const initial = configTemplate({ scope: 'user' }).replace('\n{', '\n{\n  // comentario que debe conservarse');
    writeFileSync(target, setConfigValue(initial, 'executor.model', 'anterior'));
    writeFileSync(legacy, '{"executor":{"model":"nuevo"}}');

    migrateConfig({ home, cwd: root });
    const migrated = readFileSync(target, 'utf8');
    assert.ok(migrated.includes('// comentario que debe conservarse'));
    assert.deepEqual(parseJsonc(migrated), { executor: { model: 'nuevo' } });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('los valores locales prevalecen sobre los del archivo de proyecto', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  mkdirSync(home);
  try {
    const target = path.join(root, 'agentrelay.config.json');
    const legacy = path.join(root, 'agentrelay.config.local.json');
    const initial = configTemplate({ scope: 'project' }).replace('\n{', '\n{\n  // comentario del proyecto');
    writeFileSync(target, setConfigValue(initial, 'executor.model', 'proyecto'));
    writeFileSync(target, setConfigValue(readFileSync(target, 'utf8'), 'executor.command', 'codex'));
    writeFileSync(legacy, '{"executor":{"model":"local"},"validation":{"commands":["npm test"]}}');

    const result = migrateConfig({ home, cwd: root });
    assert.equal(result.actions[0].into, target);
    assert.deepEqual(parseJsonc(readFileSync(target, 'utf8')), {
      executor: { model: 'local', command: 'codex' }, validation: { commands: ['npm test'] },
    });
    assert.ok(readFileSync(target, 'utf8').includes('// comentario del proyecto'));
    assert.ok(existsSync(`${legacy}.bak`));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('usa .bak2 si .bak existe y la segunda migración es idempotente', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  mkdirSync(home);
  try {
    const legacy = path.join(home, 'settings.json');
    writeFileSync(legacy, '{"level":2}');
    writeFileSync(`${legacy}.bak`, 'copia anterior');

    const first = migrateConfig({ home, cwd: root });
    assert.equal(first.actions[0].backup, `${legacy}.bak2`);
    assert.equal(readFileSync(`${legacy}.bak`, 'utf8'), 'copia anterior');
    const targetBefore = readFileSync(path.join(home, 'config.json'), 'utf8');
    const second = migrateConfig({ home, cwd: root });
    assert.deepEqual(second, { actions: [], changed: false, errors: [] });
    assert.equal(readFileSync(path.join(home, 'config.json'), 'utf8'), targetBefore);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('omite JSON inválido y lo informa sin tocar el archivo', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  mkdirSync(home);
  try {
    const legacy = path.join(home, 'settings.json');
    writeFileSync(legacy, '{ invalido');
    const result = migrateConfig({ home, cwd: root });
    assert.deepEqual(result.actions, []);
    assert.equal(result.changed, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].from, legacy);
    assert.match(result.errors[0].error, /JSONC no válido/);
    assert.equal(readFileSync(legacy, 'utf8'), '{ invalido');
    assert.equal(existsSync(path.join(home, 'config.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dryRun informa la acción sin escribir, crear la plantilla ni renombrar', () => {
  const root = temporaryDirectory();
  const home = path.join(root, 'home');
  mkdirSync(home);
  try {
    const legacy = path.join(home, 'settings.json');
    writeFileSync(legacy, '{"level":4}');
    const result = migrateConfig({ home, cwd: root, dryRun: true });
    assert.equal(result.changed, false);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].into, path.join(home, 'config.json'));
    assert.equal(result.actions[0].backup, `${legacy}.bak`);
    assert.deepEqual(result.actions[0].keys, ['level']);
    assert.equal(existsSync(path.join(home, 'config.json')), false);
    assert.equal(existsSync(`${legacy}.bak`), false);
    assert.equal(existsSync(legacy), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('las plantillas de usuario y proyecto usadas al migrar coinciden con las oficiales', () => {
  assert.deepEqual(parseJsonc(configTemplate({ scope: 'user' })), {});
  assert.deepEqual(parseJsonc(configTemplate({ scope: 'project' })), {});
});
