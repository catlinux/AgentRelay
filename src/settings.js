export const SETTING_ALIASES = Object.freeze({
  model: 'executor.model', effort: 'executor.thinking', thinking: 'executor.thinking',
  executor: 'executor.type', provider: 'executor.provider', timeout: 'executor.timeoutSeconds',
  'executor.type': 'executor.type', 'executor.model': 'executor.model', 'executor.provider': 'executor.provider',
  'executor.thinking': 'executor.thinking', 'executor.timeoutSeconds': 'executor.timeoutSeconds',
  'executor.apiFallback': 'executor.apiFallback',
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
  if (canonical === 'executor.timeoutSeconds' || canonical === 'validation.timeoutSeconds') {
    if (!/^\d+(?:\.\d+)?$/.test(value) || !(Number(value) > 0)) throw new Error(`${canonical} debe ser un número positivo.`);
    return { value: Number(value) };
  }
  if (canonical === 'executor.apiFallback') {
    if (!/^(true|false)$/i.test(value.trim())) throw new Error('executor.apiFallback debe ser true o false.');
    return { value: value.trim().toLowerCase() === 'true' };
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
