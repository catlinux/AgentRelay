// Varias cuentas de una misma integración de OpenCode (p. ej. tres suscripciones de OpenCode Go).
//
// OpenCode 2 guarda varias credenciales por integración y activa una con `opencode auth switch`.
// AgentRelay elige la cuenta: la activa antes de cada intento y, si se acaba el crédito, la marca
// como agotada (cada credencial tiene su propio registro en quota-state) y pasa a la siguiente.
// La elegida se guarda en ~/.agentrelay/cuentas.json como "opencode:<integración>" para no tener
// que leer `auth export`, que es lo único que dice cuál está activa y saca las claves en claro.
// Un `opencode auth switch` hecho a mano se respeta solo hasta la siguiente tarea.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome } from './config.js';
import { runProcess } from './proc.js';
import { commandParts } from './executors/opencode.js';
import { isAvailable as quotaAvailable, markQuotaExhausted } from './quota-state.js';

const archivo = (home) => path.join(home, 'cuentas.json');
const clave = (integracion) => `opencode:${integracion}`;

function leer(home) {
  try {
    const value = JSON.parse(readFileSync(archivo(home), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

/** Integración de un modelo de OpenCode ("opencode-go/deepseek-v4-flash" → "opencode-go"), o null. */
export function integracionDe(model) {
  const match = /^([^/\s]+)\//.exec(String(model ?? ''));
  return match ? match[1] : null;
}

export const quotaIdCredencial = (integracion, id) => `opencode:${integracion}@${id}`;

/**
 * Credenciales guardadas de una integración, en orden de alta ({ id, label }). `auth list --format json`
 * no incluye secretos; los id de OpenCode empiezan por la marca de tiempo, así que ordenarlos es el orden de alta.
 */
export async function listarCredenciales(executor, integracion, { run = runProcess } = {}) {
  try {
    const [command, ...prefix] = commandParts(executor.command);
    const res = await run(command, [...prefix, 'auth', 'list', '--format', 'json'], { timeoutMs: 60_000 });
    if (res.code !== 0) return [];
    const data = JSON.parse(String(res.stdout).slice(String(res.stdout).indexOf('[')));
    const item = Array.isArray(data) ? data.find((entry) => entry?.id === integracion) : null;
    return (item?.connections ?? [])
      .filter((c) => c?.type === 'credential' && typeof c.id === 'string')
      .map((c) => ({ id: c.id, label: String(c.label ?? c.id) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export function cuentaGuardada(integracion, home = agentrelayHome()) {
  const id = leer(home)[clave(integracion)];
  return typeof id === 'string' ? id : null;
}

function guardar(integracion, id, home) {
  const data = leer(home);
  data[clave(integracion)] = id;
  mkdirSync(home, { recursive: true });
  writeFileSync(archivo(home), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Activa una credencial en OpenCode y la recuerda como la de AgentRelay. */
export async function activarCredencial(executor, integracion, id, { home = agentrelayHome(), run = runProcess } = {}) {
  const [command, ...prefix] = commandParts(executor.command);
  const res = await run(command, [...prefix, 'auth', 'switch', integracion, id], { timeoutMs: 60_000 });
  if (res.code !== 0 || res.error || res.timedOut) {
    throw new Error(`opencode auth switch ${integracion} falló: ${String(res.stderr || res.error?.message || `código ${res.code}`).trim().slice(0, 160)}`);
  }
  guardar(integracion, id, home);
}

/**
 * Deja activa la cuenta que toca antes de un intento: la guardada si tiene cuota y, si no, la primera
 * con cuota en orden de alta. Solo actúa si la integración del modelo tiene dos o más cuentas.
 * Devuelve { integracion, id, label, total } o null (una sola cuenta, ninguna con cuota o error al cambiar:
 * entonces se sigue con la activa y, si falla por cuota, el enrutado hace lo de siempre).
 */
export async function prepararCuenta(executor, { home = agentrelayHome(), run = runProcess, now = new Date() } = {}) {
  if (executor?.type !== 'opencode') return null;
  const integracion = integracionDe(executor.model);
  if (!integracion) return null;
  const credenciales = await listarCredenciales(executor, integracion, { run });
  if (credenciales.length < 2) return null;
  const disponible = (c) => quotaAvailable(quotaIdCredencial(integracion, c.id), now, { home });
  const guardada = cuentaGuardada(integracion, home);
  const elegida = credenciales.find((c) => c.id === guardada && disponible(c)) ?? credenciales.find(disponible);
  if (!elegida) return null;
  try {
    await activarCredencial(executor, integracion, elegida.id, { home, run });
  } catch {
    return null;
  }
  return { integracion, id: elegida.id, label: elegida.label, total: credenciales.length };
}

/**
 * Tras un error de crédito o límite de uso: marca agotada la cuenta de AgentRelay y activa la siguiente con cuota.
 * Devuelve { integracion, from, to, total } (from/to son etiquetas) o null si no queda otra cuenta.
 */
export async function rotarCuenta(executor, errorText, { home = agentrelayHome(), run = runProcess, now = new Date() } = {}) {
  if (executor?.type !== 'opencode') return null;
  const integracion = integracionDe(executor.model);
  const actual = integracion ? cuentaGuardada(integracion, home) : null;
  if (!actual) return null;
  const credenciales = await listarCredenciales(executor, integracion, { run });
  if (credenciales.length < 2 || !credenciales.some((c) => c.id === actual)) return null;
  try { markQuotaExhausted(quotaIdCredencial(integracion, actual), { home, now, errorText }); } catch {}
  const siguiente = await prepararCuenta(executor, { home, run, now });
  if (!siguiente || siguiente.id === actual) return null;
  const from = credenciales.find((c) => c.id === actual).label;
  return { integracion, from, to: siguiente.label, total: credenciales.length };
}
