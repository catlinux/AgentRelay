import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, loadConfig, parseJsonc } from '../src/config.js';
import { configTemplate } from '../src/config-template.js';
import { FAKE_CODEX } from './helpers.js';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-new-'));
function run(args, cwd, home, codexHome) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTRELAY_HOME: home, CODEX_HOME: codexHome, AGENTRELAY_NO_MIGRATE: '1' } });
}
function leaves(value, prefix = '', out = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
  else if (prefix) out.push(prefix);
  return out;
}

test('parseJsonc admite comentarios, cadenas, comas finales y BOM e informa línea y columna', () => {
  assert.deepEqual(parseJsonc('\uFEFF{\n "url": "https://host/a", // comentario\n "x": [1,],\n}', 'x.json'), { url: 'https://host/a', x: [1] });
  assert.deepEqual(parseJsonc('{"s":"/* no */ // no"}'), { s: '/* no */ // no' });
  assert.throws(() => parseJsonc('{\n  "x": }', 'bad.json'), /bad\.json \(línea 2, columna 8\)/);
});

test('capas y orígenes aplican usuario, proyecto, local y opciones', () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    const user = path.join(home, 'config.json');
    mkdirSync(home, { recursive: true });
    writeFileSync(user, '{"executor":{"model":"user","timeoutSeconds":100}}');
    writeFileSync(path.join(dir, 'agentrelay.config.json'), '{"executor":{"model":"project","timeoutSeconds":200}}');
    writeFileSync(path.join(dir, 'agentrelay.config.local.json'), '{"validation":{"timeoutSeconds":300}}');
    const result = loadConfig({ cwd: dir, home, overrides: { executor: { timeoutSeconds: 500 } } });
    assert.equal(result.config.executor.model, 'project');
    assert.equal(result.config.executor.timeoutSeconds, 500);
    assert.equal(result.config.validation.timeoutSeconds, 300);
    assert.equal(result.origins['executor.model'], path.join(dir, 'agentrelay.config.json'));
    assert.equal(result.origins['executor.timeoutSeconds'], 'línea de comandos');
    assert.equal(result.sources.length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('valida valores con el origen y avisa de claves desconocidas con sugerencia', () => {
  const dir = temp();
  try {
    const file = path.join(dir, 'agentrelay.config.json');
    writeFileSync(file, '{"executor":{"timeoutSeconds":-1,"modle":"x"}}');
    assert.throws(() => loadConfig({ cwd: dir }), new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: executor.timeoutSeconds`));
    writeFileSync(file, '{"executor":{"modle":"x"}}');
    assert.match(loadConfig({ cwd: dir }).warnings.join(' '), /modle.*quizá quisiste decir model/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('la opción level de versiones anteriores se ignora con un aviso', () => {
  const dir = temp();
  try {
    const file = path.join(dir, 'agentrelay.config.json');
    writeFileSync(file, '{"level":4,"executor":{"model":"x"}}');
    const result = loadConfig({ cwd: dir, home: path.join(dir, 'home') });
    assert.equal(result.config.level, undefined);
    assert.equal(result.config.executor.model, 'x');
    assert.ok(result.warnings.some((warning) => warning.includes('La opción level ya no existe') && warning.includes(file)));
    assert.ok(!result.warnings.some((warning) => warning.includes('Clave desconocida level')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('avisa cuando existen archivos de configuración antiguos', () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    mkdirSync(home, { recursive: true });
    const settings = path.join(home, 'settings.json');
    const local = path.join(dir, 'agentrelay.config.local.json');
    writeFileSync(settings, '{"level":2}');
    writeFileSync(local, '{"level":3}');
    const warnings = loadConfig({ cwd: dir, home }).warnings;
    assert.ok(warnings.includes(`Archivo antiguo ${settings}: ejecuta 'agentrelay config migrate'`));
    assert.ok(warnings.includes(`Archivo antiguo ${local}: ejecuta 'agentrelay config migrate'`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('valida estrictamente las familias de opciones y señala el archivo y la clave', () => {
  const dir = temp(), file = path.join(dir, 'agentrelay.config.json');
  try {
    const invalidValues = [
      [{ executor: { thinking: 'ultra' } }, 'executor.thinking'],
      [{ executor: { timeoutSeconds: 0 } }, 'executor.timeoutSeconds'],
      [{ executor: { extraArgs: [1] } }, 'executor.extraArgs'],
      [{ executor: { command: [1] } }, 'executor.command'],
      [{ validation: { timeoutSeconds: 0 } }, 'validation.timeoutSeconds'],
      [{ validation: { commands: 'npm test' } }, 'validation.commands'],
      [{ report: { maxDiffChars: 0 } }, 'report.maxDiffChars'],
      [{ report: { maxOutputChars: 1.5 } }, 'report.maxOutputChars'],
      [{ policy: { review: 'sometimes' } }, 'policy.review'],
      [{ policy: { maxRetries: -1 } }, 'policy.maxRetries'],
      [{ policy: { autoFix: 'yes' } }, 'policy.autoFix'],
      [{ policy: { requireValidation: 1 } }, 'policy.requireValidation'],
      [{ policy: { selfReview: { normal: 'high' } } }, 'policy.selfReview.normal'],
      [{ policy: { skipPassMaxFiles: -1 } }, 'policy.skipPassMaxFiles'],
    ];
    for (const [value, key] of invalidValues) {
      writeFileSync(file, JSON.stringify(value));
      assert.throws(() => loadConfig({ cwd: dir, home: path.join(dir, 'home') }), (error) => error.message.includes(file) && error.message.includes(key), key);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('plantillas comentadas parsean a objeto vacío y documentan cada hoja predeterminada', () => {
  const both = `${configTemplate({ scope: 'user' })}\n${configTemplate({ scope: 'project' })}`;
  assert.deepEqual(parseJsonc(configTemplate({ scope: 'user' })), {});
  for (const key of leaves(DEFAULT_CONFIG)) assert.ok(both.includes(`"${key.split('.').at(-1)}"`), `Falta documentar ${key}`);
});

test('config init, show, path y protección frente a sobrescritura', () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    let result = run(['config', 'init'], dir, home);
    assert.equal(result.status, 0, result.stderr);
    const userFile = path.join(home, 'config.json');
    assert.ok(existsSync(userFile));
    assert.deepEqual(parseJsonc(readFileSync(userFile, 'utf8'), userFile), {});
    assert.match(run(['config'], dir, home).stdout, /executor\.model = "gpt-6-luna".*defecto del ejecutor codex/);
    assert.equal(run(['config', 'init'], dir, home).status, 1);
    assert.equal(run(['config', 'init', '--force'], dir, home).status, 0);
    assert.equal(run(['config', 'init', '--project'], dir, home).status, 0);
    const paths = run(['config', 'path'], dir, home).stdout;
    assert.match(paths, /Proyecto: .*existe/);
    assert.deepEqual(paths.trim().split(/\r?\n/).map((line) => line.split(':')[0]), ['Usuario', 'Proyecto']);
    writeFileSync(userFile, '{"executor":{"model":"gpt-5.5"}}');
    assert.match(run(['config'], dir, home).stdout, /executor\.model = "gpt-5\.5".*config\.json/);
    writeFileSync(path.join(dir, 'agentrelay.config.json'), '{"executor":{"model":"project-model"}}');
    assert.match(run(['config'], dir, home).stdout, /executor\.model = "project-model"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config init --only codex escribe el bloque de modelos y --local es alias de --project', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(path.join(codexHome, 'models_cache.json'), JSON.stringify({ models: [
      { slug: 'gpt-test', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'low' },
    ] }));
    const result = run(['config', 'init', '--only', 'codex'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const userFile = readFileSync(path.join(home, 'config.json'), 'utf8');
    assert.match(userFile, /agentrelay:models:start/);
    assert.match(userFile, /gpt-test/);

    const alias = run(['config', 'init', '--local'], dir, home, codexHome);
    assert.equal(alias.status, 0, alias.stderr);
    assert.ok(existsSync(path.join(dir, 'agentrelay.config.json')));
    assert.ok(!existsSync(path.join(dir, 'agentrelay.config.local.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('doctor muestra avisos de configuración sin cambiar su código de salida', () => {
  const dir = temp(), home = path.join(dir, 'home');
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { command: [process.execPath, FAKE_CODEX], modle: 'typo' } }));
    const result = spawnSync(process.execPath, [bin, '--cwd', dir, 'doctor'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, AGENTRELAY_HOME: home, FAKE_CODEX_LOGGED_IN: '1', FAKE_CODEX_LOG: path.join(dir, 'calls.log') },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /\[aviso\].*modle.*model/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
