// Pruebas sintéticas y clasificación de modelos gratuitos de OpenCode.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyExecutorError } from './executors/common.js';
import { buildProbe, loadChecks, MAX_SECONDS, PROBE_TASK, runSyntheticProbe, saveChecks } from './model-check.js';
import { normalizeTask } from './task.js';

export function buildHardProbe(baseDir = os.tmpdir()) {
  const root = mkdtempSync(path.join(baseDir, 'agentrelay-model-rank-'));
  const workDir = path.join(root, 'work');
  mkdirSync(workDir);
  writeFileSync(path.join(workDir, 'package.json'), '{"type":"module"}\n');
  const checkFile = path.join(root, 'check.mjs');
  writeFileSync(checkFile, `const nombresCasos = [
  'analiza una fila',
  'recorta espacios',
  'ignora comentarios',
  'ignora líneas vacías',
  'informa la línea de una edad inválida',
  'rechaza campos incompletos',
  'rechaza edades negativas',
  'rechaza edades que no son enteros',
  'agrupa con orden alfabético',
];
let analizar;
let agrupar;
try {
  ({ analizar, agrupar } = await import('./work/analizar.js'));
} catch (error) {
  console.error(nombresCasos.join(', '));
  console.error(error.message);
  process.exit(1);
}
const fallados = [];
const comprobar = (nombre, funcion) => {
  try { if (!funcion()) fallados.push(nombre); }
  catch { fallados.push(nombre); }
};
comprobar(nombresCasos[0], () => {
  const [persona] = analizar('Ana;30;Madrid');
  return persona?.nombre === 'Ana' && persona.edad === 30 && persona.ciudad === 'Madrid';
});
comprobar(nombresCasos[1], () => {
  const [persona] = analizar('  Luis ; 42 ; Barcelona  ');
  return persona?.nombre === 'Luis' && persona.edad === 42 && persona.ciudad === 'Barcelona';
});
comprobar(nombresCasos[2], () => analizar('# comentario\\nEva;21;Valencia').length === 1);
comprobar(nombresCasos[3], () => analizar('\\n\\nEva;21;Valencia\\n').length === 1);
comprobar(nombresCasos[4], () => {
  try { analizar('Eva;21;Valencia\\nLuis;no;Madrid'); }
  catch (error) { return String(error.message).includes('2'); }
  return false;
});
comprobar(nombresCasos[5], () => {
  try { analizar('Eva;21'); }
  catch (error) { return String(error.message).includes('1'); }
  return false;
});
comprobar(nombresCasos[6], () => {
  try { analizar('Eva;-1;Valencia'); }
  catch (error) { return String(error.message).includes('1'); }
  return false;
});
comprobar(nombresCasos[7], () => {
  try { analizar('Eva;;Valencia'); }
  catch (error) { return String(error.message).includes('1'); }
  return false;
});
comprobar(nombresCasos[8], () => {
  const grupos = agrupar([
    { nombre: 'Zoé', ciudad: 'Madrid' },
    { nombre: 'Luis', ciudad: 'Barcelona' },
    { nombre: 'Ana', ciudad: 'Madrid' },
    { nombre: 'Eva', ciudad: 'Barcelona' },
  ]);
  return JSON.stringify(Object.keys(grupos)) === JSON.stringify(['Barcelona', 'Madrid'])
    && JSON.stringify(grupos.Barcelona) === JSON.stringify(['Eva', 'Luis'])
    && JSON.stringify(grupos.Madrid) === JSON.stringify(['Ana', 'Zoé']);
});
if (fallados.length) {
  console.error(fallados.join(', '));
  process.exit(1);
}
console.log('OK');
`);
  return { root, workDir, checkFile };
}

