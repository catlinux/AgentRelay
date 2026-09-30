// Registro de ejecutores. Cada ejecutor exporta `name`, `run()` y `version()`.

import * as cline from './cline.js';
import * as codex from './codex.js';

const EXECUTORS = { cline, codex };

export function getExecutor(type) {
  const executor = EXECUTORS[type];
  if (!executor) {
    throw new Error(`Ejecutor no soportado: ${type} (disponibles: ${Object.keys(EXECUTORS).join(', ')})`);
  }
  return executor;
}
