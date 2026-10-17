// Varias cuentas gratuitas para Luna (cuenta de ChatGPT en Codex) y Gemini (cuenta de Google).
//
// Cada cuenta extra vive en su propia carpeta (~/.agentrelay/cuentas/<servicio>/<nombre>) y se
// usa apuntando CODEX_HOME o GEMINI_CLI_HOME a ella; la cuenta «principal» son las carpetas
// normales de cada CLI (~/.codex, ~/.gemini). La cuenta activa se guarda en
// ~/.agentrelay/cuentas.json. OpenCode no se toca nunca.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentrelayHome } from './config.js';

export const SERVICIOS = ['luna', 'gemini'];
export const PRINCIPAL = 'principal';
const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const archivo = (home = agentrelayHome()) => path.join(home, 'cuentas.json');
const carpetaServicio = (servicio, home = agentrelayHome()) => path.join(home, 'cuentas', servicio);

function comprobarServicio(servicio) {
  if (!SERVICIOS.includes(servicio)) throw new Error(`Servicio desconocido: ${servicio}. Usa: ${SERVICIOS.join(' o ')}`);
}

export function comprobarNombre(nombre) {
  if (nombre === PRINCIPAL) return nombre;
  if (!NOMBRE_VALIDO.test(String(nombre))) throw new Error(`Nombre de cuenta no válido: "${nombre}" (minúsculas, números, - y _; máximo 32).`);
  return nombre;
}

function leer(home) {
  try {
    const value = JSON.parse(readFileSync(archivo(home), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

/** Carpeta de una cuenta extra (null para la principal). */
export function carpetaCuenta(servicio, nombre, home = agentrelayHome()) {
  comprobarServicio(servicio);
  return nombre === PRINCIPAL ? null : path.join(carpetaServicio(servicio, home), comprobarNombre(nombre));
}

/** Cuentas de un servicio: la principal y las extra creadas, en orden alfabético. */
export function listarCuentas(servicio, home = agentrelayHome()) {
  comprobarServicio(servicio);
  let extra = [];
  try {
    extra = readdirSync(carpetaServicio(servicio, home), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && NOMBRE_VALIDO.test(entry.name)).map((entry) => entry.name).sort();
  } catch { /* Sin cuentas extra. */ }
  return [PRINCIPAL, ...extra];
}

/** Cuenta activa; si la guardada ya no existe, la principal. */
export function cuentaActiva(servicio, home = agentrelayHome()) {
  comprobarServicio(servicio);
  const nombre = leer(home)[servicio];
  return typeof nombre === 'string' && listarCuentas(servicio, home).includes(nombre) ? nombre : PRINCIPAL;
}

export function activarCuenta(servicio, nombre, home = agentrelayHome()) {
  comprobarServicio(servicio);
  comprobarNombre(nombre);
  if (!listarCuentas(servicio, home).includes(nombre)) throw new Error(`No existe la cuenta "${nombre}" de ${servicio}. Créala con: agentrelay cuenta ${servicio} add ${nombre}`);
  const data = leer(home);
  if (nombre === PRINCIPAL) delete data[servicio]; else data[servicio] = nombre;
  mkdirSync(home, { recursive: true });
  writeFileSync(archivo(home), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Crea la carpeta de una cuenta extra (no inicia sesión). */
export function crearCuenta(servicio, nombre, home = agentrelayHome()) {
  if (comprobarNombre(nombre) === PRINCIPAL) throw new Error('La cuenta principal ya existe.');
  const dir = carpetaCuenta(servicio, nombre, home);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Borra una cuenta extra y su sesión guardada; si era la activa, vuelve a la principal. */
export function borrarCuenta(servicio, nombre, home = agentrelayHome()) {
  if (comprobarNombre(nombre) === PRINCIPAL) throw new Error('La cuenta principal no se borra desde AgentRelay.');
  const dir = carpetaCuenta(servicio, nombre, home);
  if (!existsSync(dir)) throw new Error(`No existe la cuenta "${nombre}" de ${servicio}.`);
  if (cuentaActiva(servicio, home) === nombre) activarCuenta(servicio, PRINCIPAL, home);
  rmSync(dir, { recursive: true, force: true });
}

/** Variables de entorno para que la CLI use la cuenta (vacío para la principal). */
export function entornoCuenta(servicio, nombre = cuentaActiva(servicio), home = agentrelayHome()) {
  const dir = carpetaCuenta(servicio, nombre, home);
  if (!dir) return {};
  return servicio === 'luna' ? { CODEX_HOME: dir } : { GEMINI_CLI_HOME: dir };
}

/** Carpeta ~/.gemini de una cuenta de Gemini. */
export function geminiDirCuenta(nombre = cuentaActiva('gemini'), home = agentrelayHome()) {
  const dir = carpetaCuenta('gemini', nombre, home);
  return path.join(dir ?? (process.env.GEMINI_CLI_HOME || os.homedir()), '.gemini');
}

/** Clave de quota-state de la cuota gratuita de una cuenta: cada cuenta se agota por separado. */
export function quotaIdCuenta(servicio, nombre = cuentaActiva(servicio)) {
  comprobarServicio(servicio);
  const base = servicio === 'luna' ? 'codex:chatgpt' : 'gemini:google';
  return nombre === PRINCIPAL ? base : `${base}@${nombre}`;
}
