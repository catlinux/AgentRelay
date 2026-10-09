// Adaptador para OpenCode CLI (opencode).
//
// OpenCode es una CLI de agente instalada en el PATH. Se ejecuta en modo no
// interactivo con salida JSON (opencode run --auto --format json) y usa los
// modelos gratuitos del proveedor OpenCode (p. ej. opencode/nemotron-3-ultra-free).
// El prompt completo se guarda en un archivo y a OpenCode se le pasa una
// instrucción corta de una línea que le indica leerlo. El agente termina con el
// informe JSON estructurado que extractAgentReport parsea de su texto final.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { runProcess } from '../proc.js';
import { executorsDir as defaultExecutorsDir } from './catalog.js';
import { clip, extractAgentReport, instructionFor, makeLineHandler, relativize, tail } from './common.js';
import { PROVIDERS } from '../free-providers.js';

export const name = 'opencode';

// Qué hacer si el ejecutor no está disponible (lo muestra `agentrelay doctor`).
export const installHint = 'Instálalo con: agentrelay executors add opencode';
export const loginHint = 'Ejecuta "agentrelay login opencode" para conectar tu cuenta.';

/**
 * Modelos que ofrece la cuenta de OpenCode (`opencode models` los lista uno por
 * línea; los gratuitos terminan en "-free"). Nunca falla si no está disponible.
 */
export async function listModels(executor, { run = runProcess } = {}) {
  try {
    const [command, ...prefix] = commandParts(executor.command);
    // En frío la primera llamada a veces falla o sale vacía: se reintenta una vez.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await run(command, [...prefix, 'models'], { timeoutMs: 60_000 });
      if (res.code !== 0) continue;
      const ids = res.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (ids.length) return ids.map((id) => ({ id, efforts: null, defaultEffort: null }));
    }
    return [];
  } catch {
    return [];
  }
}

/** "opencode" prioriza la instalación gestionada y, si falta, usa el PATH. */
export function commandParts(command, { executorsDir = defaultExecutorsDir(), exists = existsSync, platform = process.platform } = {}) {
  if (command === 'opencode') {
    const link = path.join(executorsDir, 'node_modules', '.bin', `opencode${platform === 'win32' ? '.cmd' : ''}`);
    if (exists(link)) return [link];
  }
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

/** Argumentos de `opencode run --auto --format json`. El proveedor va incluido en el modelo. */
export function buildArgs(executor, instruction) {
  const args = ['run', '--auto', '--format', 'json'];
  if (executor.model) args.push('-m', executor.model);
  args.push(...(executor.extraArgs || []), instruction);
  return args;
}

/** Extrae el resultado estructurado de la salida JSON de OpenCode. */
// OpenCode informa el error como { type: 'error', error: { type, message } }; se admite también `message` plano.
function errorMessage(event) {
  return event.message ?? event.error?.message ?? event.error?.data?.message ?? '';
}

export function parseOutput(output) {
  const parsed = {
    text: '',
    usage: null,
    toolCalls: 0,
    errors: [],
  };
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalCost = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'tool_use') {
      parsed.toolCalls += 1;
    } else if (event.type === 'step_finish') {
      const tokens = event.part?.tokens ?? {};
      inputTokens += tokens.input ?? 0;
      outputTokens += tokens.output ?? 0;
      cacheReadTokens += tokens.cache?.read ?? 0;
      cacheWriteTokens += tokens.cache?.write ?? 0;
      // cost 0 significa gratuito: se suma tal cual y nunca se inventa un coste.
      totalCost += event.part?.cost ?? 0;
    } else if (event.type === 'text') {
      parsed.text += event.part?.text ?? '';
    } else if (event.type === 'error') {
      parsed.errors.push(String(errorMessage(event) || 'error desconocido'));
    }
  }
  parsed.usage = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalCost };
  return parsed;
}
/** Describe brevemente la entrada de una llamada a herramienta de OpenCode. */
export function describeTool(toolName, input, cwd) {
  const value = input ?? {};
  let text;
  if (toolName === 'write' || toolName === 'edit' || toolName === 'read') {
    text = value.path ?? value.file_path ?? '';
  } else if (toolName === 'bash') {
    text = value.command ?? '';
  } else if (toolName === 'glob' || toolName === 'grep') {
    text = value.pattern ?? '';
  } else {
    text = JSON.stringify(value);
  }
  return clip(relativize(text, cwd), 160);
}

/** Traduce el nombre de la herramienta de OpenCode a una etiqueta de actividad. */
function toolKind(tool) {
  if (tool === 'write' || tool === 'edit') return 'edit';
  if (tool === 'read') return 'read_files';
  if (tool === 'bash') return 'command';
  return tool;
}

