// Preguntas de confirmación por terminal.

import readline from 'node:readline/promises';

const YES = new Set(['s', 'si', 'sí', 'y', 'yes']);

/**
 * Pide confirmación al usuario.
 * Devuelve true si `yes` es true (sin preguntar); si es interactivo pregunta y
 * devuelve true solo con respuesta afirmativa; si no es interactivo devuelve
 * null (no se puede preguntar).
 */
export async function confirm(question, { yes } = {}) {
  if (yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [s/N] `);
    return YES.has(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}
