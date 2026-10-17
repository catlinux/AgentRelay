// Adaptador para Antigravity CLI (agy), el sustituto de Gemini CLI para cuentas personales de Google.
//
// Usa la cuenta de Google del usuario con su cuota semanal gratuita («Antigravity Starter Quota»):
// sin claves de API. Tiene dos cupos semanales separados: los modelos Gemini y el grupo
// «Claude y GPT» (Claude Opus, Claude Sonnet, GPT-OSS). Se ejecuta en modo no interactivo
// (agy -p <instrucción> --output-format json --dangerously-skip-permissions), que devuelve un único
// objeto JSON al terminar: { status, response, usage, … }. agy se instala aparte (no es un paquete
// npm) y guarda su sesión en ~/.gemini/antigravity-cli.

import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { agentrelayHome } from '../config.js';
import { runInteractive, runProcess } from '../proc.js';
import { extractAgentReport, instructionFor, tail } from './common.js';

export const name = 'antigravity';

export const installHint = 'Instálalo con: curl -fsSL https://antigravity.google/cli/install.sh | bash (Linux y macOS)';
export const loginHint = 'Ejecuta "agentrelay login antigravity" y elige «Google OAuth» con tu cuenta de Google.';

/** Carpeta de Antigravity CLI con la sesión (~/.gemini/antigravity-cli). */
export function antigravityDir(home = os.homedir()) {
  return path.join(home, '.gemini', 'antigravity-cli');
}

/** Ruta de agy: el PATH o, si no está, ~/.local/bin/agy (donde lo deja su instalador). */
export function commandParts(command, { exists = existsSync, home = os.homedir(), platform = process.platform } = {}) {
  if (command === 'agy') {
    const local = path.join(home, '.local', 'bin', platform === 'win32' ? 'agy.exe' : 'agy');
    const onPath = String(process.env.PATH || process.env.Path || '').split(path.delimiter)
      .some((dir) => dir && exists(path.join(dir, platform === 'win32' ? 'agy.exe' : 'agy')));
    if (!onPath && exists(local)) return [local];
  }
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

/** Grupo de cuota de un modelo: los Claude y GPT comparten un cupo; el resto es el de Gemini. */
export function quotaGroup(model) {
  return /claude|gpt|opus|sonnet/i.test(String(model ?? '')) ? 'claude' : 'gemini';
}

/** Argumentos del modo no interactivo. "auto" (o sin modelo) deja el modelo por defecto de agy. */
export function buildArgs(executor, instruction) {
  const args = ['-p', instruction, '--output-format', 'json', '--dangerously-skip-permissions', '--disable-slash-commands'];
  if (executor.model && executor.model !== 'auto') args.push('--model', executor.model);
  if (executor.thinking && executor.thinking !== 'none') args.push('--effort', executor.thinking);
  if (executor.timeoutSeconds) args.push('--print-timeout', `${executor.timeoutSeconds}s`);
  args.push(...(executor.extraArgs || []));
  return args;
}

/** Lee el objeto JSON final de agy (el último que haya en la salida). */
export function parseOutput(output) {
  let result = null;
  const text = String(output).trim();
  // Normalmente es una sola línea; si llegara con saltos de línea, se prueba el bloque completo desde la última llave inicial.
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    try { result = JSON.parse(line); } catch { /* Línea que no es el resultado. */ }
  }
  if (!result) {
    for (let start = text.lastIndexOf('\n{'); start >= -1 && !result; start = text.lastIndexOf('\n{', start - 1)) {
      try { result = JSON.parse(text.slice(start + 1)); } catch { /* Se prueba un bloque anterior. */ }
      if (start === -1) break;
    }
  }
  const usage = result?.usage ?? {};
  return {
    status: result?.status ?? null,
    text: typeof result?.response === 'string' ? result.response : '',
    turns: result?.num_turns ?? null,
    error: result?.error?.message ?? result?.error ?? null,
    usage: result ? {
      inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_tokens,
    } : null,
  };
}

async function changedFiles(cwd) {
  const res = await runProcess('git', ['status', '--porcelain', '-uall'], { cwd, timeoutMs: 15_000 });
  if (res.code !== 0) return null;
  return new Set(res.stdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter((file) => file && !file.startsWith('.agentrelay/')));
}

/**
 * agy no informa de sus pasos hasta terminar: mientras trabaja se mira el repositorio cada 20 s y se
 * avisa de los archivos que va cambiando, o, si no cambia nada, cada 2 min de cuánto lleva.
 * Devuelve la función que lo detiene.
 */
