// Registro de ejecutores. Cada ejecutor exporta `name`, `run()` y `version()`.

import * as cline from './cline.js';

const EXECUTORS = { cline };

export function getExecutor(type) {
  const executor = EXECUTORS[type];
  if (!executor) {
    throw new Error(`Ejecutor no soportado: ${type} (disponibles: ${Object.keys(EXECUTORS).join(', ')})`);
  }
  return executor;
}
