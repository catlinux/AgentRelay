// Eventos estructurados de una ejecución en .agentrelay/runs/<id>/events.ndjson.
// La CLI los muestra formateados por stderr en tiempo real; el archivo NDJSON
// queda como registro persistente de todo lo que ha ocurrido.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runDir } from './store.js';

/** Añade una línea JSON al events.ndjson y devuelve el evento escrito. */
export function appendEvent(root, runId, event) {
  const stored = { ...event };
  if (!stored.ts) stored.ts = new Date().toISOString();
  const file = path.join(runDir(root, runId), 'events.ndjson');
  appendFileSync(file, `${JSON.stringify(stored)}\n`);
  return stored;
}

/** Devuelve los eventos del archivo (vacío si no existe; ignora líneas no válidas). */
export function readEvents(root, runId) {
  const file = path.join(runDir(root, runId), 'events.ndjson');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Tiempo transcurrido desde `startedAtMs` según `event.ts`, como "[mm:ss]". */
function elapsed(ts, startedAtMs) {
  const seconds = Math.max(0, Math.floor((Date.parse(ts) - startedAtMs) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `[${mm}:${ss}]`;
}

const TOOL_LABELS = {
  read_files: 'lee',
  editor: 'edita',
  run_commands: 'ejecuta',
};

/**
 * Línea en español "[mm:ss] texto" para un evento, o null si no se muestra.
 * El prefijo temporal se calcula a partir de `startedAtMs`.
 */
export function formatEvent(event, startedAtMs) {
  if (!event || !event.type) return null;
  const prefix = event.ts ? `${elapsed(event.ts, startedAtMs)} ` : '';
  const fmt = (text) => `${prefix}${text}`;

  switch (event.type) {
    case 'run_start':
      return fmt(`Ejecución ${event.runId} · nivel ${event.level} (${event.levelName}) · self-review: ${event.selfReview} — ${event.title}`);
    case 'attempt_start':
      return fmt(`▶ Intento ${event.attempt} (${event.kind}) · ${event.provider}/${event.model}`);
    case 'activity': {
      if (event.kind === 'iteration') return null;
      if (event.kind === 'thinking') return fmt(`  piensa: ${event.text}`);
      if (event.kind === 'tool') return fmt(`  ${TOOL_LABELS[event.tool] ?? event.tool}: ${event.detail}`);
      if (event.kind === 'usage') return fmt(`  tokens ${event.inputTokens}/${event.outputTokens} · ${Number(event.cost ?? 0).toFixed(4)} USD`);
      if (event.kind === 'error') return fmt(`  error: ${event.message}`);
      return null;
    }
    case 'attempt_end': {
      if (event.ok) {
        const seconds = Math.round((event.durationMs || 0) / 1000);
        return fmt(`✔ Intento ${event.attempt} completado en ${seconds} s (${event.agentStatus})`);
      }
      return fmt(`✖ Intento ${event.attempt} fallido: ${event.error}`);
    }
    case 'validation': {
      const result = event.timedOut ? 'TIEMPO AGOTADO' : event.passed ? 'correcta' : `FALLA (código ${event.exitCode})`;
      return fmt(`  validación \`${event.command}\`: ${result}`);
    }
    case 'check_start':
      return fmt('  validando…');
    case 'check': {
      const parts = [`${event.changedFiles} archivo(s) modificado(s) · validación ${event.passed ? 'correcta' : 'fallida'}`];
      if (event.scopeViolations?.length) parts.push(`archivos protegidos: ${event.scopeViolations.join(', ')}`);
      return fmt(`  ${parts.join(' · ')}`);
    }
    case 'retry':
      return fmt(`↻ Corrección automática ${event.n}/${event.max}`);
    case 'self_review_start':
      return fmt('▶ Self-review del ejecutor');
    case 'self_review_skipped':
      return fmt(`  self-review separada omitida: ${event.reason}`);
    case 'status': {
      const reasons = event.reasons?.length ? ` (${event.reasons.join('; ')})` : '';
      return fmt(`■ Estado: ${event.status}${reasons}`);
    }
    case 'review': {
      // Solo la primera línea: el feedback completo queda en state.json.
      const first = String(event.feedback ?? '').trim().split(/\r?\n/)[0];
      const feedback = first ? ` — ${first.length > 160 ? `${first.slice(0, 160)}…` : first}` : '';
      return fmt(`Revisión del orquestador: ${event.decision}${feedback}`);
    }
    default:
      return null;
  }
}
