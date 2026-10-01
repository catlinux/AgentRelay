// Migración de los archivos de configuración del formato anterior.
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome, parseJsonc } from './config.js';
import { configTemplate } from './config-template.js';
import { setConfigValue } from './config-file.js';

const PROJECT_CONFIG = 'agentrelay.config.json';
const LOCAL_CONFIG = 'agentrelay.config.local.json';

function readLegacyFile(file) {
  return parseJsonc(readFileSync(file, 'utf8'), file);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flatten(value, prefix = '', result = {}) {
  if (isObject(value) && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (prefix) result[prefix] = value;
  return result;
}

function backupPath(file) {
  const first = `${file}.bak`;
  if (!existsSync(first)) return first;
  let number = 2;
  while (existsSync(`${first}${number}`)) number++;
  return `${first}${number}`;
}

export function legacyFilesFor({ home = agentrelayHome(), cwd = process.cwd() } = {}) {
  const settings = path.join(home, 'settings.json');
  const local = path.join(cwd, LOCAL_CONFIG);
  return {
    settings: existsSync(settings) ? settings : null,
    local: existsSync(local) ? local : null,
  };
}

export function migrateConfig({ home = agentrelayHome(), cwd = process.cwd(), dryRun = false } = {}) {
  const legacy = legacyFilesFor({ home, cwd });
  const inputs = [];
  const errors = [];

  for (const [kind, from] of Object.entries(legacy)) {
    if (!from) continue;
    let values;
    try {
      values = readLegacyFile(from);
      if (!isObject(values)) throw new Error(`La configuración ${from} debe ser un objeto`);
    } catch (error) {
      errors.push({ from, error: error.message });
      continue;
    }

    const into = kind === 'settings'
      ? path.join(home, 'config.json')
      : path.join(cwd, PROJECT_CONFIG);
    const scope = kind === 'settings' ? 'user' : 'project';
    const text = existsSync(into)
      ? readFileSync(into, 'utf8')
      : configTemplate({ scope });
    const current = parseJsonc(text, into);
    if (!isObject(current)) throw new Error(`La configuración ${into} debe ser un objeto`);

    const valuesByKey = flatten(values);
    let migrated = text;
    for (const [key, value] of Object.entries(valuesByKey)) migrated = setConfigValue(migrated, key, value);
    // No se escribe una salida que la herramienta de configuración no pueda volver a leer.
    parseJsonc(migrated, into);
    inputs.push({ from, into, keys: Object.keys(valuesByKey), backup: backupPath(from), migrated });
  }

  const actions = inputs.map(({ from, into, keys, backup }) => ({ from, into, keys, backup }));
  if (dryRun) return { actions, changed: false, errors };

  for (const input of inputs) {
    mkdirSync(path.dirname(input.into), { recursive: true });
    writeFileSync(input.into, input.migrated, 'utf8');
    // Recalcular justo antes del movimiento para no reemplazar una copia previa.
    const backup = backupPath(input.from);
    renameSync(input.from, backup);
    input.backup = backup;
    const action = actions.find((item) => item.from === input.from);
    action.backup = backup;
  }

  return { actions, changed: inputs.length > 0, errors };
}