/** Convierte una línea JSON ya parseada de OpenCode en un evento de actividad (o null). */
export function toActivity(event, cwd) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'step_start') return { kind: 'iteration' };
  if (event.type === 'tool_use') {
    const part = event.part ?? {};
    if (!part.tool) return null;
    return { kind: 'tool', tool: toolKind(part.tool), detail: describeTool(part.tool, part.state?.input, cwd) };
  }
  if (event.type === 'step_finish') {
    const tokens = event.part?.tokens ?? {};
    return { kind: 'usage', inputTokens: tokens.input, outputTokens: tokens.output, cost: event.part?.cost };
  }
  if (event.type === 'error') return { kind: 'error', message: String(errorMessage(event)) };
  return null;
}

/** Ejecuta OpenCode sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile, onActivity }) {
  const [command, ...prefix] = commandParts(executor.command);
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile))];
  const timeoutMs = executor.timeoutSeconds ? executor.timeoutSeconds * 1000 : undefined;

  const res = await runProcess(command, args, {
    cwd,
    timeoutMs,
    onStdout: onActivity ? makeLineHandler(toActivity, cwd, onActivity) : undefined,
  });
  const parsed = parseOutput(`${res.stdout}\n${res.stderr}`);
  const ok = res.code === 0;

  let error = null;
  if (res.error) {
    error = res.error.code === 'ENOENT'
      ? `No se encuentra el ejecutor "${command}". ${installHint} o ajusta executor.command.`
      : res.error.message;
  } else if (res.timedOut) {
    error = `El ejecutor ha superado el tiempo máximo (${executor.timeoutSeconds} s)`;
  } else if (!ok) {
    error = parsed.errors.join('\n')
      || tail(res.stderr.trim())
      || `El ejecutor terminó con código ${res.code}`;
  }

  return {
    ok,
    exitCode: res.code,
    timedOut: res.timedOut,
    finishReason: res.code === 0 ? 'completed' : null,
    text: parsed.text,
    report: extractAgentReport(parsed.text),
    usage: parsed.usage,
    model: executor.model ? { provider: null, id: executor.model } : null,
    iterations: null,
    toolCalls: parsed.toolCalls,
    durationMs: res.durationMs,
    error,
    rawOutput: res.stdout,
    rawError: res.stderr,
  };
}

export async function version(executor) {
  const [command, ...prefix] = commandParts(executor.command);
  const res = await runProcess(command, [...prefix, '--version'], { timeoutMs: 60_000 });
  if (res.code !== 0) {
    if (res.error?.code === 'ENOENT') throw new Error(`${res.error.message}. ${installHint}`);
    throw new Error(res.error?.message || res.stderr.trim() || `código ${res.code}`);
  }
  return res.stdout.trim();
}

/** Comprueba si OpenCode tiene una cuenta guardada (`opencode auth list`). */
export async function authStatus(executor, { run = runProcess } = {}) {
  try {
    const [command, ...prefix] = commandParts(executor.command);
    const res = await run(command, [...prefix, 'auth', 'list'], { timeoutMs: 60_000 });
    const lines = `${res.stdout || ''}\n${res.stderr || ''}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const noCredentials = /no authenticated integrations|no credentials|not logged in|no accounts?/i;
    const credentialLines = lines.filter((line) => !noCredentials.test(line));
    if (res.code === 0 && !res.error && !res.timedOut && credentialLines.length) {
      return { ok: true, message: credentialLines[0] };
    }
    if (res.error || res.timedOut || res.code !== 0) {
      const detail = (res.error?.message || (res.timedOut ? 'se agotó el tiempo de espera' : '') || lines[0] || `código ${res.code}`).slice(0, 160);
      return { ok: false, message: `No se pudo comprobar la sesión de OpenCode: ${detail}. Prueba: agentrelay login opencode` };
    }
    return { ok: false, message: 'OpenCode no tiene ninguna cuenta guardada. Conéctala con: agentrelay login opencode' };
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 160);
    return { ok: false, message: `No se pudo comprobar la sesión de OpenCode: ${detail}. Prueba: agentrelay login opencode` };
  }
}

/** Lista los proveedores con credenciales guardadas en OpenCode, sin exponerlas. */
export async function connectedProviderIds(executor, { run = runProcess } = {}) {
  try {
    const [command, ...prefix] = commandParts(executor.command);
    const res = await run(command, [...prefix, 'auth', 'list'], { timeoutMs: 60_000 });
    if (res.code !== 0 || res.error || res.timedOut) return [];
    const names = new Set();
    for (const line of (res.stdout || '').split(/\r?\n/)) {
      const name = line.trim().split(/\s{2,}/, 1)[0]?.trim();
      if (!name) continue;
      const normalized = name.toLowerCase().replace(/\s+/g, '');
      if (normalized === 'opencodeconsole') names.add('opencode');
      for (const provider of PROVIDERS) {
        if (normalized === provider.name.toLowerCase().replace(/\s+/g, '')) names.add(provider.id);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}
