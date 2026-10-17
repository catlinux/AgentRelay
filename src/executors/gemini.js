// Adaptador para Gemini CLI (paquete npm "@google/gemini-cli").
//
// Usa la cuenta de Google del usuario (plan gratuito de Gemini Code Assist):
// sin claves de API. Se ejecuta en modo no interactivo con salida JSON por
// líneas (gemini -p <instrucción> -o stream-json --approval-mode yolo). El
// prompt completo se guarda en un archivo y a Gemini se le pasa una instrucción
// corta que le indica leerlo; el informe final sale de su texto.
//
// La cuota se consulta en directo con la misma API que usa Gemini CLI
// (cloudcode-pa.googleapis.com, retrieveUserQuota): lo que queda por modelo y
// cuándo se renueva. Las credenciales se leen de ~/.gemini/oauth_creds.json y
// nunca se reescriben.

import { existsSync, readdirSync, readFileSync, realpathSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInteractive, runProcess } from '../proc.js';
import { executorsDir as defaultExecutorsDir } from './catalog.js';
import { entornoCuenta, geminiDirCuenta } from '../cuentas.js';
import { clip, extractAgentReport, instructionFor, makeLineHandler, relativize, tail } from './common.js';

export const name = 'gemini';

export const installHint = 'Instálalo con: agentrelay executors add gemini';
export const loginHint = 'Ejecuta "agentrelay login gemini" para conectar tu cuenta de Google.';

// Fuerza el inicio de sesión con la cuenta de Google (sin esto el modo no interactivo exige elegir método).
const GOOGLE_LOGIN_ENV = { GOOGLE_GENAI_USE_GCA: 'true' };
const CODE_ASSIST = 'https://cloudcode-pa.googleapis.com/v1internal';

/** Carpeta de configuración de Gemini CLI (~/.gemini; GEMINI_CLI_HOME cambia la base). */
export function geminiDir(env = process.env, home = os.homedir()) {
  return path.join(env.GEMINI_CLI_HOME || home, '.gemini');
}

/** "gemini" prioriza la instalación gestionada y, si falta, usa el PATH. */
export function commandParts(command, { executorsDir = defaultExecutorsDir(), exists = existsSync, platform = process.platform } = {}) {
  if (command === 'gemini') {
    const link = path.join(executorsDir, 'node_modules', '.bin', `gemini${platform === 'win32' ? '.cmd' : ''}`);
    if (exists(link)) return [link];
  }
  const parts = Array.isArray(command) ? command.map(String) : [String(command)];
  if (!parts.length || !parts[0]) throw new Error('executor.command está vacío');
  return parts;
}

/** Argumentos del modo no interactivo. "auto" (o sin modelo) deja que Gemini CLI elija. */
export function buildArgs(executor, instruction) {
  const args = ['-p', instruction, '-o', 'stream-json', '--approval-mode', 'yolo', '--skip-trust'];
  if (executor.model && executor.model !== 'auto') args.push('-m', executor.model);
  args.push(...(executor.extraArgs || []));
  return args;
}

/** Extrae el resultado estructurado de la salida stream-json de Gemini CLI. */
export function parseOutput(output) {
  const parsed = { text: '', usage: null, toolCalls: 0, errors: [], status: null, model: null };
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'init') {
      parsed.model = event.model ?? null;
    } else if (event.type === 'message' && event.role === 'assistant') {
      parsed.text += event.content ?? '';
    } else if (event.type === 'tool_use') {
      parsed.toolCalls += 1;
    } else if (event.type === 'error') {
      parsed.errors.push(String(event.message ?? 'error desconocido'));
    } else if (event.type === 'result') {
      parsed.status = event.status ?? null;
      if (event.error?.message) parsed.errors.push(String(event.error.message));
      const stats = event.stats ?? {};
      // Gemini CLI no informa de coste: con la cuenta gratuita no se paga nada.
      parsed.usage = { inputTokens: stats.input_tokens, outputTokens: stats.output_tokens, cacheReadTokens: stats.cached };
    }
  }
  return parsed;
}

function describeTool(toolName, input, cwd) {
  const value = input ?? {};
  const text = value.file_path ?? value.absolute_path ?? value.path ?? value.command ?? value.pattern ?? JSON.stringify(value);
  return clip(relativize(String(text), cwd), 160);
}

function toolKind(tool) {
  if (/write|edit|replace/.test(tool)) return 'edit';
  if (/read|list|glob|grep|search/.test(tool)) return 'read_files';
  if (/shell|command/.test(tool)) return 'command';
  return tool;
}

/** Convierte una línea stream-json ya parseada en un evento de actividad (o null). */
export function toActivity(event, cwd) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'tool_use' && event.tool_name) {
    return { kind: 'tool', tool: toolKind(String(event.tool_name)), detail: describeTool(event.tool_name, event.parameters, cwd) };
  }
  if (event.type === 'error') return { kind: 'error', message: String(event.message ?? '') };
  if (event.type === 'result') {
    if (event.status === 'error') return { kind: 'error', message: String(event.error?.message ?? '') };
    return { kind: 'usage', inputTokens: event.stats?.input_tokens, outputTokens: event.stats?.output_tokens };
  }
  return null;
}

