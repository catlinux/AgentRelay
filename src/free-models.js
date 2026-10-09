// Descubre los modelos gratuitos de OpenCode a partir de models.dev.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome } from './config.js';
import { isFreeModel } from './model-check.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = 'models-dev.json';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validProvider(value) {
  return isObject(value) && isObject(value.models);
}

function validProviders(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, provider]) => validProvider(provider)));
}

function cacheShape(value) {
  if (!isObject(value) || typeof value.fetchedAt !== 'string'
    || !Number.isFinite(Date.parse(value.fetchedAt)) || !validProvider(value.opencode)) return null;
  const providers = validProviders(value.providers);
  if (!providers.opencode) providers.opencode = value.opencode;
  return { fetchedAt: value.fetchedAt, opencode: value.opencode, providers };
}

/** Descarga y valida el JSON de models.dev. */
export async function fetchModelsDev({ fetchFn = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchFn !== 'function') throw new Error('No hay una función fetch disponible para consultar models.dev');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchFn(MODELS_DEV_URL, { signal: controller.signal });
    if (!response?.ok) throw new Error(`No se pudo consultar models.dev (HTTP ${response?.status ?? 'desconocido'})`);
    let data;
    try { data = await response.json(); }
    catch { throw new Error('La respuesta de models.dev no contiene JSON válido'); }
    if (!isObject(data) || !validProvider(data.opencode)) {
      throw new Error('La respuesta de models.dev no contiene un proveedor opencode válido');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Lee la caché local; devuelve null si no existe o no tiene una estructura válida. */
export function readCache(home = agentrelayHome()) {
  try {
    return cacheShape(JSON.parse(readFileSync(path.join(home, CACHE_FILE), 'utf8')));
  } catch {
    return null;
  }
}

/** Escribe los proveedores válidos y reemplaza el archivo de forma atómica. */
export function writeCache(home = agentrelayHome(), data) {
  const providers = validProviders(data?.providers);
  const provider = data?.opencode ?? providers.opencode;
  if (!validProvider(provider)) throw new Error('No se puede guardar la caché: falta un proveedor opencode válido');
  const cache = cacheShape({
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    opencode: provider,
    providers: { ...providers, opencode: provider },
  });
  if (!cache) throw new Error('No se puede guardar la caché: fetchedAt no es una fecha válida');

  mkdirSync(home, { recursive: true });
  const file = path.join(home, CACHE_FILE);
  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(cache, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, file);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* El archivo temporal puede no haberse creado. */ }
    throw error;
  }
}

/** Carga metadatos frescos, con caché y degradación al sufijo si no hay red. */
export async function loadFreeMetadata({ home = agentrelayHome(), now = new Date(), fetchFn, force = false } = {}) {
  const cached = readCache(home);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const age = cached ? nowMs - Date.parse(cached.fetchedAt) : Infinity;
  if (!force && cached && age >= 0 && age < CACHE_TTL_MS) {
    return {
      models: cached.opencode.models,
      source: 'caché',
      providers: Object.fromEntries(Object.entries(cached.providers).map(([id, value]) => [id, value.models])),
    };
  }

  try {
    const data = await fetchModelsDev({ fetchFn });
    const providers = validProviders(data);
    writeCache(home, { fetchedAt: new Date(nowMs).toISOString(), opencode: data.opencode, providers });
    return {
      models: data.opencode.models,
      source: 'red',
      providers: Object.fromEntries(Object.entries(providers).map(([id, value]) => [id, value.models])),
    };
  } catch {
    if (cached) {
      return {
        models: cached.opencode.models,
        source: 'caché caducada',
        providers: Object.fromEntries(Object.entries(cached.providers).map(([id, value]) => [id, value.models])),
      };
    }
    return { models: {}, source: 'sufijo', providers: {} };
  }
}

function listedId(item) {
  return typeof item === 'string' ? item : item?.id;
}

function metadataId(id) {
  return typeof id === 'string' && id.startsWith('opencode/') ? id.slice('opencode/'.length) : id;
}

function openCodeId(id) {
  return id.startsWith('opencode/') ? id : `opencode/${id}`;
}

function isZeroCost(metadata) {
  return metadata?.cost?.input === 0 && metadata?.cost?.output === 0;
}

function releaseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Descubre modelos gratuitos conocidos para los proveedores conectados. */
export function discoverProviderModels({ providers = {}, connected = [], live = {} } = {}) {
  const connectedIds = Array.isArray(connected) ? connected : [];
  const candidates = [];

  for (const provider of connectedIds) {
    const models = providers?.[provider];
    if (!isObject(models)) continue;
    const liveIds = Array.isArray(live?.[provider]) ? new Set(live[provider]) : null;
    for (const [modelId, metadata] of Object.entries(models)) {
      const context = metadata?.limit?.context;
      if (!isObject(metadata) || metadata.cost?.input !== 0 || metadata.cost?.output !== 0
        || metadata.tool_call !== true || typeof context !== 'number' || context < 64000
        || (liveIds && !liveIds.has(modelId))) continue;
      candidates.push({
        id: `${provider}/${modelId}`,
        provider,
        name: metadata.name ?? null,
        context,
        reasoning: metadata.reasoning ?? null,
        releaseDate: metadata.release_date ?? null,
      });
    }
  }

  candidates.sort((a, b) => {
    const aDate = releaseTimestamp(a.releaseDate);
    const bDate = releaseTimestamp(b.releaseDate);
    if (aDate === null) return bDate === null ? 0 : 1;
    if (bDate === null) return -1;
    return bDate - aDate;
  });
  return candidates;
}

/** Cruza los modelos de la cuenta con metadatos y devuelve los candidatos gratuitos. */
export function discoverFreeModels({ listed = [], metadata = {}, source = 'sufijo', includeUnlisted = true } = {}) {
  const models = metadata instanceof Map ? Object.fromEntries(metadata) : metadata;
  // Solo el proveedor opencode: los de otros proveedores (ollama, etc.) no son los gratuitos de OpenCode Zen.
  const ids = Array.isArray(listed)
    ? listed.map(listedId).filter((id) => typeof id === 'string' && (!id.includes('/') || id.startsWith('opencode/')))
    : [];
  const listedMetadataIds = new Set(ids.map(metadataId));
  const candidates = [];
  const hasMetadata = Object.keys(models || {}).length > 0;

  for (const id of ids) {
    const model = models?.[metadataId(id)];
    const hasModelMetadata = isObject(model);
    let reason;
    if (hasModelMetadata && isZeroCost(model)) {
      reason = 'metadatos';
    } else if (hasModelMetadata && (model.cost?.input > 0 || model.cost?.output > 0)) {
      continue;
    } else if (isFreeModel(id)) {
      reason = 'sufijo';
    } else if (hasMetadata) {
      reason = 'sin precio conocido';
    } else {
      continue;
    }
    candidates.push({
      id,
      free: true,
      listed: true,
      reason,
      name: model?.name ?? null,
      context: model?.limit?.context ?? null,
      reasoning: model?.reasoning ?? null,
      toolCall: model?.tool_call ?? null,
      releaseDate: model?.release_date ?? null,
    });
  }

  const unlistedModels = Object.entries(models || {})
    .filter(([id, model]) => isObject(model) && isZeroCost(model) && !listedMetadataIds.has(metadataId(id)))
    .map(([id, model]) => ({
      id: openCodeId(metadataId(id)),
      free: true,
      listed: false,
      reason: 'metadatos, no listado',
      name: model?.name ?? null,
      context: model?.limit?.context ?? null,
      reasoning: model?.reasoning ?? null,
      toolCall: model?.tool_call ?? null,
      releaseDate: model?.release_date ?? null,
    }));
  const unlisted = unlistedModels.map(({ id }) => id);
  if (includeUnlisted) candidates.push(...unlistedModels);

  const listedPriority = (candidate) => candidate.reason === 'sin precio conocido' ? 1 : 0;
  candidates.sort((a, b) => {
    if (a.listed !== b.listed) return a.listed ? -1 : 1;
    if (a.listed && listedPriority(a) !== listedPriority(b)) return listedPriority(a) - listedPriority(b);
    const aDate = releaseTimestamp(a.releaseDate);
    const bDate = releaseTimestamp(b.releaseDate);
    if (aDate === null) return bDate === null ? 0 : 1;
    if (bDate === null) return -1;
    return bDate - aDate;
  });

  Object.defineProperty(candidates, 'unlisted', { value: unlisted, enumerable: true });
  return candidates;
}
