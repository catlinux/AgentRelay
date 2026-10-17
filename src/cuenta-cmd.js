// `agentrelay cuenta`: cuentas gratuitas de Luna (ChatGPT), numeradas.
//
//   agentrelay cuenta             lista numerada con el correo y lo que queda; en un terminal pregunta cuál usar
//   agentrelay cuenta 2           usa la cuenta 2 (si no tiene sesión, abre el inicio de sesión)
//   agentrelay cuenta nueva       inicia sesión con otra cuenta de ChatGPT y la deja en uso
//   agentrelay cuenta quitar 2    borra esa cuenta y su sesión (la principal no se puede quitar)
//
// Las sesiones de OpenCode y Antigravity no se tocan: viven en su propia configuración.

import readline from 'node:readline/promises';
import { EXECUTOR_DEFAULTS, loadConfig } from './config.js';
import {
  activarCuenta, borrarCuenta, correoLuna, crearCuenta, cuentaActiva, entornoCuenta, listarCuentas, nombreLibre, PRINCIPAL,
} from './cuentas.js';
import { formatReset } from './cuota.js';
import { readRateLimits } from './executors/codex.js';
import { getExecutor } from './executors/index.js';

function executorDe(config) {
  return config.executor.type === 'codex' ? config.executor : { ...EXECUTOR_DEFAULTS.codex, type: 'codex' };
}

/** Resumen de la ventana con menos cuota: "queda 40 % · se renueva mañana 09:00" o "agotada · …". */
function resumen(windows, now) {
  const peor = windows.filter((w) => w.usedPercent != null).sort((a, b) => b.usedPercent - a.usedPercent)[0];
  if (!peor) return '';
  const pct = Math.max(0, 100 - peor.usedPercent);
  const reset = peor.resetAt ? ` · se renueva ${formatReset(peor.resetAt, now)}` : '';
  return pct === 0 ? `agotada${reset}` : `queda ${pct} %${reset}`;
}

/** Lista numerada de las cuentas: [{ n, cuenta, activa, correo, ok, estado }]. */
export async function listarTodas(config, { now = new Date(), leer = readRateLimits } = {}) {
  const activa = cuentaActiva('luna');
  const filas = [];
  for (const cuenta of listarCuentas('luna')) {
    const res = await leer(executorDe(config), { env: entornoCuenta('luna', cuenta) });
    filas.push({
      n: filas.length + 1,
      cuenta,
      activa: cuenta === activa,
      correo: res.email || correoLuna(cuenta),
      ok: res.ok,
      estado: res.ok ? resumen(res.windows, now) || 'con sesión' : 'sin sesión',
    });
  }
  return filas;
}

function pintar(filas, out) {
  out('Cuentas de ChatGPT para Luna (● = la que se usa)');
  out('');
  for (const fila of filas) {
    const correo = (fila.correo || (fila.cuenta === PRINCIPAL ? 'cuenta principal' : fila.cuenta)).padEnd(30);
    out(`  ${fila.activa ? '●' : ' '} ${String(fila.n).padStart(2)}  ${correo} ${fila.estado}`);
  }
  out('');
  out('Usar otra:    agentrelay cuenta <número>');
  out('Añadir otra:  agentrelay cuenta nueva');
  out('Quitar:       agentrelay cuenta quitar <número>');
}

async function iniciarSesion(cuenta, config, values, out) {
  const executor = executorDe(config);
  out('Se abre el navegador: entra con la cuenta de ChatGPT que quieras usar.');
  await getExecutor('codex').login(executor, { device: Boolean(values.device), env: entornoCuenta('luna', cuenta) });
}

async function usar(fila, config, values, out) {
  if (!fila.ok) {
    await iniciarSesion(fila.cuenta, config, values, out);
    const nueva = (await listarTodas(config)).find((f) => f.cuenta === fila.cuenta);
    if (!nueva?.ok) throw new Error('No se completó el inicio de sesión; la cuenta en uso no ha cambiado.');
    fila = nueva;
  }
  activarCuenta('luna', fila.cuenta);
  out(`✔ Luna usa ahora ${fila.correo || fila.cuenta} (${fila.estado}).`);
}

async function preguntar(texto) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(texto)).trim().toLowerCase(); } finally { rl.close(); }
}

export async function cmdCuenta(positionals, values, { out = (line) => process.stdout.write(`${line}\n`), err = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const { config } = loadConfig({ cwd: values.cwd || process.cwd(), configPath: values.config });
  const [primero, segundo] = positionals;
  try {
    if (primero === 'nueva') {
      if (segundo && segundo !== 'luna') throw new Error('Solo hay cuentas de Luna: agentrelay cuenta nueva');
      const cuenta = nombreLibre('luna');
      crearCuenta('luna', cuenta);
      try {
        await iniciarSesion(cuenta, config, values, out);
      } finally {
        const fila = (await listarTodas(config)).find((f) => f.cuenta === cuenta);
        if (!fila?.ok) {
          borrarCuenta('luna', cuenta);
          err('No se completó el inicio de sesión; no se ha añadido ninguna cuenta.');
        } else {
          activarCuenta('luna', cuenta);
          out(`✔ Añadida y en uso: ${fila.correo || cuenta} (${fila.estado}). Para volver a otra: agentrelay cuenta`);
        }
      }
      return 0;
    }

    const filas = await listarTodas(config);
    const buscar = (texto) => {
      const fila = filas.find((f) => String(f.n) === String(texto));
      if (!fila) throw new Error(`No hay ninguna cuenta con el número ${texto}. Mira la lista con: agentrelay cuenta`);
      return fila;
    };

    if (primero === 'quitar') {
      const fila = buscar(segundo);
      if (fila.cuenta === PRINCIPAL) throw new Error('La cuenta principal no se quita desde AgentRelay (es la sesión normal de Codex).');
      borrarCuenta('luna', fila.cuenta);
      out(`✔ Quitada ${fila.correo || fila.cuenta} y su sesión guardada.`);
      return 0;
    }
    if (primero) {
      await usar(buscar(primero), config, values, out);
      return 0;
    }

    pintar(filas, out);
    const respuesta = await preguntar('\n¿Qué cuenta quieres usar? (número, Enter para salir) ');
    if (respuesta) await usar(buscar(respuesta), config, values, out);
    return 0;
  } catch (error) {
    err(error.message);
    return 1;
  }
}