/** Ejecuta Gemini CLI sobre `cwd` con el prompt guardado en `promptFile` (ruta relativa). */
export async function run({ executor, cwd, promptFile, onActivity }) {
  const [command, ...prefix] = commandParts(executor.command);
  const args = [...prefix, ...buildArgs(executor, instructionFor(promptFile))];
  const timeoutMs = executor.timeoutSeconds ? executor.timeoutSeconds * 1000 : undefined;
  const res = await runProcess(command, args, {
    cwd,
    env: { ...GOOGLE_LOGIN_ENV, ...entornoCuenta('gemini') },
    timeoutMs,
    onStdout: onActivity ? makeLineHandler(toActivity, cwd, onActivity) : undefined,
  });
  const parsed = parseOutput(`${res.stdout}\n${res.stderr}`);
  const ok = res.code === 0 && parsed.status !== 'error';

  let error = null;
  if (res.error) {
    error = res.error.code === 'ENOENT'
      ? `No se encuentra Gemini CLI ("${command}"). ${installHint} o ajusta executor.command.`
      : res.error.message;
  } else if (res.timedOut) {
    error = `El ejecutor ha superado el tiempo máximo (${executor.timeoutSeconds} s)`;
  } else if (!ok) {
    error = parsed.errors.join('\n') || tail(res.stderr.trim()) || `El ejecutor terminó con código ${res.code}`;
  }

  return {
    ok,
    exitCode: res.code,
    timedOut: res.timedOut,
    finishReason: ok ? 'completed' : null,
    text: parsed.text,
    report: extractAgentReport(parsed.text),
    usage: parsed.usage,
    model: { provider: 'google', id: parsed.model || executor.model || 'auto' },
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

/** Lee las credenciales OAuth que guarda Gemini CLI al iniciar sesión con Google. */
export function readCredentials({ dir = geminiDirCuenta() } = {}) {
  try {
    const creds = JSON.parse(readFileSync(path.join(dir, 'oauth_creds.json'), 'utf8'));
    return creds && (creds.refresh_token || creds.access_token) ? creds : null;
  } catch {
    return null;
  }
}

/** Correo de la cuenta de Google con la que inició sesión Gemini CLI (o null). */
export function accountEmail({ dir = geminiDirCuenta() } = {}) {
  try { return JSON.parse(readFileSync(path.join(dir, 'google_accounts.json'), 'utf8')).active || null; } catch { return null; }
}

/**
 * Sesión de Google: { ok, expired, email }. Si el token guardado ha caducado se intenta renovar en
 * memoria; si Google lo rechaza (invalid_grant), la sesión está caducada y hay que volver a entrar.
 * Un fallo de red no se toma por sesión caducada.
 */
export async function checkSession({ dir = geminiDirCuenta(), fetchImpl = fetch, now = new Date(), client } = {}) {
  const creds = readCredentials({ dir });
  const email = accountEmail({ dir });
  if (!creds) return { ok: false, expired: false, email };
  try {
    await accessToken(creds, fetchImpl, now, client === undefined ? oauthClient() : client);
    return { ok: true, expired: false, email };
  } catch (error) {
    const expired = /invalid_grant|sesión de Google ha caducado/.test(String(error?.message));
    return { ok: !expired, expired, email };
  }
}

/** Comprueba la sesión de Google de Gemini CLI, validándola con Google. */
export async function authStatus(executor, { dir = geminiDirCuenta(), check = checkSession } = {}) {
  const session = await check({ dir });
  if (session.ok) return { ok: true, message: session.email ? `Cuenta de Google: ${session.email}` : 'Sesión de Google guardada' };
  if (session.expired) return { ok: false, expired: true, message: `La sesión de Google${session.email ? ` (${session.email})` : ''} ha caducado. ${loginHint}` };
  return { ok: false, message: `Gemini CLI no tiene sesión de Google. ${loginHint}` };
}

/** Abre Gemini CLI para iniciar sesión con Google; se cierra con /quit al terminar. */
export async function login(executor, { env = entornoCuenta('gemini'), dir = geminiDirCuenta() } = {}) {
  const [command, ...prefix] = commandParts(executor.command);
  // Con una credencial caducada Gemini CLI no vuelve a pedir el inicio de sesión: se aparta (no se borra).
  const creds = path.join(dir, 'oauth_creds.json');
  if (existsSync(creds) && (await checkSession({ dir })).expired) {
    try { renameSync(creds, path.join(dir, 'oauth_creds.caducado.json')); } catch { /* Se intenta igualmente. */ }
  }
  const res = await runInteractive(command, [...prefix, '--skip-trust'], { env: { ...GOOGLE_LOGIN_ENV, ...env } });
  return res.code;
}

async function postJson(fetchImpl, url, token, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Cliente OAuth de aplicación instalada de Gemini CLI, leído de su propio paquete instalado
 * (es público, pero no se copia en AgentRelay). Hace falta para renovar el token caducado.
 */
export function oauthClient({ command = 'gemini', executorsDir } = {}) {
  try {
    const bin = realpathSync(commandParts(command, executorsDir ? { executorsDir } : undefined)[0]);
    // Linux/macOS: el enlace lleva al paquete. Windows: gemini.cmd está en node_modules/.bin o en la
    // carpeta global de npm, junto a node_modules/@google/gemini-cli.
    const candidates = [
      path.join(path.dirname(bin), '..', '@google', 'gemini-cli'),
      path.join(path.dirname(bin), 'node_modules', '@google', 'gemini-cli'),
    ];
    for (let dir = path.dirname(bin), i = 0; i < 4; i += 1, dir = path.dirname(dir)) candidates.push(dir);
    const root = candidates.find((dir) => existsSync(path.join(dir, 'bundle')));
    if (!root) return null;
    const bundle = path.join(root, 'bundle');
    for (const file of readdirSync(bundle).filter((name) => name.endsWith('.js'))) {
      const text = readFileSync(path.join(bundle, file), 'utf8');
      const id = /OAUTH_CLIENT_ID = "([^"]+)"/.exec(text)?.[1];
      const secret = /OAUTH_CLIENT_SECRET = "([^"]+)"/.exec(text)?.[1];
      if (id && secret) return { id, secret };
    }
  } catch { /* Gemini CLI no instalado o con otro formato. */ }
  return null;
}

