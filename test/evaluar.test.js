import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentrelayHome } from '../src/config.js';
import {
  esGratuito, evaluarDir, cargarHistorial, descubrirModelos,
  seleccionarModelos, clasificarFallo, sondear,
  ejecutarTarea, puntuarModelo, ordenarAptos, seleccionarFreeOrder,
  renderInforme, guardarResultado, evaluar,
} from '../src/evaluar.js';
import { FIXTURE, TAREAS, escribirFixture } from '../src/evaluar-tareas.js';
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
const CONTRATO_REF = `export function slugify(s) {
  let out = '';
  for (const ch of String(s).toLowerCase().normalize('NFD')) {
    const cp = ch.codePointAt(0);
    if (cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(s, n, suffix = '…') {
  if (n <= 0) return '';
  if (suffix.length > n) return suffix.slice(0, n);
  if (s.length <= n) return s;
  return s.slice(0, n - suffix.length) + suffix;
}
`;

function makeState(overrides = {}) {
  return {
    status: 'accepted',
    attempts: [{
      durationMs: 100,
      ok: true,
      report: { status: 'done', summary: 'ok', filesChanged: [], checks: [], issues: [], questions: [], needsEscalation: false },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, estimatedCost: 0 },
      iterations: 1,
      toolCalls: 1,
      error: null,
    }],
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, estimatedCost: 0 },
    lastCheck: { scopeViolations: [] },
    ...overrides,
  };
}

