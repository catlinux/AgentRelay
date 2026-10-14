import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cmdEvaluar } from '../src/evaluar-cmd.js';
import { cargarHistorial, evaluarDir } from '../src/evaluar.js';
import { loadConfig } from '../src/config.js';

const PREVIO = ['opencode:opencode-go/cat-jam-free', 'opencode:opencode-go/longcat-2.5-preview-free'];

function entorno() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-evaluar-cmd-'));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'proyecto');
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const anterior = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  const salida = [];
  const errores = [];
  return {
    home, cwd, salida, errores,
    runtime: (extra = {}) => ({
      out: (t) => salida.push(t), err: (t) => errores.push(t),
      isInstalled: async () => true, authStatus: async () => ({ ok: true }), ...extra,
    }),
    config: () => loadConfig({ cwd }).config,
    limpiar() {
      if (anterior === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = anterior;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function resultado(env, seleccion, extra = {}) {
  const entrada = { at: '2026-10-14T10:00:00.000Z', freeOrderPrevio: PREVIO, modelos: {}, seleccion };
  mkdirSync(evaluarDir(env.home), { recursive: true });
  writeFileSync(path.join(evaluarDir(env.home), 'history.json'), JSON.stringify({ runs: [entrada] }));
  return async () => ({
    informe: '# Informe', rutaInforme: path.join(evaluarDir(env.home), 'x.md'),
    seleccion, ordenados: seleccion.map((id) => ({ id })), puntuaciones: {}, freeOrderPrevio: PREVIO, sinAptos: seleccion.length === 0, ...extra,
  });
}

test('aplica solo routing.freeOrder, conserva comentarios y deja paidOrder intacto', async () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.home, 'config.json'), '{\n  // mi comentario\n  "routing": {\n    "mode": "auto"\n  }\n}\n');
    const paidAntes = env.config().routing.paidOrder;
    const code = await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar: resultado(env, ['opencode-go/a-free', 'opencode-go/b-free']) }));
    assert.equal(code, 0, env.errores.join('\n'));
    const config = env.config();
    assert.deepEqual(config.routing.freeOrder, ['opencode:opencode-go/a-free', 'opencode:opencode-go/b-free']);
    assert.deepEqual(config.routing.paidOrder, paidAntes);
    assert.equal(config.routing.mode, 'auto');
    assert.match(readFileSync(path.join(env.home, 'config.json'), 'utf8'), /\/\/ mi comentario/);
    assert.equal(cargarHistorial(env.home).runs[0].aplicado, true);
    const texto = env.salida.join('\n');
    assert.match(texto, /Orden efectivo del enrutado/);
    assert.match(texto, /1\. gpt-6-luna/);
    assert.match(texto, /2\. opencode-go\/a-free/);
  } finally { env.limpiar(); }
});

test('--no-apply y la ausencia de aptos no escriben nada', async () => {
  const env = entorno();
  try {
    const file = path.join(env.home, 'config.json');
    const code = await cmdEvaluar([], { cwd: env.cwd, 'no-apply': true }, env.runtime({ evaluar: resultado(env, ['opencode-go/a-free']) }));
    assert.equal(code, 0);
    assert.match(env.salida.join('\n'), /Propuesta sin aplicar/);
    assert.throws(() => readFileSync(file, 'utf8'));
    env.salida.length = 0;
    assert.equal(await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar: resultado(env, []) })), 0);
    assert.match(env.salida.join('\n'), /Ningún modelo es apto/);
    assert.throws(() => readFileSync(file, 'utf8'));
  } finally { env.limpiar(); }
});

test('--revert restaura el freeOrder previo y no se puede repetir', async () => {
  const env = entorno();
  try {
    await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar: resultado(env, ['opencode-go/a-free']) }));
    env.salida.length = 0;
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, revert: true }, env.runtime()), 0);
    assert.deepEqual(env.config().routing.freeOrder, PREVIO);
    assert.equal(cargarHistorial(env.home).runs[0].revertido, true);
    env.salida.length = 0;
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, revert: true }, env.runtime()), 0);
    assert.match(env.salida.join('\n'), /No hay ninguna evaluación aplicada que deshacer/);
  } finally { env.limpiar(); }
});

test('opciones inválidas dan error claro y no llaman a evaluar', async () => {
  const env = entorno();
  try {
    let llamadas = 0;
    const runtime = env.runtime({ evaluar: async () => { llamadas += 1; return {}; } });
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, revert: true, runs: '2' }, runtime), 1);
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, revert: true, models: 'x' }, runtime), 1);
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, revert: true, 'no-apply': true }, runtime), 1);
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, runs: '4' }, runtime), 1);
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, runs: 'x' }, runtime), 1);
    assert.equal(await cmdEvaluar(['sobra'], { cwd: env.cwd }, runtime), 1);
    assert.equal(llamadas, 0);
    assert.match(env.errores.join('\n'), /entre 1 y 3/);
  } finally { env.limpiar(); }
});

test('un id no gratuito rechazado por evaluar da error y código 1', async () => {
  const env = entorno();
  try {
    const evaluar = async ({ modelos }) => { assert.deepEqual(modelos, ['opencode-go/pago']); throw new Error('solo se pueden evaluar modelos gratuitos -free de tu cuenta de OpenCode Go: opencode-go/pago'); };
    assert.equal(await cmdEvaluar([], { cwd: env.cwd, models: 'opencode-go/pago' }, env.runtime({ evaluar })), 1);
    assert.match(env.errores.join('\n'), /solo se pueden evaluar modelos gratuitos/);
  } finally { env.limpiar(); }
});

test('sin OpenCode o sin sesión falla sin llamar a evaluar', async () => {
  const env = entorno();
  try {
    let llamadas = 0;
    const evaluar = async () => { llamadas += 1; return {}; };
    assert.equal(await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar, isInstalled: async () => false })), 1);
    assert.match(env.errores.join('\n'), /agentrelay executors add opencode/);
    assert.equal(await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar, authStatus: async () => ({ ok: false, message: 'sin sesión' }) })), 1);
    assert.equal(llamadas, 0);
  } finally { env.limpiar(); }
});

test('avisa cuando el config del proyecto fija routing.freeOrder', async () => {
  const env = entorno();
  try {
    writeFileSync(path.join(env.cwd, 'agentrelay.config.json'), JSON.stringify({ routing: { freeOrder: ['opencode:opencode-go/otro-free'] } }));
    const code = await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar: resultado(env, ['opencode-go/a-free']) }));
    assert.equal(code, 0, env.errores.join('\n'));
    assert.match(env.salida.join('\n'), /fija routing\.freeOrder y anula este cambio/);
  } finally { env.limpiar(); }
});

test('conserva al final los modelos no evaluados que ya estaban en freeOrder', async () => {
  const env = entorno();
  try {
    const puntuaciones = {
      'opencode-go/cat-jam-free': { estado: 'no-evaluado' },
      'opencode-go/longcat-2.5-preview-free': { estado: 'suspendido' },
    };
    const code = await cmdEvaluar([], { cwd: env.cwd }, env.runtime({ evaluar: resultado(env, ['opencode-go/a-free'], { puntuaciones }) }));
    assert.equal(code, 0, env.errores.join('\n'));
    assert.deepEqual(env.config().routing.freeOrder, ['opencode:opencode-go/a-free', 'opencode:opencode-go/cat-jam-free']);
    assert.match(env.salida.join('\n'), /Se conservan al final/);
  } finally { env.limpiar(); }
});
