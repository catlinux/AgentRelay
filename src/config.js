// Carga de configuración por capas (la última gana):
//   valores integrados <- valores del ejecutor elegido <- archivo personal
//   (~/.agentrelay/config.json) <- settings.json <- agentrelay.config.json <- agentrelay.config.local.json
//   <- opciones de línea de comandos.
// Todos los archivos admiten comentarios (JSONC). Ver `agentrelay config`.

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMPLEXITIES, POLICY_REVIEWS, SELF_REVIEW_MODES } from './policy.js';

export const CONFIG_FILE = 'agentrelay.config.json';
export const LOCAL_CONFIG_FILE = 'agentrelay.config.local.json';

export function agentrelayHome() {
  return process.env.AGENTRELAY_HOME || path.join(os.homedir(), '.agentrelay');
}

export const DEFAULT_CONFIG = Object.freeze({
  executor: {
    type: 'codex',
    // Programa a ejecutar. Puede ser un array: ["node", "ruta/a/cline"].
    command: 'codex',
    provider: null,
    model: 'gpt-6-luna',
    // low | medium | high | xhigh | max (Codex con GPT-6 Luna; Cline también admite none); null deja el valor por defecto del ejecutor.
    thinking: null,
    timeoutSeconds: 1200,
    extraArgs: [],
    // Codex: permite la red dentro de su sandbox (por defecto la tiene cerrada).
    network: true,
    apiFallback: true,
  },
  validation: {
    // Comandos que se ejecutan siempre, además de los de cada tarea.
    commands: [],
    timeoutSeconds: 600,
  },
  // Ajustes que sustituyen a la política por defecto (ver src/policy.js).
  policy: {},
  report: { maxDiffChars: 60000, maxOutputChars: 4000 },
});

// Valores por defecto de `executor` según el ejecutor elegido: cada CLI tiene su
// propio comando y, a veces, no tiene proveedor ni modelo. El usuario siempre
// puede sobrescribirlos.
export const EXECUTOR_DEFAULTS = Object.freeze({
  cline: { command: 'cline', provider: 'deepseek', model: 'deepseek-v4-pro' },
  codex: { command: 'codex', provider: null, model: 'gpt-6-luna' },
  opencode: { command: 'opencode', provider: null, model: 'opencode/nemotron-3-ultra-free' },
});
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function merge(base, override) {
  if (!isObject(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) result[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

/**
 * Sustituye los comentarios (de línea y de bloque) y las comas finales por espacios, sin
 * tocar los saltos de línea ni el contenido de las cadenas, para que las
 * posiciones de los errores coincidan con las del archivo original.
 */
export function stripJsonc(text) {
  const chars = String(text).split('');
  let quote = false;
  let escaped = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], n = chars[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quote = false;
    } else if (c === '"') quote = true;
    else if (c === '/' && n === '/') {
      chars[i] = chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') chars[i++] = ' ';
      i--;
    } else if (c === '/' && n === '*') {
      chars[i] = chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
        i++;
      }
      if (i < chars.length) { chars[i] = chars[i + 1] = ' '; i++; }
    }
  }
  let quoteState = false;
  let escapeState = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quoteState) {
      if (escapeState) escapeState = false;
      else if (c === '\\') escapeState = true;
      else if (c === '"') quoteState = false;
    } else if (c === '"') quoteState = true;
    else if (c === ',') {
      let next = i + 1;
      while (next < chars.length && /\s/.test(chars[next])) next++;
      if (chars[next] === '}' || chars[next] === ']') chars[i] = ' ';
    }
  }
  return chars.join('');
}

