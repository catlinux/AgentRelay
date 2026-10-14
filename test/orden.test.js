import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cmdOrden } from '../src/orden.js';
import { ejecutorDeAtajo, resolverGratuito, resolverPago } from '../src/catalogo-ia.js';
import { parseUseArgs } from '../src/use.js';
import { loadConfig } from '../src/config.js';

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
  const runtime = { out: (t) => salida.push(t), err: (t) => errores.push(t), now: new Date('2026-10-15T10:00:00') };
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

test('sin argumentos muestra el orden efectivo: Luna gratis, gratuitos de Go y pago', () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.home, 'config.json'), '{\n  "routing": {\n    "mode": "auto"\n  }\n}\n');
    assert.equal(env.ejecutar(), 0);
    const texto = env.texto();
    assert.match(texto, /1\. Luna · cuenta de ChatGPT \(Codex\) · gratis/);
    assert.match(texto, /2\. opencode-go\/cat-jam-free · gratis/);
    assert.match(texto, /4\. DeepSeek Flash · suscripción de OpenCode Go · de pago/);
    assert.doesNotMatch(texto, /5\. /);
  } finally { env.limpiar(); }
});

test('con el enrutado apagado lo dice y explica cómo activarlo', () => {
  const env = entorno();
  try {
    env.ejecutar();
    assert.match(env.texto(), /enrutado está apagado[\s\S]*agentrelay set routing auto/);
  } finally { env.limpiar(); }
});

test('pago con un solo nombre cambia la IA de pago y no deja otras detrás', () => {
  const env = entorno();
  try {
    assert.equal(env.ejecutar('pago', 'deepseek-pro-go'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.paidOrder, ['opencode:opencode-go/deepseek-v4-pro']);
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/cat-jam-free', 'opencode:opencode-go/longcat-2.5-preview-free']);
  } finally { env.limpiar(); }
});

test('pago con varios nombres deja la lista exacta, incluidas Luna por Go y la API de DeepSeek', () => {
  const env = entorno();
  try {
    assert.equal(env.ejecutar('pago', 'deepseek-flash-go', 'luna-go', 'deepseek-flash-api'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.paidOrder, [
      'opencode:opencode-go/deepseek-v4.1-flash', 'opencode:opencode-go/gpt-6-luna', 'opencode:deepseek/deepseek-flash',
    ]);
  } finally { env.limpiar(); }
});

test('gratis solo acepta modelos -free de OpenCode Go y admite nombres cortos', () => {
  const env = entorno();
  try {
    assert.equal(env.ejecutar('gratis', 'step-5-preview', 'cat-jam-free'), 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/step-5-preview-free', 'opencode:opencode-go/cat-jam-free']);
    assert.equal(env.ejecutar('gratis', 'opencode-go/deepseek-v4-pro'), 1);
    assert.match(env.errores.join('\n'), /no es un modelo gratuito/);
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/step-5-preview-free', 'opencode:opencode-go/cat-jam-free']);
  } finally { env.limpiar(); }
});

test('reset vuelve al orden por defecto y los comentarios del archivo se conservan', () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.home, 'config.json'), '{\n  // mi comentario\n  "routing": {\n    "mode": "auto"\n  }\n}\n');
    env.ejecutar('pago', 'luna-go');
    env.ejecutar('gratis', 'step-5-preview');
    assert.equal(env.ejecutar('reset'), 0, env.errores.join('\n'));
    const defecto = loadConfig({ cwd: env.cwd }).config.routing;
    assert.deepEqual(env.config().routing.paidOrder, defecto.paidOrder);
    assert.ok(env.config().routing.freeOrder.includes('opencode:opencode-go/cat-jam-free'));
    assert.match(readFileSync(path.join(env.home, 'config.json'), 'utf8'), /\/\/ mi comentario/);
  } finally { env.limpiar(); }
});

test('nombres desconocidos y usos incorrectos dan error con código 1 sin escribir', () => {
  const env = entorno();
  try {
    assert.equal(env.ejecutar('pago', 'inventado'), 1);
    assert.match(env.errores.join('\n'), /Nombres válidos: .*deepseek-flash-go/);
    assert.equal(env.ejecutar('pago', 'luna-chatgpt'), 1);
    assert.equal(env.ejecutar('pago'), 1);
    assert.equal(env.ejecutar('gratis'), 1);
    assert.equal(env.ejecutar('otra'), 1);
    assert.throws(() => readFileSync(path.join(env.home, 'config.json'), 'utf8'));
  } finally { env.limpiar(); }
});

test('avisa cuando un config de proyecto fija la lista y anula el cambio', () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.cwd, 'agentrelay.config.json'), JSON.stringify({ routing: { paidOrder: ['opencode:opencode-go/glm-5.3'] } }));
    assert.equal(env.ejecutar('pago', 'luna-go'), 0, env.errores.join('\n'));
    assert.match(env.texto(), /fija routing\.paidOrder y anula este cambio/);
  } finally { env.limpiar(); }
});

test('resolverPago y resolverGratuito aceptan ids completos y tipo:modelo', () => {
  assert.equal(resolverPago('opencode-go/glm-5.3'), 'opencode:opencode-go/glm-5.3');
  assert.equal(resolverPago('codex-api:gpt-6-luna'), 'codex-api:gpt-6-luna');
  assert.equal(resolverGratuito('opencode:opencode-go/cat-jam-free'), 'opencode:opencode-go/cat-jam-free');
  assert.equal(resolverGratuito('longcat-2.5'), 'opencode:opencode-go/longcat-2.5-free');
  assert.throws(() => resolverGratuito('deepseek/deepseek-flash'), /no es un modelo gratuito/);
});

test('use acepta los nombres del catálogo como atajos', () => {
  assert.deepEqual(parseUseArgs(['deepseek-flash-go']), { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' });
  assert.deepEqual(parseUseArgs(['deepseek-pro-api', 'alto']), { type: 'opencode', model: 'deepseek/deepseek-v4-pro', thinking: 'high' });
  assert.deepEqual(parseUseArgs(['luna-chatgpt']), { type: 'codex', model: 'gpt-6-luna' });
  assert.deepEqual(ejecutorDeAtajo('luna-go'), { type: 'opencode', model: 'opencode-go/gpt-6-luna' });
  assert.throws(() => parseUseArgs(['luna-api']), /agentrelay orden pago luna-api/);
  assert.equal(ejecutorDeAtajo('nada'), null);
});
