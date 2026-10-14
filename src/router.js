// Enrutado de ejecutores (routing.mode = "auto"): lista ordenada de entradas,
// primero las gratuitas y después las de pago, filtrada por el estado de cuota.
//
// Una entrada es { key, type, model, api, paid, quotaId, tier, trainsOnData, label }:
//   - key identifica la entrada en los eventos y el informe ("codex:gpt-6-luna", "codex-api:gpt-6-luna"…).
//   - quotaId es la clave de src/quota-state.js con la que se marca y consulta su cuota.

import { EXECUTOR_DEFAULTS } from './config.js';
import { getProvider } from './free-providers.js';

export const CODEX_FREE_QUOTA = 'codex:chatgpt';

function providerOf(model) {
  const slash = typeof model === 'string' ? model.indexOf('/') : -1;
  return slash > 0 ? model.slice(0, slash) : null;
}

function trainsOnDataFor(type, model) {
  if (type !== 'opencode') return false;
  return getProvider(providerOf(model))?.trainsOnData ?? null;
}

/** Convierte "tipo:modelo" de routing.paidOrder en una entrada de pago. */
export function parsePaidEntry(spec) {
  const match = /^(opencode|codex|codex-api):(\S+)$/.exec(String(spec));
  if (!match) return null;
  const [, kind, model] = match;
  const api = kind === 'codex-api';
  const type = api ? 'codex' : kind;
  return {
    key: spec, type, model, api, paid: true, quotaId: `paid:${spec}`, tier: null,
    trainsOnData: trainsOnDataFor(type, model), label: api ? `${model} por API (pago)` : `${model} (pago)`,
  };
}

/**
 * Entradas en orden de preferencia, sin filtrar por cuota:
 * Luna con la cuota gratuita de ChatGPT, los gratuitos de freeOrder y los de pago.
 * El esfuerzo no filtra: el orden de freeOrder lo decide el usuario.
 */
export function routeEntries({ config } = {}) {
  const entries = [];
  const keys = new Set();
  const codexModel = config.executor.type === 'codex' && config.executor.model
    ? config.executor.model : EXECUTOR_DEFAULTS.codex.model;
  const luna = {
    key: `codex:${codexModel}`, type: 'codex', model: codexModel, api: false, paid: false,
    quotaId: CODEX_FREE_QUOTA, tier: 'A', trainsOnData: false, label: `${codexModel} (cuota gratuita de ChatGPT)`,
  };
  entries.push(luna);
  keys.add(luna.key);
  for (const spec of config.routing?.freeOrder ?? []) {
    const match = /^opencode:(\S+)$/.exec(String(spec));
    if (!match) continue;
    const [, model] = match;
    const key = `opencode:${model}`;
    if (keys.has(key)) continue;
    entries.push({
      key, type: 'opencode', model, api: false, paid: false,
      quotaId: model, tier: null, trainsOnData: trainsOnDataFor('opencode', model), label: `${model} (gratis)`,
    });
    keys.add(key);
  }
  for (const spec of config.routing?.paidOrder ?? []) {
    const entry = parsePaidEntry(spec);
    if (entry && !keys.has(entry.key)) {
      entries.push(entry);
      keys.add(entry.key);
    }
  }
  return entries;
}

/**
 * Primera entrada utilizable a partir de la lista. `isAvailable(quotaId)` consulta la cuota
 * y `isUsable(entry)` (opcional, asíncrona) comprueba instalación y sesión. Devuelve también
 * las entradas descartadas con su motivo, para el informe.
 */
export async function pickEntry(entries, { isAvailable, isUsable = async () => ({ ok: true }), exclude = [] } = {}) {
  const skipped = [];
  for (const entry of entries) {
    if (exclude.includes(entry.key)) continue;
    if (!isAvailable(entry.quotaId)) { skipped.push({ key: entry.key, reason: 'cuota agotada' }); continue; }
    const usable = await isUsable(entry);
    if (!usable.ok) { skipped.push({ key: entry.key, reason: usable.reason || 'no disponible' }); continue; }
    return { entry, skipped };
  }
  return { entry: null, skipped };
}

/**
 * Configuración de ejecutor para una entrada. Si el tipo coincide con el configurado se
 * conservan sus ajustes (comando, argumentos); si no, se parte de los valores por defecto
 * de ese ejecutor. El respaldo interno de Codex se desactiva: el enrutador decide.
 */
export function executorFor(entry, base) {
  const sameType = base.type === entry.type;
  const executor = {
    ...(sameType ? base : { ...EXECUTOR_DEFAULTS[entry.type], extraArgs: [] }),
    type: entry.type,
    model: entry.model,
    provider: sameType ? base.provider : EXECUTOR_DEFAULTS[entry.type].provider,
    thinking: base.thinking,
    timeoutSeconds: base.timeoutSeconds,
    network: base.network,
  };
  if (entry.type === 'codex') {
    executor.apiFallback = false;
    executor.forceApi = entry.api;
  }
  return executor;
}