export const HARD_TASK = normalizeTask({
  title: 'Analizar y agrupar datos CSV',
  objective: 'Crea analizar.js como módulo ES que exporte analizar(texto) y agrupar(personas). analizar recibe un texto CSV de líneas nombre;edad;ciudad, ignora las líneas vacías y las que empiecen por #, recorta los espacios de cada campo y devuelve un array de objetos { nombre, edad, ciudad }, donde edad es un número entero. Si una línea no tiene exactamente tres campos o la edad no es un entero mayor o igual que cero, lanza un Error cuyo mensaje incluya el número de línea basado en 1. agrupar recibe personas y devuelve un objeto que asigna cada ciudad a un array de nombres ordenados alfabéticamente con localeCompare; las claves de ciudad también deben estar en orden alfabético.',
  context: 'Es una prueba sintética aislada. No accedas a archivos fuera de este directorio.',
  files: ['analizar.js'],
  acceptanceCriteria: [
    'analizar(texto) interpreta cada fila como nombre;edad;ciudad, omite líneas vacías y líneas cuyo contenido empieza por #, recorta los espacios alrededor de los campos y devuelve objetos con nombre como texto, edad como entero numérico y ciudad como texto.',
    'analizar(texto) lanza un Error con el número de línea, contado desde 1, si una línea contiene un número distinto de tres campos o una edad que no sea un entero mayor o igual que cero.',
    'agrupar(personas) devuelve un objeto ciudad -> array de nombres; los nombres de cada array y las claves de ciudad se ordenan alfabéticamente con localeCompare.',
  ],
});

const DEEP_TESTS = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reservar, stockDisponible } from '../src/inventario.js';
import { precioTotal } from '../src/precios.js';

test('stock disponible descuenta reservas solo del almacén solicitado', () => {
  const inventario = {
    stock: { norte: { cafe: 8 }, sur: { cafe: 40 } },
    reservas: { norte: { cafe: 2 }, sur: { cafe: 5 } },
  };
  assert.equal(stockDisponible(inventario, 'norte', 'cafe'), 6);
  assert.equal(stockDisponible(inventario, 'sur', 'cafe'), 35);
  assert.equal(stockDisponible(inventario, 'norte', 'te'), 0);
});

test('reservar respeta la disponibilidad restante y permite reservarla entera', () => {
  const inventario = { stock: { norte: { cafe: 9 } }, reservas: { norte: { cafe: 4 } } };
  assert.equal(reservar(inventario, 'norte', 'cafe', 6), false);
  assert.equal(inventario.reservas.norte.cafe, 4);
  assert.equal(reservar(inventario, 'norte', 'cafe', 5), true);
  assert.equal(inventario.reservas.norte.cafe, 9);
  assert.equal(stockDisponible(inventario, 'norte', 'cafe'), 0);
});

test('reservar rechaza cantidades inválidas sin cambiar el inventario', () => {
  const inventario = { stock: { norte: { cafe: 10 } }, reservas: {} };
  for (const cantidad of [0, -1, 1.5, Number.NaN]) {
    assert.equal(reservar(inventario, 'norte', 'cafe', cantidad), false);
  }
  assert.deepEqual(inventario.reservas, {});
});

test('precio total usa el tramo más alto que alcanza la cantidad y redondea a céntimos', () => {
  const tramos = [
    { desde: 1, descuento: 0 },
    { desde: 5, descuento: 0.1 },
    { desde: 10, descuento: 0.2 },
  ];
  assert.equal(precioTotal(10, 0, tramos), 0);
  assert.equal(precioTotal(10, 4, tramos), 40);
  assert.equal(precioTotal(10, 5, tramos), 45);
  assert.equal(precioTotal(10, 10, tramos), 80);
  assert.equal(precioTotal(19.99, 3, [{ desde: 1, descuento: 0.1 }]), 53.97);
  assert.equal(precioTotal(10, 10, [...tramos].reverse()), 80);
});
`;

export function buildDeepProbe(baseDir = os.tmpdir()) {
  const root = mkdtempSync(path.join(baseDir, 'agentrelay-model-rank-deep-'));
  const workDir = path.join(root, 'work');
  const srcDir = path.join(workDir, 'src');
  const testDir = path.join(workDir, 'test');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(path.join(workDir, 'package.json'), '{"type":"module"}\n');
  writeFileSync(path.join(srcDir, 'inventario.js'), `export function stockDisponible(inventario, almacen, producto) {
  const stock = inventario.stock?.[almacen]?.[producto] ?? 0;
  const reservado = inventario.reservas?.[almacen]?.[producto] ?? 0;
  return stock;
}

