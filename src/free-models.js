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

function cacheShape(value) {
  if (!isObject(value) || typeof value.fetchedAt !== 'string'
    || !Number.isFinite(Date.parse(value.fetchedAt)) || !validProvider(value.opencode)) return null;
  return { fetchedAt: value.fetchedAt, opencode: value.opencode };
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

/** Escribe únicamente el proveedor opencode y reemplaza el archivo de forma atómica. */
export function writeCache(home = agentrelayHome(), data) {
  const provider = data?.opencode;
  if (!validProvider(provider)) throw new Error('No se puede guardar la caché: falta un proveedor opencode válido');
  const cache = cacheShape({
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    opencode: provider,
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
    return { models: cached.opencode.models, source: 'caché' };
  }

  try {
    const data = await fetchModelsDev({ fetchFn });
    writeCache(home, { fetchedAt: new Date(nowMs).toISOString(), opencode: data.opencode });
    return { models: data.opencode.models, source: 'red' };
  } catch {
    if (cached) return { models: cached.opencode.models, source: 'caché caducada' };
    return { models: {}, source: 'sufijo' };
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

/** Cruza los modelos de la cuenta con metadatos y devuelve los candidatos gratuitos. */
export function discoverFreeModels({ listed = [], metadata = {}, source = 'sufijo' } = {}) {
  const models = metadata instanceof Map ? Object.fromEntries(metadata) : metadata;
  const ids = Array.isArray(listed) ? listed.map(listedId).filter((id) => typeof id === 'string') : [];
  const listedMetadataIds = new Set(ids.map(metadataId));
  const candidates = [];

  for (const id of ids) {
    const model = models?.[metadataId(id)];
    const hasMetadata = isObject(model);
    if (hasMetadata ? !isZeroCost(model) : !isFreeModel(id)) continue;
    candidates.push({
      id,
      free: true,
      reason: hasMetadata ? 'metadatos' : 'sufijo',
      name: model?.name ?? null,
      context: model?.limit?.context ?? null,
      reasoning: model?.reasoning ?? null,
      toolCall: model?.tool_call ?? null,
      releaseDate: model?.release_date ?? null,
    });
  }

  candidates.sort((a, b) => {
    const aDate = releaseTimestamp(a.releaseDate);
    const bDate = releaseTimestamp(b.releaseDate);
    if (aDate === null) return bDate === null ? 0 : 1;
    if (bDate === null) return -1;
    return bDate - aDate;
  });

  const unlisted = Object.entries(models || {})
    .filter(([id, model]) => isObject(model) && isZeroCost(model) && !listedMetadataIds.has(metadataId(id)))
    .map(([id]) => openCodeId(metadataId(id)));
  Object.defineProperty(candidates, 'unlisted', { value: unlisted, enumerable: true });
  return candidates;
}
