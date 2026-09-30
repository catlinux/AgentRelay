// Carga de configuración: valores por defecto <- agentrelay.config.json
// <- agentrelay.config.local.json <- opciones de línea de comandos.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'agentrelay.config.json';
export const LOCAL_CONFIG_FILE = 'agentrelay.config.local.json';

export const DEFAULT_CONFIG = Object.freeze({
  level: 3,
  executor: {
    type: 'cline',
    // Programa a ejecutar. Puede ser un array: ["node", "ruta/a/cline"].
    command: 'cline',
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    // none | low | medium | high | xhigh; null deja el valor por defecto del proveedor.
    thinking: null,
    timeoutSeconds: 1200,
    extraArgs: [],
  },
  validation: {
    // Comandos que se ejecutan siempre, además de los de cada tarea.
    commands: [],
    timeoutSeconds: 600,
  },
  // Ajustes que sustituyen a los del nivel elegido (ver src/policy.js).
  policy: {},
  report: {
    maxDiffChars: 60000,
    maxOutputChars: 4000,
  },
});

// Valores por defecto de `executor` según el ejecutor elegido: cada CLI tiene su
// propio comando y, a veces, no tiene proveedor ni modelo (Codex usa la sesión
// de ChatGPT del usuario). El usuario siempre puede sobrescribirlos.
export const EXECUTOR_DEFAULTS = Object.freeze({
  cline: { command: 'cline', provider: 'deepseek', model: 'deepseek-v4-pro' },
  codex: { command: 'codex', provider: null, model: null },
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Mezcla profunda de objetos; los arrays y valores simples se sustituyen. */
export function merge(base, override) {
  if (!isPlainObject(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

function readJson(file) {
  try {
    // Editores de Windows (Bloc de notas, PowerShell) pueden guardar con BOM.
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`No se puede leer la configuración ${file}: ${error.message}`);
  }
}

export function loadConfig({ cwd, configPath, overrides } = {}) {
  const sources = [];

  const files = configPath
    ? [path.resolve(cwd, configPath)]
    : [path.join(cwd, CONFIG_FILE), path.join(cwd, LOCAL_CONFIG_FILE)];

  // Primero solo los ajustes del usuario: hacen falta para saber qué ejecutor se
  // ha elegido y aplicar sus valores por defecto antes que los del ejecutor por
  // defecto. El orden de capas no cambia (archivo, archivo local, opciones).
  let userConfig = {};
  for (const file of files) {
    if (configPath || existsSync(file)) {
      userConfig = merge(userConfig, readJson(file));
      sources.push(file);
    }
  }
  userConfig = merge(userConfig, overrides);

  const type = userConfig.executor?.type ?? DEFAULT_CONFIG.executor.type;
  if (!Object.prototype.hasOwnProperty.call(EXECUTOR_DEFAULTS, type)) {
    throw new Error(`Ejecutor no soportado: ${type} (disponibles: ${Object.keys(EXECUTOR_DEFAULTS).join(', ')})`);
  }

  let config = merge(merge({}, DEFAULT_CONFIG), { executor: EXECUTOR_DEFAULTS[type] });
  config = merge(config, userConfig);

  const level = Number(config.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error(`Nivel de orquestación no válido: ${config.level} (debe ser 1-5)`);
  }
  config.level = level;
  return { config, sources };
}
