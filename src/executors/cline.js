// Adaptador para Cline CLI (paquete npm "cline").
//
// Se ejecuta en modo headless con salida NDJSON (--json). El prompt completo se
// guarda en un archivo y a Cline se le pasa una instrucción corta de una línea
// que le indica leerlo: así se evitan los límites y problemas de quoting de la
// línea de comandos (en Windows, Cline no acepta el prompt por stdin).

import { runProcess } from '../proc.js';

export const name = 'cline';

// Margen sobre el timeout propio de Cline antes de terminar el proceso.
const KILL_GRACE_MS = 60_000;

export function commandParts(command) {
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

export function instructionFor(promptFile) {
  return `Read the file ${promptFile} in the working directory and carry out the task it describes exactly. Do not modify or delete that file.`;
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

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/** Busca el último bloque JSON del texto final con el informe del ejecutor. */
export function extractAgentReport(text) {
  if (!text) return null;
  const blocks = [...text.matchAll(/```(?:json)?[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) blocks.push(trimmed);
  for (const block of blocks.reverse()) {
    try {
      const data = JSON.parse(block);
      if (data && typeof data === 'object' && 'status' in data) {
        return {
          status: String(data.status),
          summary: String(data.summary ?? ''),
          filesChanged: toArray(data.filesChanged).map(String),
          checks: toArray(data.checks),
          issues: toArray(data.issues).map(String),
          questions: toArray(data.questions).map(String),
          needsEscalation: Boolean(data.needsEscalation),
        };
      }
    } catch {
      // Bloque no válido: probamos el anterior.
    }
  }
  return null;
}

function tail(text, max = 2000) {
  return text.length > max ? text.slice(-max) : text;
}

/** Ejecuta Cline sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile }) {
  const [command, ...prefix] = commandParts(executor.command);
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile))];
  const timeoutMs = executor.timeoutSeconds ? executor.timeoutSeconds * 1000 + KILL_GRACE_MS : undefined;

  const res = await runProcess(command, args, { cwd, timeoutMs });
  const parsed = parseOutput(`${res.stdout}\n${res.stderr}`);
  const ok = res.code === 0 && parsed.finishReason === 'completed';

  let error = null;
  if (res.error) {
    error = res.error.code === 'ENOENT'
      ? `No se encuentra el ejecutor "${command}". Instala Cline CLI (npm install -g cline) o ajusta executor.command.`
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
    throw new Error(res.error?.message || res.stderr.trim() || `código ${res.code}`);
  }
  return res.stdout.trim();
}
