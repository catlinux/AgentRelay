import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../src/config.js';
import { choiceEdits, parseUseArgs } from '../src/use.js';
import { main } from '../src/cli.js';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const fakeOpenCode = fileURLToPath(new URL('./fixtures/fake-opencode.mjs', import.meta.url));
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-use-'));
function env(dir) {
  return { ...process.env, AGENTRELAY_HOME: path.join(dir, 'home'), CODEX_HOME: path.join(dir, 'codex'), AGENTRELAY_EXECUTORS_DIR: path.join(dir, 'ex'), AGENTRELAY_NO_MIGRATE: '1', AGENTRELAY_NO_STATE: '1' };
}
function run(args, dir) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: 'utf8', env: env(dir) });
}
function installFakeOpenCode(dir) {
  const fakeBin = path.join(dir, 'fake-bin');
  mkdirSync(fakeBin, { recursive: true });
  const executable = path.join(fakeBin, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  if (process.platform === 'win32') {
    writeFileSync(executable, `@echo off\r\n"${process.execPath}" "${fakeOpenCode}" %*\r\n`);
  } else {
    writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${fakeOpenCode}" "$@"\n`);
    chmodSync(executable, 0o755);
  }
  return { ...env(dir), PATH: `${fakeBin}${path.delimiter}${process.env.PATH || process.env.Path || ''}` };
}
const userConfig = (dir) => parseJsonc(readFileSync(path.join(dir, 'home', 'config.json'), 'utf8'));

test('parseUseArgs reconoce ejecutor, modelo, esfuerzo y perfil en cualquier orden', () => {
  assert.deepEqual(parseUseArgs(['opencode']), { type: 'opencode' });
  assert.deepEqual(parseUseArgs(['codex', 'gpt-5.5', 'alto']), { type: 'codex', model: 'gpt-5.5', thinking: 'high' });
  assert.deepEqual(parseUseArgs(['bajo']), { thinking: 'low' });
  assert.deepEqual(parseUseArgs(['gpt-5.5']), { model: 'gpt-5.5' });
  assert.deepEqual(parseUseArgs(['codex', 'defecto']), { type: 'codex', thinking: null });
  assert.deepEqual(parseUseArgs(['barato'], { barato: { type: 'codex' } }), { profile: 'barato' });
  assert.throws(() => parseUseArgs(['a', 'b']), /No entiendo "b"/);
});

test('choiceEdits borra modelo, proveedor y comando del ejecutor anterior', () => {
  const edits = choiceEdits({ type: 'opencode' }, { type: 'codex' });
  assert.deepEqual(edits, [['executor.type', 'opencode'], ['executor.model', undefined], ['executor.provider', undefined], ['executor.command', undefined]]);
  assert.deepEqual(choiceEdits({ type: 'codex', thinking: null }, { type: 'codex' }), [['executor.type', 'codex'], ['executor.thinking', undefined]]);
});

test('use cambia de ejecutor, modelo y esfuerzo con un solo comando', () => {
  const dir = temp();
  try {
    let result = run(['use', 'opencode', 'alto'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Ahora: opencode · opencode\/nemotron-3-ultra-free · esfuerzo alto/);
    assert.equal(userConfig(dir).executor.type, 'opencode');
    result = run(['use', 'codex', 'gpt-5.5'], dir);
    assert.equal(result.status, 0, result.stderr);
    const config = userConfig(dir);
    assert.equal(config.executor.model, 'gpt-5.5');
    assert.equal(config.executor.thinking, 'high');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use --save guarda un perfil y use <perfil> lo aplica', () => {
  const dir = temp();
  try {
    assert.equal(run(['use', 'opencode', 'bajo'], dir).status, 0);
    let result = run(['use', '--save', 'gratis'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Perfil "gratis" guardado/);
    assert.equal(run(['use', 'codex'], dir).status, 0);
    result = run(['use', 'gratis'], dir);
    assert.equal(result.status, 0, result.stderr);
    const config = userConfig(dir);
    assert.equal(config.executor.type, 'opencode');
    assert.equal(config.executor.thinking, 'low');
    assert.match(run(['use'], dir).stdout, /Perfiles: gratis/);
    assert.notEqual(run(['use', '--save', 'codex'], dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use --list muestra los modelos de Codex con su esfuerzo y marca el que está en uso', () => {
  const dir = temp();
  try {
    mkdirSync(path.join(dir, 'codex'), { recursive: true });
    writeFileSync(path.join(dir, 'codex', 'models_cache.json'), JSON.stringify({ models: [
      { slug: 'gpt-6-luna', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'low' },
      { slug: 'gpt-5.5', visibility: 'list', supported_reasoning_levels: [{ effort: 'medium' }], default_reasoning_level: 'medium' },
    ] }));
    const result = run(['use', '--list'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Codex \(OpenAI\) \(codex\) · instalado · cuenta de ChatGPT · en uso/);
    assert.match(result.stdout, /● gpt-6-luna {2}bajo\* alto/);
    assert.match(result.stdout, / {3}gpt-5\.5 {2}medio\*/);
    assert.match(result.stdout, /agentrelay use <ejecutor> <modelo>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use --list muestra el ranquing de OpenCode y --all conserva todos los modelos', () => {
  const dir = temp();
  try {
    const testEnv = installFakeOpenCode(dir);
    mkdirSync(testEnv.AGENTRELAY_HOME, { recursive: true });
    const checksFile = path.join(dir, 'home', 'model-checks.json');
    const checks = {
      lastRun: '2026-10-04',
      ranking: { at: new Date().toISOString(), entries: [
        { id: 'opencode/nemotron-3-ultra-free', score: 2, seconds: 8 },
      ] },
      models: {
        'opencode/nemotron-3-ultra-free': { status: 'approved', checkedAt: '2026-10-04T10:00:00.000Z' },
        'opencode/gpt-oss-120b-free': { status: 'failed', checkedAt: '2026-10-04T10:00:00.000Z' },
      },
    };
    writeFileSync(checksFile, JSON.stringify(checks));
    const listed = spawnSync(process.execPath, [bin, 'use', '--list'], { cwd: dir, encoding: 'utf8', env: testEnv });
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /opencode\/nemotron-3-ultra-free  #1  ✔✔ 8 s/);
    assert.doesNotMatch(listed.stdout, /opencode\/gpt-oss-120b-free/);
    assert.match(listed.stdout, /\(\+1 modelos más de OpenCode sin probar o que no pasaron las pruebas: agentrelay use --list --all\)/);
    assert.doesNotMatch(listed.stdout, /probado \(2026-10-04\)|no pasó la prueba/);

    const all = spawnSync(process.execPath, [bin, 'use', '--list', '--all'], { cwd: dir, encoding: 'utf8', env: testEnv });
    assert.equal(all.status, 0, all.stderr);
    assert.match(all.stdout, /opencode\/nemotron-3-ultra-free.*#1 ✔✔ 8 s/);
    assert.match(all.stdout, /opencode\/gpt-oss-120b-free  ✘/);
    assert.doesNotMatch(all.stdout, /modelos más de OpenCode|Agotados hoy|Aún no hay ranquing/);

    writeFileSync(checksFile, JSON.stringify({
      ...checks,
      exhausted: { 'opencode/gpt-oss-120b-free': { until: '2099-01-01T00:00:00.000Z' } },
    }));
    const exhausted = spawnSync(process.execPath, [bin, 'use', '--list'], { cwd: dir, encoding: 'utf8', env: testEnv });
    assert.equal(exhausted.status, 0, exhausted.stderr);
    assert.match(exhausted.stdout, /Agotados hoy \(vuelven mañana\): opencode\/gpt-oss-120b-free/);
    assert.doesNotMatch(exhausted.stdout, /\(\+\d+ modelos más/);

    writeFileSync(checksFile, JSON.stringify({ lastRun: null, models: {} }));
    const untested = spawnSync(process.execPath, [bin, 'use', '--list'], { cwd: dir, encoding: 'utf8', env: testEnv });
    assert.equal(untested.status, 0, untested.stderr);
    assert.match(untested.stdout, /Aún no hay ranquing de modelos gratuitos: agentrelay rank --run/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use sin argumentos y sin terminal muestra el estado sin cambiar nada', () => {
  const dir = temp();
  try {
    const result = run(['use'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /En uso: codex · gpt-6-luna/);
    assert.match(result.stdout, /agentrelay use <ejecutor>/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use interactivo elige ejecutor, modelo y esfuerzo con números', async () => {
  const dir = temp();
  const saved = { ...process.env };
  const write = process.stdout.write;
  Object.assign(process.env, env(dir));
  mkdirSync(path.join(dir, 'codex'), { recursive: true });
  writeFileSync(path.join(dir, 'codex', 'models_cache.json'), JSON.stringify({ models: [
    { slug: 'gpt-6-luna', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }], default_reasoning_level: 'low' },
    { slug: 'gpt-5.5', visibility: 'list', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }], default_reasoning_level: 'medium' },
  ] }));
  // Codex (1), segundo modelo (2), esfuerzo «alto» (3: por defecto, medio, alto) y guardar como perfil «bueno».
  const answers = ['1', '2', '3', 'bueno'];
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try {
    const code = await main(['use', '--cwd', dir], { ask: async () => answers.shift() ?? '' });
    process.stdout.write = write;
    assert.equal(code, 0, output);
    const config = userConfig(dir);
    assert.equal(config.executor.model, 'gpt-5.5');
    assert.equal(config.executor.thinking, 'high');
    assert.equal(config.profiles.bueno.model, 'gpt-5.5');
  } finally {
    process.stdout.write = write;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('use interactivo ofrece los modelos de OpenCode en el orden del ranquing', async () => {
  const dir = temp();
  const saved = { ...process.env };
  const write = process.stdout.write;
  const testEnv = installFakeOpenCode(dir);
  Object.assign(process.env, testEnv);
  mkdirSync(testEnv.AGENTRELAY_HOME, { recursive: true });
  writeFileSync(path.join(dir, 'home', 'model-checks.json'), JSON.stringify({
    lastRun: '2026-10-04',
    ranking: { at: new Date().toISOString(), entries: [
      { id: 'opencode/nemotron-3-ultra-free', score: 2, seconds: 8 },
    ] },
    models: {
      'opencode/nemotron-3-ultra-free': { status: 'approved', checkedAt: '2026-10-04T10:00:00.000Z' },
      'opencode/gpt-oss-120b-free': { status: 'failed', checkedAt: '2026-10-04T10:00:00.000Z' },
    },
  }));
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };
  const answers = ['2', '1', '1', ''];
  try {
    const code = await main(['use', '--cwd', dir], { ask: async (question) => {
      output += question;
      return answers.shift() ?? '';
    } });
    assert.equal(code, 0, output);
    assert.match(output, /opencode\/nemotron-3-ultra-free  ← en uso  #1  ✔✔ 8 s/);
    assert.doesNotMatch(output, /opencode\/gpt-oss-120b-free/);
  } finally {
    process.stdout.write = write;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('use avisa cuando el archivo del proyecto vuelve a fijar el ejecutor o el modelo que se acaba de cambiar', () => {
  const dir = temp();
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'codex', model: 'gpt-6-luna' } }, null, 2));
    const changed = run(['use', 'opencode', 'deepseek/deepseek-flash'], dir);
    assert.equal(changed.status, 0, changed.stderr);
    assert.match(changed.stdout, /Ojo: este cambio NO tiene efecto en este proyecto/);
    assert.match(changed.stdout, /type, model/);
    assert.match(changed.stdout, /agentrelay use --local/);
    const local = run(['use', '--local', 'opencode', 'deepseek/deepseek-flash'], dir);
    assert.equal(local.status, 0, local.stderr);
    assert.doesNotMatch(local.stdout, /Ojo: este cambio NO tiene efecto/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('use cline devuelve un error con una sugerencia de OpenCode', () => {
  const dir = temp();
  try {
    const retired = run(['use', 'cline'], dir);
    assert.equal(retired.status, 1);
    assert.match(retired.stderr, /Ejecutor desconocido: cline[\s\S]*Cline se retiró; usa: agentrelay use opencode deepseek\/deepseek-flash/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
