// Motor de triaje adaptativo y almacenamiento local.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { agentrelayHome } from './config.js';

// Escala ordinal de menor a mayor coste/capacidad; no representa precios.
export const ORCHESTRATOR_LADDER = [
  { model: 'haiku', effort: 'low' }, { model: 'haiku', effort: 'medium' }, { model: 'haiku', effort: 'high' },
  { model: 'sonnet', effort: 'low' }, { model: 'sonnet', effort: 'medium' }, { model: 'sonnet', effort: 'high' }, { model: 'sonnet', effort: 'xhigh' },
  { model: 'opus', effort: 'low' }, { model: 'opus', effort: 'medium' }, { model: 'opus', effort: 'high' }, { model: 'opus', effort: 'xhigh' },
];
export const EXECUTOR_LADDER = ['low', 'medium', 'high', 'xhigh'];
const TYPES = ['query', 'mechanical', 'docs', 'implementation', 'debugging', 'design', 'review'];
const SIZES = ['small', 'normal', 'large'];
const OUTCOMES = ['over', 'ok', 'under'];
const aliases = {
  type: { consulta: 'query', mecánica: 'mechanical', documentación: 'docs', implementación: 'implementation', depuración: 'debugging', diseño: 'design', revisión: 'review' },
  size: { pequeña: 'small', grande: 'large' },
  effort: { bajo: 'low', medio: 'medium', alto: 'high', extremo: 'xhigh', extreme: 'xhigh', max: 'xhigh' },
  outcome: { sobró: 'over', bien: 'ok', 'se quedó corto': 'under' },
};
const spanish = {
  type: { query: 'consulta', mechanical: 'mecánica', docs: 'documentación', implementation: 'implementación', debugging: 'depuración', design: 'diseño', review: 'revisión' },
  size: { small: 'pequeña', normal: 'normal', large: 'grande' },
  effort: { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo' },
  outcome: { over: 'sobró', ok: 'bien', under: 'se quedó corto' },
};
export function displayLabel(field, value) { return spanish[field]?.[value] || value; }

// Valores iniciales por tipo y tamaño; el aprendizaje los sustituye al acumular señales.
export const ORCHESTRATOR_PRIORS = {
  query: { small: ['haiku', 'low'], normal: ['sonnet', 'low'], large: ['sonnet', 'medium'] },
  mechanical: { small: ['haiku', 'medium'], normal: ['sonnet', 'low'], large: ['sonnet', 'medium'] },
  docs: { small: ['haiku', 'medium'], normal: ['sonnet', 'low'], large: ['sonnet', 'medium'] },
  implementation: { small: ['sonnet', 'low'], normal: ['sonnet', 'medium'], large: ['sonnet', 'high'] },
  debugging: { small: ['sonnet', 'medium'], normal: ['sonnet', 'high'], large: ['opus', 'high'] },
  design: { small: ['sonnet', 'high'], normal: ['opus', 'high'], large: ['opus', 'xhigh'] },
  review: { small: ['sonnet', 'medium'], normal: ['opus', 'medium'], large: ['opus', 'high'] },
};
export const EXECUTOR_PRIORS = { effort: { small: 'low', normal: 'medium', large: 'high' }, level: { small: 2, normal: 3, large: 4 } };

export function normalizeLabel(field, value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return aliases[field]?.[normalized] || normalized;
}
export function validateLabel(field, value) {
  const choices = { type: TYPES, size: SIZES, model: ['haiku', 'sonnet', 'opus'], effort: EXECUTOR_LADDER, outcome: OUTCOMES, kind: ['orchestrator', 'executor'] }[field];
  const label = normalizeLabel(field, value);
  if (!choices?.includes(label)) throw new Error(`Valor no válido para ${field}: ${value}. Valores válidos: ${choices?.join(', ') || ''}`);
  return label;
}
export function orchestratorIndex(model, effort) { return ORCHESTRATOR_LADDER.findIndex((x) => x.model === model && x.effort === normalizeLabel('effort', effort)); }
export function orchestratorLabel(index) { const x = ORCHESTRATOR_LADDER[Math.max(0, Math.min(ORCHESTRATOR_LADDER.length - 1, index))]; return `${x.model}-${displayLabel('effort', x.effort)}`; }
export function executorIndex(effort) { return EXECUTOR_LADDER.indexOf(normalizeLabel('effort', effort)); }
export function executorLabel(index) { return displayLabel('effort', EXECUTOR_LADDER[Math.max(0, Math.min(EXECUTOR_LADDER.length - 1, index))]); }
export const triageFile = (home = agentrelayHome()) => path.join(home, 'triage.jsonl');

export function readRecords(file = triageFile()) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { const item = JSON.parse(line); return item && item.v === 1 ? [item] : []; } catch { return []; }
  });
}
export function appendRecord(record, file = triageFile()) {
  mkdirSync(path.dirname(file), { recursive: true });
  const item = { v: 1, id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, ts: new Date().toISOString(), ...record };
  appendFileSync(file, `${JSON.stringify(item)}\n`, 'utf8');
  return item;
}

