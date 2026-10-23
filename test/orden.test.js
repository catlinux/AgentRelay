import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cmdOrden } from '../src/orden.js';
import { ejecutorDeAtajo, resolverGratuito, resolverPago } from '../src/catalogo-ia.js';
import { parseUseArgs } from '../src/use.js';
import { loadConfig } from '../src/config.js';
import { registrarGasto } from '../src/gasto.js';

function entorno() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-orden-'));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'proyecto');
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const anterior = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  const salida = [];
  const errores = [];
  const runtime = { out: (t) => salida.push(t), err: (t) => errores.push(t), now: new Date('2026-10-15T10:00:00'), interactivo: false };
  return {
    home, cwd, salida, errores, runtime,
    ejecutar: (...args) => cmdOrden(args, { cwd }, runtime),
    config: () => loadConfig({ cwd }).config,
    texto: () => salida.join('\n'),
    limpiar() {
      if (anterior === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = anterior;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('sin argumentos muestra el orden efectivo: Luna gratis, Antigravity gratis y pago', async () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.home, 'config.json'), '{\n  "routing": {\n    "mode": "auto"\n  }\n}\n');
    assert.equal(await env.ejecutar(), 0);
    const texto = env.texto();
    assert.match(texto, /1\. Luna · cuenta de ChatGPT \(Codex\) · gratis · disponible · sin uso registrado/);
    assert.match(texto, /2\. Antigravity · cuenta de Google \(Gemini\) · gratis · disponible · sin uso registrado/);
    assert.match(texto, /3\. Antigravity · cuenta de Google \(claude-sonnet-4-6\) · gratis · disponible · sin uso registrado/);
    assert.match(texto, /4\. DeepSeek Flash · suscripción de OpenCode Go · de pago · disponible · sin uso registrado/);
    assert.doesNotMatch(texto, /5\. /);
  } finally { env.limpiar(); }
});

test('muestra gasto por ruta y el menú interactivo aplica la selección', async () => {
  const env = entorno();
  try {
    registrarGasto('codex:gpt-6-luna', { inputTokens: 120, outputTokens: 30, totalCost: 0.0123 }, { home: env.home, now: env.runtime.now });
    assert.equal(await env.ejecutar(), 0);
    assert.match(env.texto(), /hoy: 1 intentos, 150 tokens \(120\/30\), \$0\.0123 · total:/);
    env.runtime.interactivo = true;
    env.runtime.preguntar = async () => '1';
    assert.equal(await env.ejecutar(), 0);
    assert.deepEqual(env.config().routing.paidOrder, ['opencode:opencode-go/gpt-6-luna']);
  } finally { env.limpiar(); }
});

test('menú Enter y opción inválida no cambian configuración; no interactivo no pregunta', async () => {
  const env = entorno();
  try {
    const previo = env.config().routing.paidOrder;
    env.runtime.preguntar = async () => { throw new Error('no debe preguntar'); };
    assert.equal(await env.ejecutar(), 0);
    env.runtime.interactivo = true;
    env.runtime.preguntar = async () => '';
    assert.equal(await env.ejecutar(), 0);
    assert.deepEqual(env.config().routing.paidOrder, previo);
    env.runtime.preguntar = async () => '99';
    assert.equal(await env.ejecutar(), 0);
    assert.deepEqual(env.config().routing.paidOrder, previo);
    assert.match(env.texto(), /Número inválido/);
  } finally { env.limpiar(); }
});

test('con el enrutado apagado lo dice y explica cómo activarlo', async () => {
  const env = entorno();
  try {
    await env.ejecutar();
    assert.match(env.texto(), /enrutado está apagado[\s\S]*agentrelay set routing auto/);
  } finally { env.limpiar(); }
});

