import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSetting, parseSettingValue } from '../src/settings.js';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-settings-'));
function run(args, cwd, home, codexHome) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTRELAY_HOME: home, CODEX_HOME: codexHome, AGENTRELAY_NO_MIGRATE: '1' } });
}
function initRepo(dir) { execFileSync('git', ['init', '-q'], { cwd: dir }); }

test('aliases y valores españoles conservan su parsing', () => {
  assert.equal(canonicalSetting('effort'), 'executor.thinking');
  assert.equal(canonicalSetting('validation.timeoutSeconds'), 'validation.timeoutSeconds');
  for (const [input, expected] of [['bajo', 'low'], ['MEDIO', 'medium'], ['alto', 'high'], ['extremo', 'xhigh'], ['máximo', 'max'], ['ninguno', 'none']]) assert.deepEqual(parseSettingValue('effort', input), { value: expected });
  assert.deepEqual(parseSettingValue('level', '4'), { value: 4 });
  assert.deepEqual(parseSettingValue('model', 'default'), { unset: true });
  assert.throws(() => parseSettingValue('level', '9'), /entero entre 1 y 5/);
});

test('set crea config.json desde la plantilla y conserva sus comentarios', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    const result = run(['set', 'level', '4'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(path.join(home, 'config.json'), 'utf8');
    assert.match(text, /Configuración personal de AgentRelay/);
    assert.match(text, /"level": 4,/);
    assert.ok(text.includes('// Para ajustes del proyecto, usa agentrelay.config.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set conserva todos los comentarios existentes', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    mkdirSync(home, { recursive: true });
    const file = path.join(home, 'config.json');
    const original = '{\n  // comentario uno\n  "level": 2, // comentario en línea\n  // comentario dos\n  "report": {\n    // comentario anidado\n    "maxDiffChars": 1000\n  }\n}\n';
    writeFileSync(file, original);
    const result = run(['set', 'level', '4'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const updated = readFileSync(file, 'utf8');
    for (const comment of ['// comentario uno', '// comentario en línea', '// comentario dos', '// comentario anidado']) assert.ok(updated.includes(comment));
    assert.match(updated, /"level": 4,/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set --project escribe agentrelay.config.json y --local es un alias', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex'), file = path.join(dir, 'agentrelay.config.json');
  try {
    initRepo(dir);
    let result = run(['set', 'level', '4', '--project'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(file, 'utf8'), /"level": 4,/);
    assert.match(result.stdout, /solo en este proyecto: agentrelay\.config\.json/);
    result = run(['set', 'effort', 'alto', '--local'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(file, 'utf8'), /"thinking": "high",/);
    assert.ok(!existsSync(path.join(dir, 'agentrelay.config.local.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unset restaura la línea comentada de la plantilla', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex');
  try {
    let result = run(['set', 'level', '4'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    result = run(['unset', 'level'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(path.join(home, 'config.json'), 'utf8');
    assert.match(text, /\/\/ "level": 3,/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cambiar executor.type elimina model, provider y command', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex'), file = path.join(home, 'config.json');
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(file, '{\n  "executor": {\n    "type": "codex",\n    "model": "saved",\n    "provider": "p",\n    "command": "custom"\n  }\n}\n');
    const result = run(['set', 'executor', 'cline'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Se eliminaron model, provider y command/);
    const updated = readFileSync(file, 'utf8');
    assert.match(updated, /"type": "cline"/);
    for (const key of ['model', 'provider', 'command']) assert.doesNotMatch(updated, new RegExp(`^\\s*"${key}"\\s*:`, 'm'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('un valor inválido no se guarda y restaura exactamente el archivo', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex'), file = path.join(home, 'config.json');
  try {
    mkdirSync(home, { recursive: true });
    const original = '{\n  // comentario que debe sobrevivir al rollback\n  "level": 4\n}\n';
    writeFileSync(file, original);
    const result = run(['set', 'executor', 'no-existe'], dir, home, codexHome);
    assert.equal(result.status, 1);
    assert.equal(readFileSync(file, 'utf8'), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unset también puede escribir la configuración del proyecto', () => {
  const dir = temp(), home = path.join(dir, 'home'), codexHome = path.join(dir, 'codex'), file = path.join(dir, 'agentrelay.config.json');
  try {
    initRepo(dir);
    writeFileSync(file, '{\n  "level": 4\n}\n');
    const result = run(['unset', 'level', '--project'], dir, home, codexHome);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(file, 'utf8'), /\/\/ "level": 3,/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
