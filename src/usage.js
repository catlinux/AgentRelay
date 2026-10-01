import { listRunIds, loadState } from './store.js';

const STATUS_LABELS = {
  accepted: 'aceptadas', awaiting_review: 'pendientes de revisión', running: 'en curso',
  failed: 'fallidas', escalated: 'escaladas', rejected: 'rechazadas',
};

function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

function sinceTime(value, now) {
  if (!value) return null;
  const relative = /^(\d+)(d|h)$/.exec(value);
  if (relative) return now - Number(relative[1]) * (relative[2] === 'd' ? 86400000 : 3600000);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('--since debe ser YYYY-MM-DD, Nd o Nh.');
  return Date.parse(`${value}T00:00:00Z`);
}

export function aggregateUsage(root, { since, executor, now = Date.now() } = {}) {
  const cutoff = sinceTime(since, now);
  const groups = new Map();
  const totals = { executions: 0, attempts: 0, retries: 0, escalatedRejected: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, estimatedCost: null };
  const statuses = {};
  let unreadable = 0, stale = 0;
  for (const id of listRunIds(root)) {
    let state;
    try { state = loadState(root, id); } catch { unreadable++; continue; }
    if (cutoff !== null && (!Number.isFinite(Date.parse(state.createdAt)) || Date.parse(state.createdAt) < cutoff)) continue;
    const type = state.config?.executor?.type || 'desconocido';
    if (executor && type !== executor) continue;
    statuses[state.status] = (statuses[state.status] || 0) + 1;
    if (state.status === 'running' && now - Date.parse(state.updatedAt) > 86400000) stale++;
    const attempts = Array.isArray(state.attempts) ? state.attempts : [];
    const model = attempts[0]?.model?.id || state.config?.executor?.model || 'modelo por defecto';
    const key = `${type} · ${model}`;
    if (!groups.has(key)) groups.set(key, { executor: type, model, executions: 0, attempts: 0, retries: 0, escalatedRejected: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, estimatedCost: null });
    const group = groups.get(key);
    const usageAttempts = attempts.filter((attempt) => attempt.usage && typeof attempt.usage === 'object');
    const fallback = usageAttempts.length ? null : state.usage;
    const sumUsage = (field) => fallback ? number(fallback[field]) : usageAttempts.reduce((sum, attempt) => sum + number(attempt.usage[field]), 0);
    const costAttempts = attempts.filter((attempt) => typeof attempt.usage?.totalCost === 'number' && Number.isFinite(attempt.usage.totalCost));
    group.executions++;
    group.attempts += attempts.length;
    group.retries += number(state.retriesUsed);
    group.escalatedRejected += ['escalated', 'rejected'].includes(state.status) ? 1 : 0;
    group.inputTokens += sumUsage('inputTokens'); group.outputTokens += sumUsage('outputTokens'); group.cacheReadTokens += sumUsage('cacheReadTokens');
    group.durationMs += attempts.reduce((sum, attempt) => sum + number(attempt.durationMs), 0);
    if (costAttempts.length) group.estimatedCost = number(group.estimatedCost) + costAttempts.reduce((sum, attempt) => sum + attempt.usage.totalCost, 0);
    if (group.estimatedCost === 0) group.estimatedCost = null;
    totals.executions++; totals.attempts += attempts.length; totals.retries += number(state.retriesUsed);
    totals.escalatedRejected += ['escalated', 'rejected'].includes(state.status) ? 1 : 0;
    totals.inputTokens += sumUsage('inputTokens'); totals.outputTokens += sumUsage('outputTokens'); totals.cacheReadTokens += sumUsage('cacheReadTokens');
    totals.durationMs += attempts.reduce((sum, attempt) => sum + number(attempt.durationMs), 0);
    if (costAttempts.length) totals.estimatedCost = number(totals.estimatedCost) + costAttempts.reduce((sum, attempt) => sum + attempt.usage.totalCost, 0);
    if (totals.estimatedCost === 0) totals.estimatedCost = null;
  }
  return { groups: [...groups.values()], totals, statuses, unreadable, stale };
}

export function formatDuration(ms) {
  let seconds = Math.floor(number(ms) / 1000);
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
  return `${seconds} s`;
}

function fmt(n) { return new Intl.NumberFormat('es-ES').format(n); }
function compact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil`;
  return fmt(n);
}
function cost(value) { return value === null || value <= 0 ? '-' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 4 })} USD (estimado por el ejecutor)`; }

function renderTable(headings, rows) {
  const widths = headings.map((heading, index) => Math.max(heading.length, ...rows.map((row) => row[index].length)));
  const numericColumns = new Set(headings.map((_, index) => index).filter((index) => index > 0));
  const formatRow = (row) => row.map((value, index) => numericColumns.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index])).join('  ').trimEnd();
  return [formatRow(headings), ...rows.map(formatRow)];
}

export function renderUsage(result) {
  if (!result.totals.executions) return 'Sin ejecuciones todavía.\n';
  const headings = ['Ejecutor · modelo', 'Ejecuciones', 'Intentos', 'Reintentos', 'Escaladas/rechazadas', 'Tokens entrada', 'Tokens salida', 'Tokens de caché', 'Tiempo total', 'Coste estimado'];
  const row = (label, data) => [label, fmt(data.executions), fmt(data.attempts), fmt(data.retries), fmt(data.escalatedRejected), compact(data.inputTokens), compact(data.outputTokens), compact(data.cacheReadTokens), formatDuration(data.durationMs), cost(data.estimatedCost)];
  const rows = [...result.groups.map((group) => row(`${group.executor} · ${group.model}`, group)), row('Totales', result.totals)];
  const lines = [...renderTable(headings, rows), '', ...Object.entries({ ...Object.fromEntries(Object.entries(STATUS_LABELS).map(([key, label]) => [label, result.statuses[key] || 0])), ...Object.fromEntries(Object.entries(result.statuses).filter(([key]) => !STATUS_LABELS[key]).map(([key, value]) => [key, value])) }).map(([label, value]) => `${label}: ${fmt(value)}`), `${fmt(result.unreadable)} ejecuciones ilegibles omitidas`];
  if (result.stale) lines.push(`Ojo: ${result.stale} ejecución(es) en curso desde hace más de 24 h (¿interrumpidas?)`);
  return `${lines.join('\n')}\n`;
}