test('pago con un solo nombre cambia la IA de pago y no deja otras detrás', async () => {
  const env = entorno();
  try {
    assert.equal(await env.ejecutar('pago', 'deepseek-pro-go'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.paidOrder, ['opencode:opencode-go/deepseek-v4-pro']);
    assert.deepEqual(env.config().routing.freeOrder, ['antigravity:auto', 'antigravity:claude-sonnet-4-6']);
  } finally { env.limpiar(); }
});

test('pago con varios nombres deja la lista exacta, incluidas Luna por Go y la API de DeepSeek', async () => {
  const env = entorno();
  try {
    assert.equal(await env.ejecutar('pago', 'deepseek-flash-go', 'luna-go', 'deepseek-flash-api'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.paidOrder, [
      'opencode:opencode-go/deepseek-v4.1-flash', 'opencode:opencode-go/gpt-6-luna', 'opencode:deepseek/deepseek-flash',
    ]);
  } finally { env.limpiar(); }
});

test('gratis solo acepta modelos -free de OpenCode Go y admite nombres cortos', async () => {
  const env = entorno();
  try {
    assert.equal(await env.ejecutar('gratis', 'step-5-preview', 'cat-jam-free'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/step-5-preview-free', 'opencode:opencode-go/cat-jam-free']);
    assert.equal(await env.ejecutar('gratis', 'opencode-go/deepseek-v4-pro'), 1);
    assert.match(env.errores.join('\n'), /no es un modelo gratuito/);
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/step-5-preview-free', 'opencode:opencode-go/cat-jam-free']);
  } finally { env.limpiar(); }
});

test('reset vuelve al orden por defecto y los comentarios del archivo se conservan', async () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.home, 'config.json'), '{\n  // mi comentario\n  "routing": {\n    "mode": "auto"\n  }\n}\n');
    await env.ejecutar('pago', 'luna-go');
    await env.ejecutar('gratis', 'step-5-preview');
    assert.equal(await env.ejecutar('reset'), 0, env.errores.join('\n'));
    const defecto = loadConfig({ cwd: env.cwd }).config.routing;
    assert.deepEqual(env.config().routing.paidOrder, defecto.paidOrder);
    assert.deepEqual(env.config().routing.freeOrder, ['antigravity:auto', 'antigravity:claude-sonnet-4-6']);
    assert.match(readFileSync(path.join(env.home, 'config.json'), 'utf8'), /\/\/ mi comentario/);
  } finally { env.limpiar(); }
});

test('nombres desconocidos y usos incorrectos dan error con código 1 sin escribir', async () => {
  const env = entorno();
  try {
    assert.equal(await env.ejecutar('pago', 'inventado'), 1);
    assert.match(env.errores.join('\n'), /Nombres válidos: .*deepseek-flash-go/);
    assert.equal(await env.ejecutar('pago', 'luna-chatgpt'), 1);
    assert.equal(await env.ejecutar('pago'), 1);
    assert.equal(await env.ejecutar('gratis'), 1);
    assert.equal(await env.ejecutar('otra'), 1);
    assert.throws(() => readFileSync(path.join(env.home, 'config.json'), 'utf8'));
  } finally { env.limpiar(); }
});

test('avisa cuando un config de proyecto fija la lista y anula el cambio', async () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.cwd, 'agentrelay.config.json'), JSON.stringify({ routing: { paidOrder: ['opencode:opencode-go/glm-5.3'] } }));
    assert.equal(await env.ejecutar('pago', 'luna-go'), 0, env.errores.join('\n'));
    assert.match(env.texto(), /fija routing\.paidOrder y anula este cambio/);
  } finally { env.limpiar(); }
});

test('resolverPago y resolverGratuito aceptan ids completos y tipo:modelo', async () => {
  assert.equal(resolverPago('opencode-go/glm-5.3'), 'opencode:opencode-go/glm-5.3');
  assert.equal(resolverPago('codex-api:gpt-6-luna'), 'codex-api:gpt-6-luna');
  assert.equal(resolverGratuito('opencode:opencode-go/cat-jam-free'), 'opencode:opencode-go/cat-jam-free');
  assert.equal(resolverGratuito('longcat-2.5'), 'opencode:opencode-go/longcat-2.5-free');
  assert.throws(() => resolverGratuito('deepseek/deepseek-flash'), /no es un modelo gratuito/);
});

test('use acepta los nombres del catálogo como atajos', async () => {
  assert.deepEqual(parseUseArgs(['deepseek-flash-go']), { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' });
  assert.deepEqual(parseUseArgs(['deepseek-pro-api', 'alto']), { type: 'opencode', model: 'deepseek/deepseek-v4-pro', thinking: 'high' });
  assert.deepEqual(parseUseArgs(['luna-chatgpt']), { type: 'codex', model: 'gpt-6-luna' });
  assert.deepEqual(ejecutorDeAtajo('luna-go'), { type: 'opencode', model: 'opencode-go/gpt-6-luna' });
  assert.throws(() => parseUseArgs(['luna-api']), /agentrelay orden pago luna-api/);
  assert.equal(ejecutorDeAtajo('nada'), null);
});