/** Lee JSON con comentarios y comas finales; los errores indican línea y columna. */
export function parseJsonc(text, file = '<configuración>') {
  const source = String(text).replace(/^\uFEFF/, '');
  const cleaned = stripJsonc(source);
  try { return JSON.parse(cleaned); } catch (error) {
    const match = /position\s+(\d+)/i.exec(error.message);
    const token = /Unexpected token ['"](.+?)['"]/i.exec(error.message);
    const position = match ? Number(match[1]) : token ? Math.max(0, cleaned.lastIndexOf(token[1])) : cleaned.length;
    const before = cleaned.slice(0, position);
    const line = before.split('\n').length;
    const column = position - before.lastIndexOf('\n');
    throw new Error(`No se puede leer la configuración ${file} (línea ${line}, columna ${column}): JSONC no válido`);
  }
}

function readConfig(file) {
  try { return parseJsonc(readFileSync(file, 'utf8'), file); }
  catch (error) {
    if (error.message.startsWith('No se puede leer la configuración')) throw error;
    throw new Error(`No se puede leer la configuración ${file}: ${error.message}`);
  }
}
const KNOWN = {
  '': ['executor', 'validation', 'policy', 'report', 'profiles'],
  executor: ['type', 'command', 'provider', 'model', 'thinking', 'timeoutSeconds', 'extraArgs', 'network', 'apiFallback'],
  validation: ['commands', 'timeoutSeconds'],
  policy: ['review', 'maxRetries', 'autoFix', 'requireValidation', 'selfReview', 'skipPassMaxFiles'],
  'policy.selfReview': COMPLEXITIES,
  report: ['maxDiffChars', 'maxOutputChars'],
};
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = old; }
  }
  return row[b.length];
}
function leaves(value, prefix = '', result = {}) {
  if (isObject(value) && Object.keys(value).length) for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, result);
  else result[prefix] = value;
  return result;
}

