import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome } from './config.js';

const entry = (hit, miss, output) => ({ input_hit: { offpeak: hit[0], peak: hit[1] }, input_miss: { offpeak: miss[0], peak: miss[1] }, output: { offpeak: output[0], peak: output[1] }, currency: 'USD', per: 1_000_000, schedule: 'deepseek' });
export const DEFAULT_PRICES = Object.freeze({
  'deepseek-flash': entry([0.003, 0.006], [0.15, 0.30], [0.60, 1.20]),
  'deepseek-v4-flash': entry([0.003, 0.006], [0.15, 0.30], [0.60, 1.20]),
  'deepseek-v4-pro': entry([0.022, 0.044], [0.66, 1.32], [1.98, 3.96]),
});
export const PRICES_SOURCE = { url: 'https://api-docs.deepseek.com/quick_start/pricing', checkedAt: '2026-10-01', note: 'Los precios pueden cambiar; Codex y otros modelos no están en esta tabla.' };

function validPrice(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function validateEntry(value, file, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Precios no válidos en ${file}: entrada ${id} debe ser un objeto.`);
  for (const field of ['input_hit', 'input_miss', 'output']) {
    if (value[field] !== undefined && (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field]) || Object.entries(value[field]).some(([period, price]) => !['offpeak', 'peak'].includes(period) || !validPrice(price)))) throw new Error(`Precios no válidos en ${file}: ${id}.${field} requiere números no negativos para punta y valle.`);
  }
  if (value.currency !== undefined && value.currency !== 'USD') throw new Error(`Precios no válidos en ${file}: ${id}.currency debe ser USD.`);
  if (value.per !== undefined && (!validPrice(value.per) || value.per <= 0)) throw new Error(`Precios no válidos en ${file}: ${id}.per debe ser positivo.`);
  if (value.schedule !== undefined && typeof value.schedule !== 'string') throw new Error(`Precios no válidos en ${file}: ${id}.schedule debe ser texto.`);
}
export function loadPrices(home = agentrelayHome()) {
  const file = path.join(home, 'pricing.json');
  if (!existsSync(file)) return { ...DEFAULT_PRICES };
  let user;
  try { user = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`No se puede leer el archivo de precios ${file}: JSON no válido.`); }
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error(`Precios no válidos en ${file}: debe ser un objeto por modelo.`);
  const result = { ...DEFAULT_PRICES };
  for (const [id, value] of Object.entries(user)) {
    validateEntry(value, file, id);
    const old = result[id] || {};
    result[id] = { ...old, ...value, input_hit: { ...old.input_hit, ...value.input_hit }, input_miss: { ...old.input_miss, ...value.input_miss }, output: { ...old.output, ...value.output }, currency: value.currency || old.currency || 'USD', per: value.per || old.per || 1_000_000, schedule: value.schedule ?? old.schedule };
    for (const field of ['input_hit', 'input_miss', 'output']) if (['offpeak', 'peak'].some((period) => !validPrice(result[id][field]?.[period]))) throw new Error(`Precios no válidos en ${file}: ${id}.${field} debe definir punta y valle.`);
  }
  return result;
}

const windows = [[1, 4], [6, 10]];
export function tariffAt(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getUTCDay(), hour = d.getUTCHours();
  const peak = day >= 1 && day <= 5 && windows.some(([a, b]) => hour >= a && hour < b);
  return { period: peak ? 'peak' : 'offpeak', windows };
}
export function nextChange(date) {
  const d = date instanceof Date ? date : new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
  for (let i = 0; i <= 24 * 8; i++) {
    const candidate = new Date(start + i * 3600000);
    if (tariffAt(candidate).period !== tariffAt(d).period) return candidate;
  }
  return null;
}
function partsAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'hour').value}:${parts.find((p) => p.type === 'minute').value}`;
}
export function localWindows(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return windows.map(([from, to]) => `${partsAt(new Date(monday.getTime() + from * 3600000), timeZone)}-${partsAt(new Date(monday.getTime() + to * 3600000), timeZone)}`).join(' y ');
}
export function estimateCost(usage, modelId, period, prices) {
  const price = prices?.[modelId];
  if (!price || !usage || !['peak', 'offpeak'].includes(period)) return null;
  const input = Number.isFinite(usage.inputTokens) ? Math.max(0, usage.inputTokens) : 0;
  const hit = Number.isFinite(usage.cacheReadTokens) ? Math.max(0, usage.cacheReadTokens) : 0;
  const output = Number.isFinite(usage.outputTokens) ? Math.max(0, usage.outputTokens) : 0;
  return (Math.max(0, input - hit) * price.input_miss[period] + hit * price.input_hit[period] + output * price.output[period]) / price.per;
}
