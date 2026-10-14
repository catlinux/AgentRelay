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

test('use --list --all y routing marcan modelos de OpenCode', () => {
  const dir = temp();
  try {
    const testEnv = installFakeOpenCode(dir);
    mkdirSync(testEnv.AGENTRELAY_HOME, { recursive: true });
    writeFileSync(path.join(testEnv.AGENTRELAY_HOME, 'config.json'), JSON.stringify({
      executor: { type: 'codex', model: 'gpt-6-luna' },
      routing: { mode: 'off', freeOrder: ['opencode:opencode-go/cat-jam-free'], paidOrder: ['opencode:opencode-go/deepseek-v4.1-flash'], maxSwitches: 5 },
    }));
    const listEnv = { ...testEnv, FAKE_OPENCODE_MODELS: 'opencode-go/cat-jam-free,opencode-go/longcat-2.5-preview-free,opencode-go/deepseek-v4.1-flash' };
    const result = spawnSync(process.execPath, [bin, 'use', '--list'], { cwd: dir, encoding: 'utf8', env: listEnv });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /opencode-go\/cat-jam-free {2}gratis/);
    assert.match(result.stdout, /opencode-go\/deepseek-v4\.1-flash {2}de pago/);
    assert.doesNotMatch(result.stdout, /longcat-2\.5-preview-free/);
    const all = spawnSync(process.execPath, [bin, 'use', '--list', '--all'], { cwd: dir, encoding: 'utf8', env: listEnv });
    assert.match(all.stdout, /longcat-2\.5-preview-free/);
    assert.doesNotMatch(all.stdout, /free {2}gratis|flash {2}de pago/);
    const until = new Date(Date.now() + 3_600_000);
    writeFileSync(path.join(testEnv.AGENTRELAY_HOME, 'quota.json'), JSON.stringify({
      exhausted: { 'opencode-go/cat-jam-free': { until: until.toISOString(), resetKnown: true, source: 'error' } }, quotaLog: [],
    }));
    const exhausted = spawnSync(process.execPath, [bin, 'use', '--list'], { cwd: dir, encoding: 'utf8', env: listEnv });
    assert.match(exhausted.stdout, /opencode-go\/cat-jam-free {2}agotado hasta \d{2}:\d{2}/);
  } finally {
    delete process.env.FAKE_OPENCODE_MODELS;
    rmSync(dir, { recursive: true, force: true });
  }
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