export function loadConfig({ cwd = process.cwd(), configPath, overrides, home } = {}) {
  const root = path.resolve(cwd);
  const userFile = path.join(home || agentrelayHome(), 'config.json');
  const settingsFile = path.join(home || agentrelayHome(), 'settings.json');
  const projectFiles = configPath ? [path.resolve(root, configPath)] : [path.join(root, CONFIG_FILE), path.join(root, LOCAL_CONFIG_FILE)];
  const layers = [{ data: {}, origin: 'defecto' }];
  const sources = [];
  const warnings = [];
  if (existsSync(userFile)) { layers.push({ data: readConfig(userFile), origin: userFile }); sources.push(userFile); }
  if (existsSync(settingsFile)) { layers.push({ data: readConfig(settingsFile), origin: settingsFile }); sources.push(settingsFile); }
  if (existsSync(settingsFile)) warnings.push(`Archivo antiguo ${settingsFile}: ejecuta 'agentrelay config migrate'`);
  const localFile = path.join(root, LOCAL_CONFIG_FILE);
  if (existsSync(localFile)) warnings.push(`Archivo antiguo ${localFile}: ejecuta 'agentrelay config migrate'`);
  for (const file of projectFiles) if (configPath || existsSync(file)) { layers.push({ data: readConfig(file), origin: file }); sources.push(file); }
  if (overrides) layers.push({ data: overrides, origin: 'línea de comandos' });
  let mergedUser = {};
  for (const layer of layers.slice(1)) mergedUser = merge(mergedUser, layer.data);
  const type = mergedUser.executor?.type ?? DEFAULT_CONFIG.executor.type;
  if (!Object.prototype.hasOwnProperty.call(EXECUTOR_DEFAULTS, type)) throw new Error(`Ejecutor no soportado: ${type} (disponibles: ${Object.keys(EXECUTOR_DEFAULTS).join(', ')})`);

  let config = merge(merge({}, DEFAULT_CONFIG), { executor: EXECUTOR_DEFAULTS[type] });
  const origins = Object.fromEntries(Object.keys(leaves(DEFAULT_CONFIG)).map((k) => [k, 'defecto']));
  for (const key of Object.keys(EXECUTOR_DEFAULTS[type])) origins[`executor.${key}`] = `defecto del ejecutor ${type}`;
  for (const layer of layers.slice(1)) {
    if (!isObject(layer.data)) throw new Error(`Configuración no válida en ${layer.origin}: configuración debe ser un objeto`);
    config = merge(config, layer.data);
    const updateOrigins = (obj, prefix = '') => {
      if (!isObject(obj)) { origins[prefix] = layer.origin; return; }
      for (const [key, value] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (isObject(value)) updateOrigins(value, full);
        else origins[full] = layer.origin;
      }
    };
    updateOrigins(layer.data);
    if (isObject(layer.data) && Object.hasOwn(layer.data, 'level')) {
      warnings.push(`La opción level ya no existe y se ignora (${layer.origin}).`);
      delete config.level;
    }
    const checkKeys = (obj, prefix = '') => {
      if (!isObject(obj)) return;
      for (const [key, value] of Object.entries(obj)) {
        const parent = prefix;
        if (parent === '' && key === 'level') continue;
        if (!(KNOWN[parent] || []).includes(key)) {
          const candidate = Object.keys(KNOWN[parent] || {}).length ? KNOWN[parent].find((k) => distance(key, k) <= 2) : null;
          warnings.push(`Clave desconocida ${prefix ? `${prefix}.` : ''}${key} en ${layer.origin}${candidate ? `; quizá quisiste decir ${candidate}` : ''}.`);
        } else if (!(prefix === '' && key === 'profiles')) checkKeys(value, prefix ? `${prefix}.${key}` : key);
      }
    };
    checkKeys(layer.data);
  }
  const originError = (key) => origins[key] || 'defecto';
  const invalid = (key, explanation) => { throw new Error(`Configuración no válida en ${originError(key)}: ${key} ${explanation}`); };
  for (const key of ['executor', 'validation', 'policy', 'report']) if (!isObject(config[key])) invalid(key, 'debe ser un objeto');
  if (!Object.hasOwn(EXECUTOR_DEFAULTS, config.executor.type)) throw new Error(`Ejecutor no soportado: ${config.executor.type} (disponibles: ${Object.keys(EXECUTOR_DEFAULTS).join(', ')})`);
  if (!(config.executor.thinking === null || ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(config.executor.thinking))) invalid('executor.thinking', 'debe ser null, none, low, medium, high, xhigh o max');
  for (const key of ['executor.timeoutSeconds', 'validation.timeoutSeconds']) { const n = config[key.split('.')[0]][key.split('.')[1]]; if (typeof n !== 'number' || !(n > 0)) invalid(key, 'debe ser un número positivo'); }
  if (!Array.isArray(config.executor.extraArgs) || !config.executor.extraArgs.every((v) => typeof v === 'string')) invalid('executor.extraArgs', 'debe ser una lista de textos');
  if (typeof config.executor.network !== 'boolean') invalid('executor.network', 'debe ser booleano');
  if (typeof config.executor.apiFallback !== 'boolean') invalid('executor.apiFallback', 'debe ser booleano');
  if (!(typeof config.executor.command === 'string' || (Array.isArray(config.executor.command) && config.executor.command.every((v) => typeof v === 'string')))) invalid('executor.command', 'debe ser un texto o una lista de textos');
  for (const key of ['report.maxDiffChars', 'report.maxOutputChars']) { const n = config.report[key.split('.')[1]]; if (!Number.isInteger(n) || n <= 0) invalid(key, 'debe ser un entero positivo'); }
  if (!Array.isArray(config.validation.commands) || !config.validation.commands.every((v) => typeof v === 'string')) invalid('validation.commands', 'debe ser una lista de textos');
  if (config.policy.review !== undefined && !POLICY_REVIEWS.includes(config.policy.review)) invalid('policy.review', `debe ser ${POLICY_REVIEWS.join(', ')}`);
  if (config.policy.maxRetries !== undefined && (!Number.isInteger(config.policy.maxRetries) || config.policy.maxRetries < 0)) invalid('policy.maxRetries', 'debe ser un entero mayor o igual que 0');
  for (const key of ['autoFix', 'requireValidation']) if (config.policy[key] !== undefined && typeof config.policy[key] !== 'boolean') invalid(`policy.${key}`, 'debe ser booleano');
  if (config.policy.selfReview !== undefined) {
    if (!isObject(config.policy.selfReview)) invalid('policy.selfReview', 'debe ser un objeto');
    for (const [k, v] of Object.entries(config.policy.selfReview)) if (!COMPLEXITIES.includes(k) || !SELF_REVIEW_MODES.includes(v)) invalid(`policy.selfReview.${k}`, `debe usar trivial, normal o complex y un modo ${SELF_REVIEW_MODES.join(', ')}`);
  }
  // Perfiles de `agentrelay use --save`: { nombre: { type, model, thinking } }.
  if (config.profiles !== undefined) {
    if (!isObject(config.profiles)) invalid('profiles', 'debe ser un objeto');
    for (const [name, profile] of Object.entries(config.profiles)) {
      if (!isObject(profile) || !Object.hasOwn(EXECUTOR_DEFAULTS, profile.type)) invalid(`profiles.${name}`, `debe indicar un ejecutor válido (${Object.keys(EXECUTOR_DEFAULTS).join(', ')})`);
    }
  }
  if (config.policy.skipPassMaxFiles !== undefined && (!Number.isInteger(config.policy.skipPassMaxFiles) || config.policy.skipPassMaxFiles < 0)) invalid('policy.skipPassMaxFiles', 'debe ser un entero mayor o igual que 0');
  return { config, sources, origins, warnings };
}
