// Pruebas sintéticas y clasificación de modelos gratuitos de OpenCode.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyExecutorError } from './executors/common.js';
import { buildProbe, loadChecks, PROBE_TASK, runSyntheticProbe, saveChecks } from './model-check.js';
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

export function classifyProbeFailure(raw, record) {
  if (record?.status === 'approved') return null;
  const errorText = `${raw?.error ?? ''} ${raw?.rawError ?? ''}`;
  const executorFailure = classifyExecutorError(errorText);
  if (executorFailure) return executorFailure;
  if (/model not found|model unavailable|ProviderModelNotFoundError|unknown model|model (?:.*? )?(?:is )?not (?:available|supported)|does not exist|no such model/i.test(errorText)) return 'unavailable';
  if (raw?.timedOut || /tiempo agotado|tiempo máximo|tiempo maximo|timeout|timed out/i.test(record?.reason ?? '')) return 'timeout';
  return 'fail';
}

const ANSI = new RegExp(String.fromCharCode(27) + '\[[0-9;]*m', 'g');

function failureDetail(raw) {
  const clean = (value) => String(value ?? '').replace(ANSI, '').replace(/s+/g, ' ').trim();
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

function rankingOrder(a, b) {
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

export async function rankModels({ candidates = [], executor, adapter, max = Infinity, all = false, home, now = new Date(), probes, log = () => {}, stopAfterQuota = 3 }) {
  const orderedCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => Number(a.candidate?.toolCall === false) - Number(b.candidate?.toolCall === false) || a.index - b.index)
    .map(({ candidate }) => candidate);
  const selected = all ? orderedCandidates : orderedCandidates.slice(0, Math.max(0, max));
  const basicProbe = probes?.basic ?? ((options) => runSyntheticProbe({ ...options, build: buildProbe, task: PROBE_TASK }));
  const hardProbe = probes?.hard ?? ((options) => runSyntheticProbe({ ...options, build: buildHardProbe, task: HARD_TASK }));
  const entries = [];
  let stoppedBy = null;
  let quotaStreak = 0;
  let lastChecks;

  for (let index = 0; index < selected.length; index += 1) {
    const candidate = selected[index];
    const common = { id: candidate.id, executor, adapter, now };
    const rawBasic = await safelyProbe(basicProbe, { ...common, build: buildProbe, task: PROBE_TASK }, now);
    const basic = probeView(rawBasic);
    let hard = null;
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
      }
    }

    const score = Number(basic.status === 'approved') + Number(hard?.status === 'approved');
    const kind = score === 2 ? 'ok' : score === 1 ? 'parcial' : failedKind ?? 'fail';
    const seconds = basic.seconds + (hard?.seconds ?? 0);
    const entry = {
      id: candidate.id,
      name: candidate.name,
      listed: candidate.listed,
      source: candidate.reason,
      context: candidate.context,
      reasoning: candidate.reasoning,
      basic,
      hard,
      detail,
      score,
      seconds,
      kind,
    };
    entries.push(entry);

    if (home) {
      lastChecks ??= loadChecks(home);
      lastChecks.models[candidate.id] = {
        status: basic.status,
        checkedAt: rawBasic?.checkedAt ?? now.toISOString(),
        seconds: basic.seconds,
        reason: basic.reason,
      };
      saveChecks(lastChecks, home);
    }

    if (failedKind === 'quota') quotaStreak += 1;
    else if (failedKind !== 'unavailable') quotaStreak = 0;
    log(entry);
    if (stopAfterQuota > 0 && quotaStreak >= stopAfterQuota) {
      stoppedBy = 'cuota';
      break;
    }
  }

  entries.sort(rankingOrder);
  const testedIds = new Set(entries.map((entry) => entry.id));
  const skipped = orderedCandidates.filter((candidate) => !testedIds.has(candidate.id)).map((candidate) => candidate.id);

  if (home) {
    lastChecks ??= loadChecks(home);
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
  return notes.join(', ');
}

export function renderRanking(result, { date, unlisted = [], total } = {}) {
  const localDay = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const dateText = date instanceof Date ? localDay(date) : String(date ?? '');
  const lines = [
    `Ranquing de modelos gratuitos de OpenCode — ${dateText}`,
    'La cuota restante no se puede consultar; se deduce de los resultados de estas pruebas.',
  ];
  const headers = ['#', 'Modelo', 'Prueba 1', 'Prueba 2', 'Tiempo', 'Nota'];
  const rows = (result?.entries ?? []).map((entry, index) => [
    String(index + 1),
    String(entry.id),
    testMark(entry.basic),
    testMark(entry.hard),
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
    lines.push(`Sin probar: ${untested} de ${totalCount} (usa --all para probarlos todos).`);
  }
  if (unlisted.length) {
    const shown = unlisted.slice(0, 5);
    lines.push(`Gratuitos según models.dev que tu cuenta no lista: ${shown.join(', ')}${unlisted.length > 5 ? ', …' : ''}.`);
  }
  return lines.join('\n');
}
