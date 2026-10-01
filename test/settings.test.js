import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { canonicalSetting, parseSettingValue, readSettings, setSetting, settingsFile, unsetSetting, writeSettings } from '../src/settings.js';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-settings-'));
function run(args, cwd, home, codexHome) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTRELAY_HOME: home, CODEX_HOME: codexHome, AGENTRELAY_NO_MIGRATE: '1' } });
}

test('aliases, valores españoles, enteros y errores de parsing', () => {
  assert.equal(canonicalSetting('effort'), 'executor.thinking');
  assert.equal(canonicalSetting('validation.timeoutSeconds'), 'validation.timeoutSeconds');
  for (const [input, expected] of [['bajo', 'low'], ['MEDIO', 'medium'], ['alto', 'high'], ['extremo', 'xhigh'], ['máximo', 'max'], ['ninguno', 'none']]) assert.deepEqual(parseSettingValue('effort', input), { value: expected });
  assert.deepEqual(parseSettingValue('level', '4'), { value: 4 });
  assert.deepEqual(parseSettingValue('model', 'default'), { unset: true });
  assert.throws(() => parseSettingValue('level', '9'), /entero entre 1 y 5/);
  assert.throws(() => parseSettingValue('timeout', '0'), /número positivo/);
  assert.throws(() => parseSettingValue('effort', 'ultra'), /esfuerzo/);
});

