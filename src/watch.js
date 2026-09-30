// Sigue en directo los eventos de una ejecución leyendo events.ndjson
// de forma incremental por sondeo. No usa fs.watch, que no es fiable
// en todas las plataformas.

import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { formatEvent, useColor } from './events.js';
import { latestRunId, runDir } from './store.js';

/** Ruta del events.ndjson de una ejecución. */
function eventsFile(root, runId) {
  return path.join(runDir(root, runId), 'events.ndjson');
}

/** Espera intervalMs, o menos si se aborta `signal`. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Estado incremental de una ejecución que se está siguiendo. */
function newRunState() {
  return { offset: 0, pending: '', startedAtMs: null };
}

/**
 * Lee desde `state.offset` las líneas completas nuevas de events.ndjson.
 * Una línea sin salto de línea final se deja para la siguiente lectura.
 */
function readNewLines(root, runId, state) {
  const file = eventsFile(root, runId);
  let fd;
  try {
    fd = openSync(file, 'r');
  } catch {
    return [];
  }
  try {
    const size = fstatSync(fd).size;
    if (size > state.offset) {
      const length = size - state.offset;
      const buf = Buffer.alloc(length);
      const bytes = readSync(fd, buf, 0, length, state.offset);
      // Solo se consume hasta el último salto de línea: así nunca se decodifica
      // a medias un carácter UTF-8 de varios bytes que aún se está escribiendo.
      const complete = buf.subarray(0, bytes).lastIndexOf(0x0a) + 1;
      state.pending = buf.toString('utf8', 0, complete);
      state.offset += complete;
    } else if (size < state.offset) {
      // El archivo se truncó: se relee desde el principio.
      state.offset = 0;
      state.pending = '';
    }
  } finally {
    closeSync(fd);
  }
  const lines = state.pending.split('\n');
  state.pending = lines.pop();
  return lines;
}

/** Convierte las líneas en eventos; las líneas JSON inválidas se ignoran. */
function parseLines(lines) {
  const events = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Línea no válida: se ignora.
    }
  }
  return events;
}

/** Formatea un evento y entrega la línea a `write` (si no se muestra, null). */
function emitEvent(event, state, write, color) {
  if (state.startedAtMs === null && event.ts) {
    const ms = Date.parse(event.ts);
    if (Number.isFinite(ms)) state.startedAtMs = ms;
  }
  const line = formatEvent(event, state.startedAtMs ?? 0, { color });
  if (line) write(line);
}

/** Sigue una ejecución concreta hasta que deja de estar 'running'. */
async function watchRun({ root, id, write, intervalMs, signal, color }) {
  if (!existsSync(eventsFile(root, id))) throw new Error(`No existe la ejecución ${id}`);
  const state = newRunState();
  let lastStatus = null;
  let idlePolls = 0;

  for (;;) {
    if (signal?.aborted) return;
    const events = parseLines(readNewLines(root, id, state));
    if (events.length === 0) {
      if (lastStatus !== null && lastStatus !== 'running') {
        idlePolls += 1;
        if (idlePolls >= 2) return;
      }
    } else {
      idlePolls = 0;
      for (const event of events) {
        if (event.type === 'status') lastStatus = event.status;
        emitEvent(event, state, write, color);
      }
    }
    await sleep(intervalMs, signal);
  }
}

/** Sigue la ejecución más reciente y salta a cada ejecución nueva. */
async function followRuns({ root, write, intervalMs, signal, color }) {
  let current = null;
  let state = newRunState();
  let waitingShown = false;

  for (;;) {
    if (signal?.aborted) return;
    const latest = latestRunId(root);
    if (!latest) {
      if (!waitingShown) {
        write('Esperando ejecuciones…');
        waitingShown = true;
      }
      await sleep(intervalMs, signal);
      continue;
    }

    if (latest !== current) {
      current = latest;
      state = newRunState();
      write('');
      write(`── Ejecución ${latest} ──`);
    }

    for (const event of parseLines(readNewLines(root, current, state))) {
      emitEvent(event, state, write, color);
    }
    await sleep(intervalMs, signal);
  }
}

/**
 * Sigue en directo los eventos de las ejecuciones.
 * Con `id` termina solo cuando su estado deja de ser 'running'; sin `id`
 * sigue la ejecución más reciente y no termina por sí solo (solo al abortar).
 */
export async function watchRuns({ root, id, write, intervalMs = 500, signal, color = false }) {
  if (id) return watchRun({ root, id, write, intervalMs, signal, color });
  return followRuns({ root, write, intervalMs, signal, color });
}