export function reservar(inventario, almacen, producto, cantidad) {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) return false;
  const stock = inventario.stock?.[almacen]?.[producto] ?? 0;
  if (stock < cantidad) return false;
  inventario.reservas ??= {};
  inventario.reservas[almacen] ??= {};
  inventario.reservas[almacen][producto] = (inventario.reservas[almacen][producto] ?? 0) + cantidad;
  return true;
}
`);
  writeFileSync(path.join(srcDir, 'precios.js'), `export function precioTotal(precioUnitario, cantidad, tramos = []) {
  if (!Number.isFinite(precioUnitario) || precioUnitario < 0) throw new TypeError('Precio inválido');
  if (!Number.isSafeInteger(cantidad) || cantidad < 0) throw new TypeError('Cantidad inválida');
  let descuento = 0;
  for (const tramo of tramos) {
    if (cantidad >= tramo.desde) {
      descuento = tramo.descuento;
      break;
    }
  }
  return Math.round((precioUnitario * cantidad * (1 - descuento) + Number.EPSILON) * 100) / 100;
}
`);
  writeFileSync(path.join(testDir, 'inventario.test.js'), DEEP_TESTS);
  const testHash = createHash('sha256').update(DEEP_TESTS).digest('hex');
  const checkFile = path.join(root, 'check.mjs');
  writeFileSync(checkFile, `import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { reservar, stockDisponible } from './work/src/inventario.js';
import { precioTotal } from './work/src/precios.js';