test('ejecutarTarea con solución de referencia queda aprobada', async () => {
  const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'evaluar-et-'));
  try {
    const tarea = TAREAS.find((t) => t.id === 'contrato');
    const startRun = async ({ root }) => {
      mkdirSync(path.join(root, 'src'), { recursive: true });
      writeFileSync(path.join(root, 'src', 'text.js'), CONTRATO_REF, 'utf8');
      return makeState();
    };
    const res = await ejecutarTarea({ executor: { command: ['node'] }, modelo: 'opencode-go/x-free', tarea, startRun, tmpBase });
    assert.equal(res.aprobada, true);
    assert.equal(res.fallo, null);
    assert.equal(res.violacionAlcance, false);
    assert.deepEqual(readdirSync(tmpBase), []);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('ejecutarTarea sin cambios suspende con fallo modelo', async () => {
  const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'evaluar-et-'));
  try {
    const tarea = TAREAS.find((t) => t.id === 'contrato');
    const startRun = async () => makeState();
    const res = await ejecutarTarea({ executor: { command: ['node'] }, modelo: 'opencode-go/x-free', tarea, startRun, tmpBase });
    assert.equal(res.aprobada, false);
    assert.equal(res.fallo.tipo, 'modelo');
    assert.deepEqual(readdirSync(tmpBase), []);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('ejecutarTarea que modifica LEGACY suspende con violación de alcance', async () => {
  const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'evaluar-et-'));
  try {
    const tarea = TAREAS.find((t) => t.id === 'parar');
    const startRun = async ({ root }) => {
      writeFileSync(path.join(root, 'LEGACY.md'), 'changed', 'utf8');
      return makeState();
    };
    const res = await ejecutarTarea({ executor: { command: ['node'] }, modelo: 'opencode-go/x-free', tarea, startRun, tmpBase });
    assert.equal(res.aprobada, false);
    assert.equal(res.violacionAlcance, true);
    assert.equal(res.fallo.tipo, 'modelo');
    assert.deepEqual(readdirSync(tmpBase), []);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('ejecutarTarea que lanza quota exceeded queda infraestructura/cuota', async () => {
  const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'evaluar-et-'));
  try {
    const tarea = TAREAS.find((t) => t.id === 'contrato');
    const startRun = async () => {
      throw new Error('quota exceeded');
    };
    const res = await ejecutarTarea({ executor: { command: ['node'] }, modelo: 'opencode-go/x-free', tarea, startRun, tmpBase });
    assert.equal(res.aprobada, false);
    assert.equal(res.fallo.tipo, 'infraestructura');
    assert.equal(res.fallo.causa, 'cuota');
    assert.deepEqual(readdirSync(tmpBase), []);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('puntuarModelo estados y medias (runs=2)', () => {
  const mk = (approved, tok, sec) => Array.from({ length: 4 }, (_, i) => ({
    aprobada: i < approved,
    intentos: 1,
    tokens: { entrada: tok, salida: 0, cache: 5 },
    segundos: sec,
    violacionAlcance: false,
    fallo: null,
  }));
  const runs = [mk(4, 10, 1), mk(2, 20, 3)];
  const p = puntuarModelo(runs);
  assert.equal(p.estado, 'apto');
  assert.equal(p.aprobadas, 3);
  assert.equal(p.tokens, 60);
  assert.equal(p.segundos, 8);
  assert.deepEqual(p.dispersion, { min: 2, max: 4 });

  const ok = puntuarModelo([mk(4, 10, 1)]);
  assert.equal(ok.estado, 'apto');
  assert.equal(ok.motivo, null);

  const infraRun = [mk(1, 1, 1)];
  infraRun[0][0].fallo = { tipo: 'infraestructura', causa: 'red', mensaje: 'boom' };
  assert.equal(puntuarModelo(infraRun).estado, 'no-evaluado');
});

test('ordenarAptos respeta empate técnico por orden previo', () => {
  const pts = {
    'opencode-go/b-free': { estado: 'apto', aprobadas: 4, intentos: 4, tokens: 100, segundos: 10, violaciones: 0, dispersion: { min: 4, max: 4 }, motivo: null },
    'opencode-go/a-free': { estado: 'apto', aprobadas: 4, intentos: 4, tokens: 100, segundos: 10, violaciones: 0, dispersion: { min: 4, max: 4 }, motivo: null },
  };
  const ord = ordenarAptos(pts, ['opencode:opencode-go/a-free']);
  assert.deepEqual(ord.map((x) => x.id), ['opencode-go/a-free', 'opencode-go/b-free']);
  assert.equal(ord[0].empateTecnico, true);
  assert.equal(ord[1].empateTecnico, true);
});

test('seleccionarFreeOrder selecciona 2 y tercero solo si cumple', () => {
  const two = [
    { id: 'a', aprobadas: 4, intentos: 4, tokens: 10, segundos: 5 },
    { id: 'b', aprobadas: 3, intentos: 5, tokens: 20, segundos: 6 },
  ];
  assert.deepEqual(seleccionarFreeOrder(two), ['a', 'b']);
  const three = [
    ...two,
    { id: 'c', aprobadas: 4, intentos: 4, tokens: 5, segundos: 4 },
  ];
  assert.deepEqual(seleccionarFreeOrder(three), ['a', 'b', 'c']);
  const noThird = [
    ...two,
    { id: 'c', aprobadas: 4, intentos: 4, tokens: 30, segundos: 10 },
  ];
  assert.deepEqual(seleccionarFreeOrder(noThird), ['a', 'b']);
  assert.deepEqual(seleccionarFreeOrder([]), []);
});

test('renderInforme contiene secciones y avisa si coste > 0', () => {
  const info = renderInforme({
    fecha: new Date(2026, 9, 14, 1, 2),
    descubrimiento: { cuenta: ['opencode-go/a-free'], publico: ['opencode-go/a-free'], nuevos: [], retirados: [], avisos: [] },
    sondeos: {},
    resultados: { 'opencode-go/a-free': [{ id: 'contrato', aprobada: true, intentos: 1, segundos: 1, tokens: { entrada: 1, salida: 1, cache: 0 }, coste: 2, fallo: null, detalle: 'aprobada' }] },
    puntuaciones: { 'opencode-go/a-free': { estado: 'apto', aprobadas: 4, intentos: 4, tokens: 2, segundos: 1, violaciones: 0, dispersion: { min: 4, max: 4 }, motivo: null } },
    ordenados: [{ id: 'opencode-go/a-free', estado: 'apto', aprobadas: 4, intentos: 4, tokens: 2, segundos: 1, violaciones: 0, dispersion: { min: 4, max: 4 }, motivo: null, empateTecnico: false }],
    seleccion: ['opencode-go/a-free'],
    freeOrderPrevio: [],
    runs: 1,
    diferencias: [],
    avisos: [],
  });
  for (const h of ['## Catálogo', '## Accesibles y no evaluados', '## Tareas', '## Resultados medidos', '## Errores principales', '## Conclusión', '## Diferencias con la evaluación anterior']) {
    assert.ok(info.includes(h), h);
  }
  assert.ok(info.includes('gastó cupo') || info.includes('mayor que 0'));
  assert.ok(!info.includes('contenido secreto oculto'));
});

test('guardarResultado escribe archivo e historial recortado a 20', () => {
  const home = tempHome();
  try {
    const dir = evaluarDir(home);
    mkdirSync(dir, { recursive: true });
    const runs = Array.from({ length: 21 }, (_, i) => ({ at: `r${i}`, freeOrderPrevio: [], modelos: {}, seleccion: [] }));
    writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ runs }));
    const ahora = new Date(2026, 9, 14, 3, 4);
    const ruta = guardarResultado({ home, ahora, informe: '# h', entradaHistorial: { at: 'new', freeOrderPrevio: [], modelos: {}, seleccion: [] } });
    assert.equal(path.basename(ruta), '2026-10-14-0304.md');
    const parsed = JSON.parse(readFileSync(path.join(dir, 'history.json'), 'utf8'));
    assert.equal(parsed.runs.length, 20);
    assert.equal(parsed.runs[parsed.runs.length - 1].at, 'new');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('evaluar end-to-end con dependencias inyectadas', async () => {
  const home = tempHome();
  try {
    const calls = { a: 0 };
    const descubrirModelos = async () => ({ cuenta: ['opencode-go/good-free', 'opencode-go/bad-free'], publico: [], nuevos: [], retirados: [], avisos: [] });
    const sondear = async ({ modelo }) => {
      if (modelo === 'opencode-go/bad-free') return { ok: false, fallo: { tipo: 'infraestructura', causa: 'red', mensaje: 'boom' } };
      return { ok: true, segundos: 0.1, tokens: { entrada: 1, salida: 1, cache: 0 }, coste: 0, fallo: null };
    };
    const ejecutarTarea = async ({ modelo, tarea }) => {
      if (modelo === 'opencode-go/bad-free') throw new Error('no debe ejecutar tareas del malo');
      calls.a += 1;
      return {
        id: tarea.id, aprobada: true, intentos: 1, segundos: 0.1,
        tokens: { entrada: 1, salida: 1, cache: 0 }, coste: 0,
        violacionAlcance: false, fallo: null, detalle: 'aprobada',
      };
    };
    const freeOrderPrevio = ['opencode-go/prev-free'];
    const res = await evaluar({
      executor: { command: ['node'] },
      home,
      modelos: undefined,
      runs: 2,
      ahora: new Date(2026, 9, 14, 3, 4),
      log: () => {},
      deps: { descubrirModelos, sondear, ejecutarTarea, freeOrderPrevio },
    });
    assert.ok(res.informe.includes('# Evaluación de modelos gratuitos'));
    assert.equal(res.freeOrderPrevio, freeOrderPrevio);
    assert.equal(res.puntuaciones['opencode-go/bad-free'].estado, 'no-evaluado');
    assert.equal(res.puntuaciones['opencode-go/good-free'].estado, 'apto');
    assert.equal(res.sinAptos, false);
    assert.equal(calls.a, 8);
    await assert.rejects(() => evaluar({ executor: { command: ['node'] }, home, runs: 0, deps: { descubrirModelos, sondear, ejecutarTarea, freeOrderPrevio } }), /runs debe ser un entero entre 1 y 3/);
    await assert.rejects(() => evaluar({ executor: { command: ['node'] }, home, runs: 4, deps: { descubrirModelos, sondear, ejecutarTarea, freeOrderPrevio } }), /runs debe ser un entero entre 1 y 3/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
