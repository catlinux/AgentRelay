// Tarea delegada: lectura, normalización y validación.

import { readFileSync } from 'node:fs';
import { COMPLEXITIES, SELF_REVIEW_MODES } from './policy.js';

const LIST_FIELDS = ['constraints', 'files', 'acceptanceCriteria', 'validation', 'doNotModify'];

function toList(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('La tarea debe ser un objeto JSON');
  }
  const task = {
    title: String(raw.title ?? '').trim(),
    objective: String(raw.objective ?? '').trim(),
    context: String(raw.context ?? '').trim(),
    type: String(raw.type ?? 'feature').trim(),
    complexity: String(raw.complexity ?? 'normal').trim(),
    selfReview: raw.selfReview ? String(raw.selfReview).trim() : null,
  };
  for (const field of LIST_FIELDS) task[field] = toList(raw[field]);

  if (!task.objective) throw new Error('La tarea necesita un "objective"');
  if (!task.title) task.title = task.objective.split('\n')[0].slice(0, 80);
  if (!COMPLEXITIES.includes(task.complexity)) {
    throw new Error(`"complexity" debe ser ${COMPLEXITIES.join(' | ')}`);
  }
  if (task.selfReview && !SELF_REVIEW_MODES.includes(task.selfReview)) {
    throw new Error(`"selfReview" debe ser ${SELF_REVIEW_MODES.join(' | ')}`);
  }
  return task;
}

/** Lee la tarea de un archivo JSON, o de la entrada estándar si la ruta es "-". */
export function loadTask(source) {
  let text;
  try {
    text = readFileSync(source === '-' ? 0 : source, 'utf8');
  } catch (error) {
    throw new Error(`No se puede leer la tarea ${source}: ${error.message}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`La tarea no es JSON válido: ${error.message}`);
  }
  return normalizeTask(raw);
}