const fallados = [];
const comprobar = (nombre, funcion) => {
  try { if (!funcion()) fallados.push(nombre); }
  catch { fallados.push(nombre); }
};
comprobar('stock reservado', () => stockDisponible({ stock: { a: { x: 7 }, b: { x: 30 } }, reservas: { a: { x: 3 }, b: { x: 20 } } }, 'a', 'x') === 4);
comprobar('reserva acumulada', () => {
  const inventario = { stock: { a: { x: 8 } }, reservas: { a: { x: 6 } } };
  return reservar(inventario, 'a', 'x', 3) === false && inventario.reservas.a.x === 6;
});
comprobar('almacén nuevo', () => {
  const inventario = { stock: { a: { x: 4 } }, reservas: {} };
  return stockDisponible(inventario, 'b', 'x') === 0 && reservar(inventario, 'b', 'x', 1) === false;
});
comprobar('límite de tramo', () => precioTotal(12.5, 6, [{ desde: 1, descuento: 0.05 }, { desde: 5, descuento: 0.2 }]) === 60);
comprobar('redondeo monetario', () => precioTotal(1.01, 3, [{ desde: 1, descuento: 0.1 }]) === 2.73);
comprobar('tests sin modificar', () => createHash('sha256').update(readFileSync('./work/test/inventario.test.js')).digest('hex') === '${testHash}');
const tests = spawnSync(process.execPath, ['--test', 'test/inventario.test.js'], { cwd: './work', encoding: 'utf8' });
if (tests.status !== 0) fallados.push('tests visibles');
if (fallados.length) {
  console.error(fallados.join(', '));
  process.exit(1);
}
console.log('OK');
`);
  return { root, workDir, checkFile };
}

export const DEEP_TASK = normalizeTask({
  title: 'Corregir inventario y precios con pruebas',
  objective: 'Corrige src/inventario.js y src/precios.js para que pasen node --test sin modificar ningún archivo de tests. En inventario.js exporta stockDisponible(inventario, almacen, producto), que devuelve el stock menos las reservas de ese almacén y producto (como mínimo cero), y reservar(inventario, almacen, producto, cantidad), que reserva solo una cantidad positiva entera que esté disponible y devuelve true; si no se puede reservar, devuelve false sin modificar el inventario. La estructura es { stock: { almacen: { producto: cantidad } }, reservas: { almacen: { producto: cantidad } } }. En precios.js exporta precioTotal(precioUnitario, cantidad, tramos): recibe un precio unitario no negativo, una cantidad entera no negativa y tramos { desde, descuento }, aplica el descuento del mayor umbral desde que no supere la cantidad (los tramos pueden venir en cualquier orden), devuelve el total redondeado a céntimos y usa descuento cero si no hay tramo aplicable. Rechaza precio o cantidad inválidos con TypeError.',
  context: 'Es una prueba sintética aislada. Revisa test/inventario.test.js para entender el contrato. Hay casos límite adicionales en una comprobación oculta. No accedas a archivos fuera de este directorio.',
  files: ['src/inventario.js', 'src/precios.js'],
  acceptanceCriteria: [
    'node --test pasa sin modificar test/inventario.test.js.',
    'stockDisponible descuenta solo las reservas del almacén y producto solicitados, devuelve cero para datos ausentes y nunca un saldo negativo.',
    'reservar no permite superar el stock disponible, acumula correctamente reservas válidas y no modifica datos cuando rechaza la reserva.',
    'precioTotal usa el mayor umbral elegible sin depender del orden de tramos, trata el umbral como inclusivo, admite cantidad cero y redondea el total a dos decimales.',
    'precioTotal lanza TypeError si el precio no es finito y no negativo o la cantidad no es un entero seguro no negativo.',
  ],
});

export function classifyProbeFailure(raw, record) {
  if (record?.status === 'approved') return null;
  const errorText = `${raw?.error ?? ''} ${raw?.rawError ?? ''}`;
  const executorFailure = classifyExecutorError(errorText);
  if (executorFailure) return executorFailure;
  if (/model not found|model unavailable|ProviderModelNotFoundError|unknown model|model (?:.*? )?(?:is )?not (?:available|supported)|does not exist|no such model/i.test(errorText)) return 'unavailable';
  if (raw?.timedOut || /tiempo agotado|tiempo máximo|tiempo maximo|timeout|timed out/i.test(record?.reason ?? '')) return 'timeout';
  return 'fail';
}

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function failureDetail(raw) {
  const clean = (value) => String(value ?? '').replace(ANSI, '').replace(/\s+/g, ' ').trim();
  const text = clean(raw?.rawError) || clean(raw?.error);
  return text ? text.slice(0, 100) : null;
}

function secondsOf(record) {
  return Number.isFinite(record?.seconds) ? record.seconds : 0;
}

function probeView(record) {
  return {
    status: record?.status === 'approved' ? 'approved' : 'failed',
    seconds: secondsOf(record),
    reason: String(record?.reason ?? 'La comprobación sintética ha fallado'),
  };
}

function kindPriority(kind) {
  return ({ fail: 0, timeout: 1, unavailable: 2, quota: 3, credentials: 4 })[kind] ?? 5;
}

export function rankingOrder(a, b) {
  if (a.apt !== b.apt) return Number(b.apt) - Number(a.apt);
  const tierPriority = (tier) => ({ A: 0, B: 1, null: 2 })[tier] ?? 2;
  if (tierPriority(a.tier) !== tierPriority(b.tier)) return tierPriority(a.tier) - tierPriority(b.tier);
  if (a.score !== b.score) return b.score - a.score;
  if (a.score === 0 && a.kind !== b.kind) return kindPriority(a.kind) - kindPriority(b.kind);
  return a.seconds - b.seconds;
}

async function safelyProbe(probe, options, now) {
  try { return await probe(options); }
  catch (error) {
    return {
      status: 'failed', checkedAt: now.toISOString(), seconds: 0,
      reason: `No se pudo ejecutar la prueba: ${error.message}`, raw: null,
    };
  }
}

function providerOf(candidate) {
  const slash = candidate.id.indexOf('/');
  return slash === -1 ? 'opencode' : candidate.id.slice(0, slash);
}

export function mergeRankEntries(previousEntries = [], updatedEntries = [], replacedProviders = []) {
  const replaced = new Set(replacedProviders);
  return [
    ...previousEntries.filter((entry) => typeof entry?.id !== 'string' || !replaced.has(providerOf(entry))),
    ...updatedEntries,
  ].sort(rankingOrder);
}

function interleaveProviders(candidates, maxPerProvider) {
  const providers = new Map();
  for (const candidate of candidates) {
    const provider = providerOf(candidate);
    const models = providers.get(provider) ?? [];
    if (models.length < maxPerProvider) models.push(candidate);
    providers.set(provider, models);
  }

  const interleaved = [];
  while ([...providers.values()].some((models) => models.length)) {
    for (const models of providers.values()) {
      if (models.length) interleaved.push(models.shift());
    }
  }
  return interleaved;
}

const RECENT_KINDS = new Set(['ok', 'parcial', 'fail', 'timeout']);
const RANKING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function reusableEntry(entry, now) {
  if (!RECENT_KINDS.has(entry?.kind)) return false;
  const checkedAt = Date.parse(entry.checkedAt);
  const age = now.getTime() - checkedAt;
  return Number.isFinite(checkedAt) && age >= 0 && age < RANKING_TTL_MS;
}

export async function rankModels({ candidates = [], executor, adapter, max = Infinity, maxPerProvider = Infinity, force = false, all = false, home, now = new Date(), probes, log = () => {}, stopAfterQuota = 3 }) {
  const orderedCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => Number(a.candidate?.toolCall === false) - Number(b.candidate?.toolCall === false) || a.index - b.index)
    .map(({ candidate }) => candidate);
  const providerLimit = Math.max(0, Math.floor(maxPerProvider));
  const interleaved = interleaveProviders(orderedCandidates, providerLimit);
  const selected = all ? interleaved : interleaved.slice(0, Math.max(0, max));
  const basicProbe = probes?.basic ?? ((options) => runSyntheticProbe({ ...options, build: buildProbe, task: PROBE_TASK }));
  const hardProbe = probes?.hard ?? ((options) => runSyntheticProbe({ ...options, build: buildHardProbe, task: HARD_TASK }));
  const deepProbe = probes?.deep ?? ((options) => runSyntheticProbe({ ...options, build: buildDeepProbe, task: DEEP_TASK }));
  const entries = [];
  const quotaStreaks = new Map();
  const stoppedProviders = new Set();
  const lastChecks = home ? loadChecks(home) : null;
  const previousEntries = new Map((Array.isArray(lastChecks?.ranking?.entries) ? lastChecks.ranking.entries : [])
    .filter((entry) => typeof entry?.id === 'string')
    .map((entry) => [entry.id, entry]));

  for (let index = 0; index < selected.length; index += 1) {
    const candidate = selected[index];
    const provider = providerOf(candidate);
    if (stoppedProviders.has(provider)) continue;
    const previous = previousEntries.get(candidate.id);
    if (!force && reusableEntry(previous, now)) {
      entries.push(previous);
      log(previous);
      continue;
    }

    const common = { id: candidate.id, executor, adapter, now };
    const rawBasic = await safelyProbe(basicProbe, { ...common, build: buildProbe, task: PROBE_TASK }, now);
    const basic = probeView(rawBasic);
    let hard = null;
    let deep = null;
    let failedKind = null;
    let detail = null;
    if (basic.status !== 'approved') {
      failedKind = classifyProbeFailure(rawBasic?.raw, rawBasic);
      detail = failureDetail(rawBasic?.raw);
    } else {
      const rawHard = await safelyProbe(hardProbe, { ...common, build: buildHardProbe, task: HARD_TASK }, now);
      hard = probeView(rawHard);
      if (hard.status !== 'approved') {
        failedKind = classifyProbeFailure(rawHard?.raw, rawHard);
        detail = failureDetail(rawHard?.raw);
      } else {
        const rawDeep = await safelyProbe(deepProbe, { ...common, build: buildDeepProbe, task: DEEP_TASK }, now);
        deep = probeView(rawDeep);
        if (deep.status !== 'approved') {
          failedKind = classifyProbeFailure(rawDeep?.raw, rawDeep);
          detail = failureDetail(rawDeep?.raw);
        }
      }
    }

    const score = Number(basic.status === 'approved') + Number(hard?.status === 'approved') + Number(deep?.status === 'approved');
    const kind = score === 3 ? 'ok' : score > 0 ? 'parcial' : failedKind ?? 'fail';
    const seconds = basic.seconds + (hard?.seconds ?? 0) + (deep?.seconds ?? 0);
    const apt = hard?.status === 'approved' && deep?.status === 'approved';
    const tier = !apt ? null : [basic, hard, deep].every((probe) => probe.seconds <= MAX_SECONDS / 2) ? 'A' : 'B';
    const entry = {
      id: candidate.id,
      checkedAt: now.toISOString(),
      name: candidate.name,
      listed: candidate.listed,
      source: candidate.reason,
      context: candidate.context,
      reasoning: candidate.reasoning,
      basic,
      hard,
      deep,
      apt,
      tier,
      detail,
      score,
      seconds,
      kind,
    };
    entries.push(entry);

    if (lastChecks) {
      lastChecks.models[candidate.id] = {
        status: basic.status,
        checkedAt: rawBasic?.checkedAt ?? now.toISOString(),
        seconds: basic.seconds,
        reason: basic.reason,
      };
      saveChecks(lastChecks, home);
    }

    let quotaStreak = quotaStreaks.get(provider) ?? 0;
    if (failedKind === 'quota') quotaStreak += 1;
    else if (failedKind !== 'unavailable') quotaStreak = 0;
    quotaStreaks.set(provider, quotaStreak);
    log(entry);
    if (stopAfterQuota > 0 && quotaStreak >= stopAfterQuota) {
      stoppedProviders.add(provider);
    }
  }

  // Una cuota alcanzada cuenta como detención aunque otros proveedores terminen sus pruebas.
  const stoppedBy = stoppedProviders.size ? 'cuota' : null;
  const testedIds = new Set(entries.map((entry) => entry.id));
  const skipped = orderedCandidates.filter((candidate) => !testedIds.has(candidate.id)).map((candidate) => candidate.id);
  // Un límite como --max no debe borrar lo ya evaluado: se conservan las entradas anteriores de los
  // candidatos que siguen existiendo pero no se han probado en esta pasada.
  for (const id of skipped) {
    const previous = previousEntries.get(id);
    if (previous) entries.push(previous);
  }
  entries.sort(rankingOrder);

  if (home) {
    lastChecks.ranking = {
      at: now.toISOString(),
      stoppedBy,
      entries: entries.map((entry) => ({ ...entry })),
    };
    saveChecks(lastChecks, home);
  }

  return { entries, skipped, stoppedBy, tested: entries.length };
}

function testMark(record) {
  if (!record) return '—';
  return record.status === 'approved' ? '✔' : '✘';
}

function contextNote(context) {
  const numeric = typeof context === 'number' ? context : Number(context);
  return Number.isFinite(numeric) && numeric >= 128000 ? 'contexto 128k' : null;
}

function noteFor(entry) {
  const notes = [];
  if (entry.kind === 'unavailable') notes.push('no disponible en tu cuenta');
  if (entry.kind === 'quota') notes.push('sin cuota o límite alcanzado');
  else if (entry.kind === 'credentials') notes.push('sin sesión');
  else if (entry.kind === 'timeout') notes.push('tiempo agotado');
  if (entry.kind === 'fail' && entry.detail) notes.push(entry.detail);
  const context = contextNote(entry.context);
  if (context) notes.push(context);
  if (entry.reasoning) notes.push('razona');
  if (entry.source === 'metadatos') notes.push('detectado por metadatos');
  else if (entry.source === 'sufijo') notes.push('por sufijo -free');
  else if (entry.source === 'sin precio conocido') notes.push('precio desconocido');
  else if (entry.source === 'metadatos, no listado') notes.push('no listado en tu cuenta');
  else if (entry.source === 'nivel gratuito con límites') notes.push('nivel gratuito con límites');
  return notes.join(', ');
}

export function renderRanking(result, { date, unlisted = [], total } = {}) {
  const localDay = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const dateText = date instanceof Date ? localDay(date) : String(date ?? '');
  const lines = [
    `Ranquing de modelos gratuitos de OpenCode — ${dateText}`,
    'La cuota restante no se puede consultar; se deduce de los resultados de estas pruebas.',
  ];
  const headers = ['#', 'Modelo', 'Prueba 1', 'Prueba 2', 'Prueba 3', 'Nivel', 'Tiempo', 'Nota'];
  const rows = (result?.entries ?? []).map((entry, index) => [
    String(index + 1),
    String(entry.id),
    testMark(entry.basic),
    testMark(entry.hard),
    testMark(entry.deep),
    entry.tier ?? '—',
    `${Number(entry.seconds || 0).toFixed(1)} s`,
    noteFor(entry),
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  lines.push(headers.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd());
  for (const row of rows) lines.push(row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd());

  const best = (result?.entries ?? []).find((entry) => entry.score > 0);
  if (best) lines.push(`Mejor: ${best.id}  →  agentrelay use opencode ${best.id}`);
  if (result?.stoppedBy === 'cuota') {
    lines.push('Pruebas detenidas: varios modelos seguidos devolvieron límite o cuota agotada; vuelve a intentarlo más tarde.');
  }

  const tested = result?.tested ?? result?.entries?.length ?? 0;
  const totalCount = total ?? tested + (result?.skipped?.length ?? 0);
  const untested = Math.max(result?.skipped?.length ?? 0, totalCount - tested);
  if ((result?.skipped?.length ?? 0) > 0 || totalCount > tested) {
    lines.push(`Sin probar: ${untested} de ${totalCount} (vuelve a lanzar sin --max para probarlos todos).`);
  }
  if (unlisted.length) {
    const shown = unlisted.slice(0, 5);
    lines.push(`Gratuitos según models.dev que tu cuenta no lista: ${shown.join(', ')}${unlisted.length > 5 ? ', …' : ''}.`);
  }
  return lines.join('\n');
}
