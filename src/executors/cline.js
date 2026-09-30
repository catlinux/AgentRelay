// Adaptador para Cline CLI (paquete npm "cline").
//
// Se ejecuta en modo headless con salida NDJSON (--json). El prompt completo se
// guarda en un archivo y a Cline se le pasa una instrucción corta de una línea
// que le indica leerlo: así se evitan los límites y problemas de quoting de la
// línea de comandos (en Windows, Cline no acepta el prompt por stdin).

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_WINDOWS, runProcess } from '../proc.js';
import { executorsDir as defaultExecutorsDir } from './catalog.js';
import {
  clip, extractAgentReport, firstLine, instructionFor, makeLineHandler, relativize, tail,
} from './common.js';

export const name = 'cline';

// Se siguen reexportando desde aquí para no romper los imports existentes.
export { extractAgentReport, instructionFor };

// Qué hacer si el ejecutor no está disponible (lo muestra `agentrelay doctor`).
export const installHint = 'Instálalo con "agentrelay executors add cline".';

// Margen sobre el timeout propio de Cline antes de terminar el proceso.
const KILL_GRACE_MS = 60_000;

// Cline CLI es una dependencia de AgentRelay: se instala con él.
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Localiza primero cualquier copia anterior de Cline instalada con AgentRelay
 * y después la copia opcional instalada en la carpeta de ejecutores. No basta con el enlace de
 * node_modules/.bin, que según la versión de npm puede no crearse (se ha visto
 * en Linux con npm 10): en ese caso se ejecuta el lanzador del paquete con el
 * propio Node. Devuelve null si no hay ninguna copia instalada.
 */
export function findBundledCline(root = PROJECT_ROOT, exists = existsSync, executorsDirectory = defaultExecutorsDir()) {
  const link = path.join(root, 'node_modules', '.bin', `cline${IS_WINDOWS ? '.cmd' : ''}`);
  if (exists(link)) return [link];
  const launcher = path.join(root, 'node_modules', 'cline', 'bin', 'cline');
  if (exists(launcher)) return [process.execPath, launcher];
  const managedLink = path.join(executorsDirectory, 'node_modules', '.bin', `cline${IS_WINDOWS ? '.cmd' : ''}`);
  if (exists(managedLink)) return [managedLink];
  const managedLauncher = path.join(executorsDirectory, 'node_modules', 'cline', 'bin', 'cline');
  if (exists(managedLauncher)) return [process.execPath, managedLauncher];
  return null;
}

/**
 * "cline" (valor por defecto) usa la copia instalada con AgentRelay o en la
 * carpeta de ejecutores y, si no existe, el del PATH. Cualquier otro valor se usa tal cual.
 */
export function commandParts(command, { executorsDir = defaultExecutorsDir() } = {}) {
  if (command === 'cline') {
    const bundled = findBundledCline(PROJECT_ROOT, existsSync, executorsDir);
    if (bundled) return bundled;
  }
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

export function buildArgs(executor, instruction) {
  const args = ['--json', '--auto-approve', 'true'];
  if (executor.provider) args.push('-P', executor.provider);
  if (executor.model) args.push('-m', executor.model);
  if (executor.thinking) args.push('--thinking', executor.thinking);
  if (executor.timeoutSeconds) args.push('-t', String(executor.timeoutSeconds));
  args.push(...(executor.extraArgs || []), instruction);
  return args;
}

/** Extrae el resultado estructurado de la salida NDJSON de Cline. */
export function parseOutput(output) {
  const parsed = {
    finishReason: null,
    text: '',
    iterations: null,
    usage: null,
    durationMs: null,
    model: null,
    toolCalls: 0,
    errors: [],
  };
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'run_result') {
      parsed.finishReason = event.finishReason ?? null;
      parsed.text = event.text ?? '';
      parsed.iterations = event.iterations ?? null;
      parsed.usage = event.aggregateUsage ?? event.usage ?? null;
      parsed.durationMs = event.durationMs ?? null;
      parsed.model = event.model ? { provider: event.model.provider, id: event.model.id } : null;
    } else if (event.type === 'agent_event' && event.event?.type === 'done' && !parsed.finishReason) {
      parsed.finishReason = event.event.reason ?? null;
      parsed.text = event.event.text ?? '';
      parsed.usage = event.event.usage ?? null;
    } else if (event.type === 'hook_event' && event.hookEventName === 'tool_call') {
      parsed.toolCalls += 1;
    } else if (event.type === 'error') {
      parsed.errors.push(String(event.message ?? 'error desconocido'));
    }
  }
  return parsed;
}