/** Token de acceso válido: el guardado si no ha caducado o uno renovado en memoria. */
async function accessToken(creds, fetchImpl, now, client) {
  if (creds.access_token && Number(creds.expiry_date) > now.getTime() + 60_000) return creds.access_token;
  if (!creds.refresh_token) throw new Error('la sesión de Google ha caducado');
  if (!client) throw new Error('el token ha caducado y no se encuentra Gemini CLI para renovarlo');
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id, client_secret: client.secret, refresh_token: creds.refresh_token, grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Google explica el motivo en el cuerpo (p. ej. invalid_grant: sesión revocada o caducada).
    let detail = '';
    try { const body = await res.json(); detail = [body.error, body.error_description].filter(Boolean).join(': '); } catch { /* Sin cuerpo JSON. */ }
    const hint = /invalid_grant/.test(detail) ? '; vuelve a iniciar sesión con: agentrelay login gemini' : '';
    throw new Error(`no se pudo renovar la sesión de Google (HTTP ${res.status}${detail ? `, ${detail}` : ''})${hint}`);
  }
  return (await res.json()).access_token;
}

/**
 * Cuota de la cuenta gratuita por modelo: [{ model, remainingPercent, remaining, limit, resetAt }].
 * No gasta peticiones del modelo. Devuelve { ok: false, message } si no se puede consultar.
 */
export async function readQuota({ dir = geminiDirCuenta(), env = process.env, fetchImpl = fetch, now = new Date(), client = oauthClient() } = {}) {
  const creds = readCredentials({ dir });
  if (!creds) return { ok: false, message: `sin sesión de Google (${loginHint})` };
  try {
    const token = await accessToken(creds, fetchImpl, now, client);
    let project = env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT_ID || null;
    const metadata = { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };
    const load = await postJson(fetchImpl, `${CODE_ASSIST}:loadCodeAssist`, token, {
      ...(project ? { cloudaicompanionProject: project } : {}), metadata: { ...metadata, ...(project ? { duetProject: project } : {}) },
    });
    const assigned = load.cloudaicompanionProject;
    project = (typeof assigned === 'string' ? assigned : assigned?.id) || project;
    if (!project) return { ok: false, message: 'Google aún no ha asignado el proyecto gratuito: ejecuta una tarea con Gemini o abre gemini una vez' };
    const quota = await postJson(fetchImpl, `${CODE_ASSIST}:retrieveUserQuota`, token, { project });
    const models = (quota.buckets ?? [])
      .filter((bucket) => bucket?.modelId && bucket.remainingFraction != null)
      .map((bucket) => {
        const remaining = bucket.remainingAmount != null ? Number.parseInt(bucket.remainingAmount, 10) : null;
        const fraction = Number(bucket.remainingFraction);
        return {
          model: bucket.modelId,
          remainingPercent: Math.round(fraction * 100),
          remaining: Number.isFinite(remaining) ? remaining : null,
          limit: Number.isFinite(remaining) && fraction > 0 ? Math.round(remaining / fraction) : null,
          resetAt: bucket.resetTime ?? null,
        };
      });
    return { ok: true, tier: load.currentTier?.name ?? load.currentTier?.id ?? null, models };
  } catch (error) {
    return { ok: false, message: `no se pudo consultar la cuota: ${String(error?.message || error).slice(0, 160)}` };
  }
}
