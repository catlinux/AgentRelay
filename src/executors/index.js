// Registro de ejecutores. Cada ejecutor exporta `name`, `run()` y `version()`;
// los adaptadores también pueden exportar authStatus() y login() opcionales.

import * as codex from './codex.js';
import * as gemini from './gemini.js';
import * as opencode from './opencode.js';

const EXECUTORS = { codex, gemini, opencode };

export function getExecutor(type) {
  const executor = EXECUTORS[type];
  if (!executor) {
    throw new Error(`Ejecutor no soportado: ${type} (disponibles: ${Object.keys(EXECUTORS).join(', ')})`);
  }
  return executor;
}
