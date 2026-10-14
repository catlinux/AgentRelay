// Escritura de ajustes en la configuración de usuario (~/.agentrelay/config.json) conservando comentarios.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome, loadConfig, parseJsonc } from './config.js';
import { setConfigValue, unsetConfigValue } from './config-file.js';
import { configTemplate } from './config-template.js';

export const archivoUsuario = () => path.join(agentrelayHome(), 'config.json');

/**
 * Aplica [[clave, valor]] (valor undefined = volver al valor por defecto) y deshace todo si la configuración queda inválida.
 * Devuelve la configuración cargada tras el cambio.
 */
export function escribirAjustesUsuario(edits, { cwd, configPath } = {}) {
  const file = archivoUsuario();
  const hadFile = existsSync(file);
  const previous = hadFile ? readFileSync(file, 'utf8') : configTemplate({ scope: 'user' });
  let text = previous;
  for (const [key, value] of edits) text = value === undefined ? unsetConfigValue(text, key) : setConfigValue(text, key, value);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  try {
    parseJsonc(text, file);
    return loadConfig({ cwd, configPath });
  } catch (error) {
    if (hadFile) writeFileSync(file, previous, 'utf8'); else rmSync(file, { force: true });
    throw error;
  }
}