export function watchProgress(cwd, onActivity, { intervalMs = 20_000, quietMs = 120_000, list = changedFiles, now = Date.now } = {}) {
  if (!onActivity) return () => {};
  const start = now();
  let seen = null;
  let lastNotice = start;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const files = await list(cwd);
      if (!files) return;
      if (!seen) { seen = files; return; }
      const nuevos = [...files].filter((file) => !seen.has(file));
      seen = files;
      const minutes = Math.round((now() - start) / 60_000);
      if (nuevos.length) {
        onActivity({ kind: 'tool', tool: 'edit', detail: nuevos.slice(0, 8).join(', ') + (nuevos.length > 8 ? ` y ${nuevos.length - 8} más` : '') });
        lastNotice = now();
      } else if (now() - lastNotice >= quietMs) {
        onActivity({ kind: 'thinking', text: `Antigravity sigue trabajando (${minutes} min)…` });
        lastNotice = now();
      }
    } catch { /* Un fallo al mirar el repositorio no afecta a la ejecución. */ } finally { busy = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Ejecuta agy sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile, onActivity }) {
  const [command, ...prefix] = commandParts(executor.command);
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile))];
  // agy aplica su propio --print-timeout; el de AgentRelay queda como red de seguridad un poco después.
  const timeoutMs = executor.timeoutSeconds ? (executor.timeoutSeconds + 60) * 1000 : undefined;
  onActivity?.({ kind: 'thinking', text: `Antigravity (${executor.model && executor.model !== 'auto' ? executor.model : 'Gemini'}) empieza; aquí verás los archivos que vaya cambiando.` });
  const stop = watchProgress(cwd, onActivity);
  let res;
  try {
    res = await runProcess(command, args, { cwd, timeoutMs });
  } finally {
    stop();
  }
  const parsed = parseOutput(res.stdout);
  const ok = res.code === 0 && parsed.status === 'SUCCESS';

  let error = null;
  if (res.error) {
    error = res.error.code === 'ENOENT' ? `No se encuentra Antigravity CLI ("${command}"). ${installHint}` : res.error.message;
  } else if (res.timedOut) {
    error = `El ejecutor ha superado el tiempo máximo (${executor.timeoutSeconds} s)`;
  } else if (!ok) {
    error = [parsed.status && parsed.status !== 'SUCCESS' ? `estado ${parsed.status}` : '', parsed.error, tail(res.stderr.trim())]
      .filter(Boolean).join(': ') || `El ejecutor terminó con código ${res.code}`;
  }
  if (parsed.usage) onActivity?.({ kind: 'usage', inputTokens: parsed.usage.inputTokens, outputTokens: parsed.usage.outputTokens });

  return {
    ok,
    exitCode: res.code,
    timedOut: res.timedOut,
    finishReason: ok ? 'completed' : null,
    text: parsed.text,
    report: extractAgentReport(parsed.text),
    usage: parsed.usage,
    model: { provider: 'google', id: executor.model || 'auto' },
    iterations: parsed.turns,
    toolCalls: 0,
    durationMs: res.durationMs,
    error,
    rawOutput: res.stdout,
    rawError: res.stderr,
  };
}

export async function version(executor) {
  const [command, ...prefix] = commandParts(executor.command);
  const res = await runProcess(command, [...prefix, 'changelog'], { timeoutMs: 60_000 });
  if (res.error?.code === 'ENOENT') throw new Error(`${res.error.message}. ${installHint}`);
  const found = /\b(\d+\.\d+\.\d+)\b/.exec(`${res.stdout}\n${res.stderr}`);
  if (found) return `agy ${found[1]}`;
  if (res.code !== 0) throw new Error(res.error?.message || res.stderr.trim() || `código ${res.code}`);
  return 'agy';
}

/** Comprueba si Antigravity CLI tiene una sesión de Google guardada. */
export async function authStatus(executor, { dir = antigravityDir() } = {}) {
  if (existsSync(path.join(dir, 'antigravity-oauth-token'))) return { ok: true, message: 'Sesión de Google guardada en Antigravity CLI' };
  return { ok: false, message: `Antigravity CLI no tiene sesión. ${loginHint}` };
}

/**
 * Abre agy para iniciar sesión (elegir «Google OAuth»); se sale con /quit o Ctrl+C. Se abre en una
 * carpeta vacía de AgentRelay para que la pregunta de confianza no afecte a ninguna carpeta del usuario.
 */
export async function login(executor) {
  const [command, ...prefix] = commandParts(executor.command);
  const cwd = path.join(agentrelayHome(), 'antigravity-login');
  mkdirSync(cwd, { recursive: true });
  const res = await runInteractive(command, prefix, { cwd });
  return res.code;
}