function recordStep(record, kind) {
  return kind === 'orchestrator' ? orchestratorIndex(record.model, record.effort) : executorIndex(record.effort);
}
function stepDescription(step, kind) { return kind === 'orchestrator' ? orchestratorLabel(step) : executorLabel(step); }

/** Recomienda una configuración usando solo resultados del mismo tipo de tarea. */
export function advise(records, { kind = 'orchestrator', type, size }) {
  type = validateLabel('type', type); size = validateLabel('size', size);
  const exact = records.filter((r) => r.kind === kind && r.type === type && r.size === size).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const samples = exact.length >= 3 ? exact : records.filter((r) => r.kind === kind && r.type === type).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const prior = kind === 'orchestrator' ? orchestratorIndex(...ORCHESTRATOR_PRIORS[type][size]) : executorIndex(EXECUTOR_PRIORS.effort[size]);
  let step = prior, level = kind === 'executor' ? EXECUTOR_PRIORS.level[size] : undefined;
  let reason = 'Sin datos: valor inicial', exploring = false;
  const valid = samples.filter((r) => recordStep(r, kind) >= 0 && OUTCOMES.includes(r.outcome));
  const last = valid.at(-1);
  const lastUnder = valid.findLastIndex((r) => r.outcome === 'under');
  if (last?.outcome === 'under') {
    step = Math.min(kind === 'orchestrator' ? ORCHESTRATOR_LADDER.length - 1 : EXECUTOR_LADDER.length - 1, recordStep(last, kind) + 1);
    if (kind === 'executor') level = Math.min(5, (Number(last.level) || level) + 1);
    reason = `Se quedó corto con ${kind === 'orchestrator' ? orchestratorLabel(recordStep(last, kind)) : `esfuerzo ${executorLabel(recordStep(last, kind))}`} el ${String(last.ts).slice(0, 10)}: se sube un escalón`;
  } else if (last && ['ok', 'over'].includes(last.outcome)) {
    step = recordStep(last, kind);
    if (kind === 'executor') level = Math.max(1, Math.min(5, Number(last.level) || level));
    reason = `${last.outcome === 'over' ? 'Sobró' : 'Bien'} con ${stepDescription(step, kind)}: se mantiene el último valor eficaz`;
    const lastTwo = valid.slice(-2);
    const needed = lastTwo.length === 2 && lastTwo.some((r) => r.outcome === 'over') ? 2 : 3;
    const tail = valid.slice(-needed);
    if (tail.length === needed && tail.every((r) => ['ok', 'over'].includes(r.outcome) && recordStep(r, kind) === step)
      && valid.length - needed > lastUnder && step > 0) {
      step -= 1; exploring = true;
      reason = `Bien en las últimas ${needed} con ${stepDescription(step + 1, kind)}: se prueba un escalón más barato para comprobar si es excesivo`;
    }
  }
  const max = kind === 'orchestrator' ? ORCHESTRATOR_LADDER.length - 1 : EXECUTOR_LADDER.length - 1;
  step = Math.max(0, Math.min(max, step));
  const confidence = samples.length < 3 ? 'baja' : samples.length < 8 ? 'media' : 'alta';
  const result = { step: kind === 'orchestrator' ? { ...ORCHESTRATOR_LADDER[step] } : { effort: EXECUTOR_LADDER[step], level }, reason, samples: samples.length, confidence, exploring };
  return result;
}

export function comparison(advice, model, effort) {
  const current = orchestratorIndex(model, normalizeLabel('effort', effort));
  const recommended = orchestratorIndex(advice.step.model, advice.step.effort);
  return current < 0 ? null : recommended === current ? 'keep' : recommended < current ? 'down' : 'up';
}