/** Describe brevemente la entrada de una llamada a herramienta de Cline. */
export function describeTool(toolName, input, cwd) {
  const value = input ?? {};
  let text;
  if (toolName === 'read_files') text = (value.files || []).map((f) => f?.path ?? '').join(', ');
  else if (toolName === 'editor') text = value.path ?? '';
  else if (toolName === 'run_commands') text = (value.commands || []).join(' ; ');
  else text = JSON.stringify(value);
  return clip(relativize(text, cwd), 160);
}

/** Convierte una línea NDJSON ya parseada de Cline en un evento de actividad (o null). */
export function toActivity(clineEvent, cwd) {
  if (!clineEvent || typeof clineEvent !== 'object') return null;
  if (clineEvent.type === 'error') {
    return { kind: 'error', message: String(clineEvent.message ?? '') };
  }
  if (clineEvent.type !== 'agent_event' || !clineEvent.event) return null;
  const e = clineEvent.event;
  if (e.type === 'iteration_start') return { kind: 'iteration', n: e.iteration };
  if (e.type === 'content_end' && e.contentType === 'reasoning') {
    return { kind: 'thinking', text: clip(firstLine(e.reasoning), 160) };
  }
  if (e.type === 'content_start' && e.contentType === 'tool') {
    return { kind: 'tool', tool: e.toolName, detail: describeTool(e.toolName, e.input, cwd) };
  }
  if (e.type === 'usage') {
    return {
      kind: 'usage',
      inputTokens: e.totalInputTokens,
      outputTokens: e.totalOutputTokens,
      cost: e.totalCost,
    };
  }
  return null;
}

/** Ejecuta Cline sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile, onActivity }) {
  const [command, ...prefix] = commandParts(executor.command);
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile))];
  const timeoutMs = executor.timeoutSeconds ? executor.timeoutSeconds * 1000 + KILL_GRACE_MS : undefined;

  const res = await runProcess(command, args, {
    cwd,
    timeoutMs,
    onStdout: onActivity ? makeLineHandler(toActivity, cwd, onActivity) : undefined,
  });
  const parsed = parseOutput(`${res.stdout}\n${res.stderr}`);
  const ok = res.code === 0 && parsed.finishReason === 'completed';

  let error = null;
  if (res.error) {
    error = res.error.code === 'ENOENT'
      ? `No se encuentra el ejecutor "${command}". ${installHint} o ajusta executor.command.`
      : res.error.message;
  } else if (res.timedOut) {
    error = `El ejecutor ha superado el tiempo máximo (${executor.timeoutSeconds} s)`;
  } else if (!ok) {
    error = parsed.errors.join('\n')
      || (parsed.finishReason ? `Finalización no completada: ${parsed.finishReason}` : '')
      || tail(res.stderr.trim())
      || `El ejecutor terminó con código ${res.code}`;
  }

  return {
    ok,
    exitCode: res.code,
    timedOut: res.timedOut,
    finishReason: parsed.finishReason,
    text: parsed.text,
    report: extractAgentReport(parsed.text),
    usage: parsed.usage,
    model: parsed.model,
    iterations: parsed.iterations,
    toolCalls: parsed.toolCalls,
    durationMs: parsed.durationMs ?? res.durationMs,
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
