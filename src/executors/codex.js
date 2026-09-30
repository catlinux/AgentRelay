// Adaptador para OpenAI Codex CLI (paquete npm "@openai/codex" o la extensión
// de OpenAI para VS Code).
//
// Se ejecuta en modo no interactivo con salida JSONL (codex exec --json) y usa
// el inicio de sesión de ChatGPT del usuario: no necesita claves de API. El
// prompt completo se guarda en un archivo y a Codex se le pasa una instrucción
// corta de una línea que le indica leerlo. El informe final se pide con un
// esquema JSON (--output-schema) para que llegue siempre con el mismo formato.

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInteractive, runProcess } from '../proc.js';
import { clip, extractAgentReport, firstLine, instructionFor, makeLineHandler, relativize, tail } from './common.js';

export const name = 'codex';

// Qué hacer si el ejecutor no está disponible (lo muestra `agentrelay doctor`).
export const installHint = 'Instala la extensión de OpenAI para VS Code o Codex CLI (npm i -g @openai/codex) e inicia sesión con "codex login".';

// Esquema que se le pasa a Codex para el informe final; se escribe junto al prompt.
const REPORT_FILE = 'codex-report.schema.json';

const EXTENSION_PREFIX = 'openai.chatgpt-';
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const loginHint = 'Ejecuta "agentrelay login" para conectar tu cuenta de ChatGPT.';

/** Informe final esperado (el mismo que se pide en las instrucciones del prompt). */
export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'filesChanged', 'checks', 'issues', 'questions', 'needsEscalation'],
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'result'],
        properties: {
          command: { type: 'string' },
          result: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
        },
      },
    },
    issues: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    needsEscalation: { type: 'boolean' },
  },
};

function listDir(dir, readdir) {
  try {
    return readdir(dir);
  } catch {
    // El directorio no existe (o no se puede leer): no es un error.
    return [];
  }
}

/**
 * Localiza el binario de Codex. Primero en el PATH (CLI instalada con npm) y,
 * si no está, en la copia que trae la extensión de OpenAI para VS Code (la
 * versión más nueva primero). Devuelve null si no encuentra ninguna.
 */
export function findCodex({ root = PROJECT_ROOT, env = process.env, home = os.homedir(), exists = existsSync, readdir = readdirSync, platform = process.platform } = {}) {
  const win = platform === 'win32';

  const bundled = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (exists(bundled)) return [process.execPath, bundled];

  const pathValue = env.PATH || env.Path || '';
  for (const dir of String(pathValue).split(path.delimiter)) {
    if (!dir) continue;
    for (const fileName of win ? ['codex.exe', 'codex.cmd'] : ['codex']) {
      const candidate = path.join(dir, fileName);
      if (exists(candidate)) return [candidate];
    }
  }

  const binaryNames = win ? ['codex.exe'] : ['codex'];
  const bases = [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-insiders', 'extensions'),
  ];
  for (const base of bases) {
    const folders = listDir(base, readdir)
      .filter((folder) => folder.startsWith(EXTENSION_PREFIX))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const folder of folders) {
      const binDir = path.join(base, folder, 'bin');
      for (const sub of listDir(binDir, readdir)) {
        for (const binary of binaryNames) {
          const candidate = path.join(binDir, sub, binary);
          if (exists(candidate)) return [candidate];
        }
      }
    }
  }
  return null;
}

/**
 * "codex" (valor por defecto) usa el binario localizado en el PATH o en la
 * extensión de VS Code y, si no existe, el del PATH. Cualquier otro valor se
 * usa tal cual.
 */
