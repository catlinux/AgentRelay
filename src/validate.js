// Validaciones objetivas: comandos de validación y control de archivos protegidos.

import { runShell } from './proc.js';

function tail(text, max) {
  const clean = text.trim();
  return clean.length > max ? `...\n${clean.slice(-max)}` : clean;
}

export async function runValidations(commands, { cwd, timeoutSeconds, maxOutputChars }) {
  const results = [];
  for (const command of commands) {
    const res = await runShell(command, { cwd, timeoutMs: timeoutSeconds * 1000 });
    results.push({
      command,
      exitCode: res.code,
      passed: res.code === 0 && !res.timedOut && !res.error,
      timedOut: res.timedOut,
      durationMs: res.durationMs,
      output: tail(`${res.stdout}\n${res.stderr}`, maxOutputChars),
    });
  }
  return results;
}

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Archivos modificados que la tarea declara intocables. Una entrada que
 * termina en "/" protege un directorio completo.
 */
export function scopeViolations(changedFiles, doNotModify) {
  const rules = doNotModify.map(normalize);
  return changedFiles
    .map((file) => normalize(file.path))
    .filter((file) => rules.some((rule) => (rule.endsWith('/') ? file.startsWith(rule) : file === rule)));
}
