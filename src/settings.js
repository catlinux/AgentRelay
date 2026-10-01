// Ajustes de usuario escritos por los comandos rápidos de AgentRelay.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function settingsFile(home) { return path.join(home, 'settings.json'); }

export function readSettings(home) {
  const file = settingsFile(home);
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('debe ser un objeto');
    return value;
  } catch (error) {
    throw new Error(`No se pueden leer los ajustes ${file}: ${error.message}`);
  }
}

export function writeSettings(home, obj) {
  const file = settingsFile(home);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export const SETTING_ALIASES = Object.freeze({
  model: 'executor.model', effort: 'executor.thinking', thinking: 'executor.thinking',
  executor: 'executor.type', provider: 'executor.provider', level: 'level', timeout: 'executor.timeoutSeconds',
  'executor.type': 'executor.type', 'executor.model': 'executor.model', 'executor.provider': 'executor.provider',
  'executor.thinking': 'executor.thinking', 'executor.timeoutSeconds': 'executor.timeoutSeconds',
  'validation.timeoutSeconds': 'validation.timeoutSeconds',
});

export function canonicalSetting(key) { return SETTING_ALIASES[key] || null; }

const effortAliases = new Map([
  ['bajo', 'low'], ['medio', 'medium'], ['alto', 'high'], ['extremo', 'xhigh'],
  ['maximo', 'max'], ['máximo', 'max'], ['ninguno', 'none'], ['none', 'none'],
  ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max'],
]);

export function parseSettingValue(key, value) {
  if (typeof value !== 'string') throw new Error('El valor debe ser texto.');
  if (/^(default|defecto)$/i.test(value.trim())) return { unset: true };
  const canonical = canonicalSetting(key) || key;
  if (canonical === 'level') {
    if (!/^\d+$/.test(value)) throw new Error('level debe ser un entero entre 1 y 5.');
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 5) throw new Error('level debe ser un entero entre 1 y 5.');
    return { value: number };
  }
  if (canonical === 'executor.timeoutSeconds' || canonical === 'validation.timeoutSeconds') {
    if (!/^\d+(?:\.\d+)?$/.test(value) || !(Number(value) > 0)) throw new Error(`${canonical} debe ser un número positivo.`);
    return { value: Number(value) };
  }
  if (canonical === 'executor.thinking') {
    const normalized = value.trim().toLocaleLowerCase('es');
    const result = effortAliases.get(normalized);
    if (!result) throw new Error('El esfuerzo debe ser low, medium, high, xhigh, max o none.');
    return { value: result };
  }
  if (['executor.type', 'executor.model', 'executor.provider'].includes(canonical)) {
    if (!value.trim()) throw new Error(`${canonical} no puede estar vacío.`);
    return { value: value.trim() };
  }
  throw new Error(`Opción no ajustable: ${key}`);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

export function setSetting(obj, dottedKey, value) {
  const result = clone(obj);
  const parts = dottedKey.split('.');
  let target = result;
  for (const part of parts.slice(0, -1)) target = target[part] && typeof target[part] === 'object' && !Array.isArray(target[part]) ? target[part] : (target[part] = {});
  target[parts.at(-1)] = value;
  return result;
}

export function unsetSetting(obj, dottedKey) {
  const result = clone(obj);
  const parts = dottedKey.split('.');
  const remove = (target, index) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
    if (index === parts.length - 1) { delete target[parts[index]]; return Object.keys(target).length === 0; }
    const empty = remove(target[parts[index]], index + 1);
    if (empty) delete target[parts[index]];
    return Object.keys(target).length === 0;
  };
  remove(result, 0);
  return result;
}
