import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome } from './config.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const emptyGasto = () => ({ porDia: {} });
const gastoFile = (home) => path.join(home, 'gasto.json');

function fechaLocal(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadGasto(home) {
  try {
    const value = JSON.parse(readFileSync(gastoFile(home), 'utf8'));
    return isObject(value) && isObject(value.porDia) ? value : emptyGasto();
  } catch { return emptyGasto(); }
}

function saveGasto(gasto, home) {
  mkdirSync(home, { recursive: true });
  writeFileSync(gastoFile(home), `${JSON.stringify(gasto, null, 2)}\n`, 'utf8');
}

export function registrarGasto(route, usage, { home = agentrelayHome(), now = new Date() } = {}) {
  if (!route) return;
  const gasto = loadGasto(home);
  const today = fechaLocal(now);
  const record = gasto.porDia[today] ??= {};
  const entry = record[route] ??= {
    intentos: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, coste: 0,
  };
  entry.intentos++;
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    if (typeof usage?.[key] === 'number') entry[key] += usage[key];
  }
  if (typeof usage?.totalCost === 'number') entry.coste += usage.totalCost;

  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  oldest.setDate(oldest.getDate() - 89);
  const minimumDate = fechaLocal(oldest);
  for (const date of Object.keys(gasto.porDia)) if (date < minimumDate) delete gasto.porDia[date];
  saveGasto(gasto, home);
}

export function resumenGasto(route, { home = agentrelayHome(), now = new Date() } = {}) {
  const gasto = loadGasto(home);
  const summary = () => ({ intentos: 0, inputTokens: 0, outputTokens: 0, coste: 0 });
  const hoy = summary();
  const total = summary();
  const today = fechaLocal(now);
  for (const [date, entries] of Object.entries(gasto.porDia)) {
    if (!isObject(entries)) continue;
    const selected = route ? [[route, entries[route]]] : Object.entries(entries);
    for (const [, entry] of selected) {
      if (!isObject(entry)) continue;
      for (const target of [total, ...(date === today ? [hoy] : [])]) {
        for (const key of Object.keys(target)) target[key] += typeof entry[key] === 'number' ? entry[key] : 0;
      }
    }
  }
  return { hoy, total };
}