test('ajustes se escriben de forma atómica, se pueden retirar y podan objetos vacíos', () => {
  const dir = temp(), home = path.join(dir, 'nested', 'home');
  try {
    const withModel = setSetting({}, 'executor.model', 'x');
    writeSettings(home, withModel);
    assert.deepEqual(readSettings(home), { executor: { model: 'x' } });
    assert.deepEqual(readdirSync(home), ['settings.json']);
    assert.deepEqual(unsetSetting(withModel, 'executor.model'), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('settings.json gana a config personal y pierde al proyecto con los orígenes correctos', () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, 'config.json'), '{"level":1,"executor":{"model":"personal"}}');
    writeFileSync(settingsFile(home), '{"level":2,"executor":{"model":"settings"}}');
    writeFileSync(path.join(dir, 'agentrelay.config.json'), '{"level":4,"executor":{"model":"project"}}');
    const loaded = loadConfig({ cwd: dir, home });
    assert.equal(loaded.config.level, 4);
    assert.equal(loaded.config.executor.model, 'project');
    assert.equal(loaded.origins.level, path.join(dir, 'agentrelay.config.json'));
    assert.ok(loaded.sources.includes(settingsFile(home)));
    writeFileSync(path.join(dir, 'agentrelay.config.json'), '{}');
    const withoutProject = loadConfig({ cwd: dir, home });
    assert.equal(withoutProject.config.level, 2);
    assert.equal(withoutProject.origins.level, settingsFile(home));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set valida con rollback exacto, executor cambia elimina modelo proveedor y comando', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    mkdirSync(home, { recursive: true });
    const file = settingsFile(home);
    const original = '{ "executor": { "model": "saved", "provider": "p", "command": "custom" } }\n';
    writeFileSync(file, original);
    const invalid = run(['set', 'level', '9'], dir, home, codexHome);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /level.*entero entre 1 y 5/);
    assert.equal(readFileSync(file, 'utf8'), original);
    const changed = run(['set', 'executor', 'cline'], dir, home, codexHome);
    assert.equal(changed.status, 0, changed.stderr);
    assert.match(changed.stdout, /Se eliminaron model, provider y command/);
    assert.deepEqual(readSettings(home), { executor: { type: 'cline' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set informa cuando el proyecto tiene prioridad sobre settings.json', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { model: 'project-model' } }));
    const result = run(['set', 'model', 'personal-model'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Ojo: agentrelay\.config\.json del proyecto lo sustituye por "project-model"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set --local crea el archivo, conserva otras claves y aparece en config con su origen', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  const file = path.join(dir, 'agentrelay.config.local.json');
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    let result = run(['set', 'effort', 'alto', '--local'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { executor: { thinking: 'high' } });
    result = run(['set', 'level', '4', '--local'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    result = run(['config'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /executor\.thinking = "high".*agentrelay\.config\.local\.json/);
    result = run(['set', 'validation.timeoutSeconds', '30', '--local'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { executor: { thinking: 'high' }, level: 4, validation: { timeoutSeconds: 30 } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set --local se niega a reescribir comentarios o JSON invÃ¡lido', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  const file = path.join(dir, 'agentrelay.config.local.json');
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const commented = '{\n  // conservar comentario\n  "level": 3\n}\n';
    writeFileSync(file, commented);
    let result = run(['set', 'level', '4', '--local'], dir, home, codexHome);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tiene comentarios o formato propio/);
    assert.equal(readFileSync(file, 'utf8'), commented);
    const invalid = '{ "level": }\n';
    writeFileSync(file, invalid);
    result = run(['set', 'level', '4', '--local'], dir, home, codexHome);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tiene comentarios o formato propio/);
    assert.equal(readFileSync(file, 'utf8'), invalid);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set --local valida con rollback y unset quita solo esa clave', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  const file = path.join(dir, 'agentrelay.config.local.json');
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const original = '{\n  "level": 4,\n  "executor": { "thinking": "high", "model": "local-model" }\n}\n';
    writeFileSync(file, original);
    const invalid = run(['set', 'level', '9', '--local'], dir, home, codexHome);
    assert.equal(invalid.status, 1);
    assert.equal(readFileSync(file, 'utf8'), original);
    const removed = run(['unset', 'effort', '--local'], dir, home, codexHome);
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /executor\.thinking = null \(.*defecto\)/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { level: 4, executor: { model: 'local-model' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cambiar de ejecutor con --local limpia modelo, proveedor y comando del archivo local', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  const file = path.join(dir, 'agentrelay.config.local.json');
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(file, '{"executor":{"type":"codex","model":"saved","provider":"p","command":"custom"}}\n');
    const result = run(['set', 'executor', 'cline', '--local'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Se eliminaron model, provider y command/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { executor: { type: 'cline' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--local fuera de un repositorio falla', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    const result = run(['set', 'level', '4', '--local'], dir, home, codexHome);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no es un repositorio git/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set effort avisa por modelos incompatibles; models formatea caché y marca el efectivo', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(path.join(codexHome, 'models_cache.json'), JSON.stringify({ models: [
      { slug: 'gpt-test', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'low' },
      { slug: 'secret', visibility: 'hide', supported_reasoning_levels: [], default_reasoning_level: null },
    ] }));
    let result = run(['set', 'effort', 'alto'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(settingsFile(home), JSON.stringify({ executor: { model: 'gpt-test', thinking: 'high' } }));
    result = run(['models'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /● gpt-test  bajo\* alto/);
    assert.doesNotMatch(result.stdout, /secret/);
    assert.match(result.stdout, /Esfuerzo actual: alto/);
    writeFileSync(settingsFile(home), '{"executor":{"model":"gpt-test"}}');
    result = run(['set', 'effort', 'medio'], dir, home, codexHome);
    assert.match(result.stdout, /Aviso: gpt-test admite: bajo, alto/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unset restaura defaults, config lista settings.json y cline informa que no tiene catálogo remoto', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    let result = run(['models'], dir, home, codexHome);
    assert.match(result.stdout, /Este ejecutor no ofrece lista de modelos/);
    result = run(['set', 'effort', 'alto'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    result = run(['config'], dir, home, codexHome);
    assert.match(result.stdout, /executor\.thinking = "high".*settings\.json/);
    assert.match(result.stdout, /settings\.json/);
    result = run(['unset', 'effort'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /executor\.thinking = null/);
    result = run(['set', 'executor', 'cline'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    result = run(['models'], dir, home, codexHome);
    assert.match(result.stdout, /● deepseek-v4-pro/);
    assert.match(result.stdout, /—/);
    assert.ok(existsSync(settingsFile(home)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