export function commandParts(command) {
  if (command === 'codex') {
    const found = findCodex();
    if (found) return found;
  }
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

/**
 * Argumentos de `codex exec`. El proveedor se ignora: Codex usa la sesión de
 * ChatGPT del usuario.
 */
export function buildArgs(executor, instruction, schemaFile) {
  const args = ['exec', '--json', '--ephemeral', '-s', 'workspace-write', '--output-schema', schemaFile];
  if (executor.model) args.push('-m', executor.model);
  // Sin comillas: proc.js rechaza comillas dobles en los argumentos de cmd.exe
  // (Windows) por seguridad. Codex parsea el valor como TOML y, si falla, usa la
  // cadena tal cual, así que `model_reasoning_effort=high` equivale a "high".
  if (executor.thinking) args.push('-c', `model_reasoning_effort=${executor.thinking}`);
  args.push(...(executor.extraArgs || []), instruction);
  return args;
}

/** Extrae el resultado estructurado de la salida JSONL de Codex. */
export function parseOutput(output) {
  const parsed = {
    finishReason: null,
    text: '',
    usage: null,
    model: null,
    iterations: null,
    toolCalls: 0,
    errors: [],
    threadId: null,
  };
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'thread.started') {
      parsed.threadId = event.thread_id ?? null;
    } else if (event.type === 'item.completed') {
      const item = event.item ?? {};
      if (item.type === 'agent_message') parsed.text = item.text ?? '';
      else if (item.type === 'command_execution' || item.type === 'file_change' || item.type === 'mcp_tool_call') parsed.toolCalls += 1;
      else if (item.type === 'error') parsed.errors.push(String(item.message ?? 'error desconocido'));
    } else if (event.type === 'turn.completed') {
      parsed.finishReason = 'completed';
      // Codex no informa de coste en dinero: nunca inventamos uno.
      const usage = event.usage ?? {};
      parsed.usage = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cached_input_tokens,
      };
    } else if (event.type === 'turn.failed') {
      parsed.finishReason = 'failed';
      parsed.errors.push(String(event.error?.message ?? 'error desconocido'));
    } else if (event.type === 'error') {
      parsed.errors.push(String(event.message ?? 'error desconocido'));
    }
  }
  return parsed;
}

/** Convierte una línea JSONL ya parseada de Codex en un evento de actividad (o null). */
export function toActivity(event, cwd) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'error') return { kind: 'error', message: String(event.message ?? '') };
  if (event.type === 'turn.failed') return { kind: 'error', message: String(event.error?.message ?? '') };
  if (event.type === 'turn.completed') {
    const usage = event.usage ?? {};
    return { kind: 'usage', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
  }
  if (event.type === 'item.started') {
    const item = event.item ?? {};
    if (item.type === 'command_execution') {
      return { kind: 'tool', tool: 'command', detail: clip(relativize(item.command, cwd)) };
    }
    return null;
  }
  if (event.type === 'item.completed') {
    const item = event.item ?? {};
    if (item.type === 'file_change') {
      const paths = (item.changes || []).map((change) => change?.path ?? '').join(', ');
      return { kind: 'tool', tool: 'edit', detail: clip(relativize(paths, cwd)) };
    }
    if (item.type === 'reasoning') {
      return { kind: 'thinking', text: clip(firstLine(item.text)) };
    }
    return null;
  }
  return null;
}

/** Ejecuta Codex sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile, onActivity }) {
  const [command, ...prefix] = commandParts(executor.command);
  const schemaFile = path.join(cwd, path.dirname(promptFile), REPORT_FILE);
  writeFileSync(schemaFile, JSON.stringify(REPORT_SCHEMA, null, 2));
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile), schemaFile)];
  const timeoutMs = executor.timeoutSeconds ? executor.timeoutSeconds * 1000 : undefined;

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
      ? `No se encuentra Codex CLI ("${command}"). Instala la extensión de OpenAI para VS Code o Codex CLI (npm i -g @openai/codex), inicia sesión con "codex login" y vuelve a probar, o ajusta executor.command.`
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
    model: executor.model ? { provider: 'openai', id: executor.model } : null,
    iterations: parsed.iterations,
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
    throw new Error(res.error?.message || res.stderr.trim() || `código ${res.code}`);
  }
  return res.stdout.trim();
}

/** Comprueba si Codex tiene una sesión de ChatGPT activa. */
export async function authStatus(executor) {
  try {
    const [command, ...prefix] = commandParts(executor.command);
    const res = await runProcess(command, [...prefix, 'login', 'status'], { timeoutMs: 60_000 });
    const message = `${res.stdout}\n${res.stderr}`.split(/\r?\n/).find((line) => line.trim())?.trim();
    if (res.code === 0) return { ok: true, message: message || 'Sesión activa' };
    return { ok: false, message: res.error?.message || `No hay sesión iniciada. ${loginHint}` };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

/** Inicia sesión con el navegador o con un código de dispositivo. */
export async function login(executor, { device = false } = {}) {
  const [command, ...prefix] = commandParts(executor.command);
  const res = await runInteractive(command, [...prefix, 'login', ...(device ? ['--device-auth'] : [])]);
  return res.code;
}
