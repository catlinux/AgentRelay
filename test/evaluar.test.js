import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentrelayHome } from '../src/config.js';
import {
  esGratuito, evaluarDir, cargarHistorial, descubrirModelos,
  seleccionarModelos, clasificarFallo, sondear,
} from '../src/evaluar.js';
import { FAKE_OPENCODE } from './helpers.js';
import { runProcess } from '../src/proc.js';

const NODE = process.execPath;

function tempHome() {
  return mkdtempSync(path.join(os.tmpdir(), 'agentrelay-eval-home-'));
}

test('esGratuito solo acepta ids opencode-go/*-free', () => {
  assert.equal(esGratuito('opencode-go/foo-free'), true);
  assert.equal(esGratuito('opencode-go/foo'), false);
  assert.equal(esGratuito('opencode/foo-free'), false);
  assert.equal(esGratuito('foo-free'), false);
  assert.equal(esGratuito(null), false);
});

test('evaluarDir construye la ruta', () => {
  assert.equal(evaluarDir('/tmp/home'), path.join('/tmp/home', 'evaluar'));
});

test('cargarHistorial devuelve {runs:[]} si falta o es invalido', () => {
  const home = tempHome();
  try {
    assert.deepEqual(cargarHistorial(home), { runs: [] });
    const dir = evaluarDir(home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), '{not json');
    assert.deepEqual(cargarHistorial(home), { runs: [] });
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ foo: 1 }));
    assert.deepEqual(cargarHistorial(home), { runs: [] });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('cargarHistorial lee un historial valido', () => {
  const home = tempHome();
  try {
    const dir = evaluarDir(home);
    mkdirSync(dir, { recursive: true });
    const data = { runs: [{ at: 'x', freeOrderPrevio: ['a'], modelos: { 'opencode-go/m-free': { estado: 'ok', aprobadas: 1, intentos: 1, tokens: 2, segundos: 3 } } }] };
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify(data));
    assert.deepEqual(cargarHistorial(home), data);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descubrirModelos filtra cuenta, no acepta no-free ni añade publico', async () => {
  const home = tempHome();
  try {
    const listModels = async () => ['opencode-go/alpha-free', 'opencode-go/beta', 'opencode-go/gamma-free', 'opencode-go/alpha-free'];
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'delta-free' }, 'opencode-go/epsilon-free', 'no-free-id'] }),
    });
    const res = await descubrirModelos({ executor: { command: 'opencode' }, home, fetchFn, listModels });
    assert.deepEqual(res.cuenta, ['opencode-go/alpha-free', 'opencode-go/gamma-free']);
    assert.deepEqual(res.publico, ['opencode-go/delta-free', 'opencode-go/epsilon-free']);
    assert.ok(!res.cuenta.includes('opencode-go/delta-free'));
    assert.ok(!res.cuenta.includes('opencode-go/epsilon-free'));
    for (const id of res.cuenta) assert.equal(esGratuito(id), true);
    assert.ok(res.avisos.some((a) => a.includes('opencode-go/delta-free')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descubrirModelos con fallo de red devuelve publico null y aviso', async () => {
  const home = tempHome();
  try {
    const listModels = async () => ['opencode-go/alpha-free'];
    const fetchFn = async () => { throw new Error('boom'); };
    const res = await descubrirModelos({ executor: { command: 'opencode' }, home, fetchFn, listModels });
    assert.equal(res.publico, null);
    assert.deepEqual(res.cuenta, ['opencode-go/alpha-free']);
    assert.ok(res.avisos.length > 0);
    assert.ok(res.avisos.some((a) => /catálogo público/i.test(a)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descubrirModelos calcula nuevos/retirados (vacio si no hay historial)', async () => {
  const home = tempHome();
  try {
    const dir = evaluarDir(home);
    mkdirSync(dir, { recursive: true });
    const hist = { runs: [{ at: 'prev', freeOrderPrevio: ['opencode-go/old-free'], modelos: {} }] };
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify(hist));

    const listModels = async () => ['opencode-go/new-free', 'opencode-go/keep-free'];
    const fetchFn = async () => ({ json: async () => [] });
    const res = await descubrirModelos({ executor: { command: 'opencode' }, home, fetchFn, listModels });
    assert.deepEqual(res.nuevos, ['opencode-go/keep-free', 'opencode-go/new-free']);
    assert.deepEqual(res.retirados, ['opencode-go/old-free']);
    assert.deepEqual(res.cuenta, ['opencode-go/keep-free', 'opencode-go/new-free']);

    // sin historial
    rmSync(dir, { recursive: true, force: true });
    const res2 = await descubrirModelos({ executor: { command: 'opencode' }, home, fetchFn: async () => ({ json: async () => [] }), listModels });
    assert.deepEqual(res2.nuevos, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('seleccionarModelos', () => {
  const cuenta = ['opencode-go/a-free', 'opencode-go/b-free'];
  assert.deepEqual(seleccionarModelos(cuenta, undefined), [...cuenta]);
  assert.deepEqual(seleccionarModelos(cuenta, []), [...cuenta]);
  assert.deepEqual(seleccionarModelos(cuenta, ['opencode-go/b-free']), ['opencode-go/b-free']);
  assert.throws(() => seleccionarModelos(cuenta, ['opencode-go/x-free']), /solo se pueden evaluar modelos gratuitos -free de tu cuenta de OpenCode Go: opencode-go\/x-free/);
  assert.throws(() => seleccionarModelos(cuenta, ['opencode-go/a-free', 'opencode-go/paid']), /solo se pueden evaluar modelos gratuitos -free de tu cuenta de OpenCode Go: opencode-go\/paid/);
});

test('clasificarFallo cubre todas las ramas', () => {
  assert.deepEqual(clasificarFallo({ texto: 'rate limit 429 exceeded', timedOut: false, hadEvents: false }), { tipo: 'infraestructura', causa: 'cuota' });
  assert.deepEqual(clasificarFallo({ texto: 'unauthorized 401 login', timedOut: false, hadEvents: false }), { tipo: 'infraestructura', causa: 'sin-sesion' });
  assert.deepEqual(clasificarFallo({ texto: 'model not found 404', timedOut: false, hadEvents: false }), { tipo: 'infraestructura', causa: 'modelo-no-disponible' });
  assert.deepEqual(clasificarFallo({ texto: 'ECONNRESET network', timedOut: false, hadEvents: false }), { tipo: 'infraestructura', causa: 'red' });
  assert.deepEqual(clasificarFallo({ texto: 'boom', timedOut: true, hadEvents: false }), { tipo: 'infraestructura', causa: 'tiempo' });
  assert.deepEqual(clasificarFallo({ texto: 'boom', timedOut: false, hadEvents: false }), { tipo: 'infraestructura', causa: 'otro' });
  assert.deepEqual(clasificarFallo({ texto: 'wrong output', timedOut: false, hadEvents: true }), { tipo: 'modelo', causa: 'otro' });
});

test('sondear exito con FAKE_OPENCODE (ECHO)', async () => {
  const oldEcho = process.env.FAKE_OPENCODE_ECHO;
  process.env.FAKE_OPENCODE_ECHO = '1';
  const home = tempHome();
  try {
    const executor = { command: [NODE, FAKE_OPENCODE], timeoutSeconds: 60 };
    const prevHome = process.env.AGENTRELAY_HOME;
    process.env.AGENTRELAY_HOME = home;
    const res = await sondear({ executor, modelo: 'opencode-go/x-free', timeoutMs: 5000 });
    if (prevHome === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = prevHome;
    assert.equal(res.ok, true);
    assert.equal(res.fallo, null);
    assert.ok(typeof res.segundos === 'number');
  } finally {
    if (oldEcho === undefined) delete process.env.FAKE_OPENCODE_ECHO; else process.env.FAKE_OPENCODE_ECHO = oldEcho;
    rmSync(home, { recursive: true, force: true });
  }
});

test('sondear nunca lanza y limpia temp (fallo simulado)', async () => {
  const run = async () => ({ code: null, stdout: '', stderr: 'boom', timedOut: true, durationMs: 5, error: null });
  const executor = { command: ['opencode'] };
  const res = await sondear({ executor, modelo: 'opencode-go/x-free', run, timeoutMs: 10 });
  assert.equal(res.ok, false);
  assert.equal(res.fallo.tipo, 'infraestructura');
  assert.equal(res.fallo.causa, 'tiempo');
});

test('sondear enmascara claves', async () => {
  const run = async () => ({ code: 1, stdout: '', stderr: 'bad sk-abc123', timedOut: false, durationMs: 5, error: null });
  const executor = { command: ['opencode'] };
  const res = await sondear({ executor, modelo: 'opencode-go/x-free', run, timeoutMs: 10 });
  assert.equal(res.ok, false);
  assert.ok(!res.fallo.mensaje.includes('sk-abc123'));
  assert.match(res.fallo.mensaje, /clave de API/);
});

test('ningun modelo no-free entra en cuenta', async () => {
  const home = tempHome();
  try {
    const listModels = async () => ['opencode-go/paid', 'opencode/go-free', 'opencode-go/ok-free'];
    const fetchFn = async () => ({ json: async () => ['opencode-go/paid2'] });
    const res = await descubrirModelos({ executor: { command: 'x' }, home, fetchFn, listModels });
    assert.deepEqual(res.cuenta, ['opencode-go/ok-free']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descubrirModelos ignora el prefijo opencode: del freeOrder previo al calcular retirados', async () => {
  const home = tempHome();
  try {
    const dir = evaluarDir(home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify({
      runs: [{ at: 'prev', freeOrderPrevio: ['opencode:opencode-go/keep-free', 'opencode:opencode-go/gone-free'], modelos: {} }],
    }));
    const res = await descubrirModelos({
      executor: { command: 'opencode' }, home, fetchFn: async () => ({ json: async () => [] }),
      listModels: async () => ['opencode-go/keep-free'],
    });
    assert.deepEqual(res.retirados, ['opencode-go/gone-free']);
    assert.deepEqual(res.nuevos, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('clasificarFallo no toma un desbordamiento de contexto por falta de cuota', () => {
  assert.deepEqual(
    clasificarFallo({ texto: 'context length exceeded', timedOut: false, hadEvents: true }),
    { tipo: 'modelo', causa: 'otro' },
  );
  assert.equal(clasificarFallo({ texto: 'quota exceeded', hadEvents: true }).causa, 'cuota');
});
