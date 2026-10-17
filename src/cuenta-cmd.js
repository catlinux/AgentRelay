// `agentrelay cuenta`: cuentas gratuitas de Luna (ChatGPT) y Gemini (Google), numeradas.
//
//   agentrelay cuenta                lista numerada con el correo y lo que queda; en un terminal pregunta cuál usar
//   agentrelay cuenta 2              usa la cuenta 2 (si su sesión caducó, abre el inicio de sesión)
//   agentrelay cuenta nueva luna     inicia sesión con otra cuenta de ChatGPT (o gemini) y la deja en uso
//   agentrelay cuenta quitar 2       borra esa cuenta y su sesión (la principal no se puede quitar)
//
// Las sesiones de OpenCode no se tocan: viven en su propia configuración.

import readline from 'node:readline/promises';
import { EXECUTOR_DEFAULTS, loadConfig } from './config.js';
import {
  activarCuenta, borrarCuenta, correoLuna, crearCuenta, cuentaActiva, entornoCuenta, geminiDirCuenta, listarCuentas,
  nombreLibre, PRINCIPAL, SERVICIOS,
} from './cuentas.js';
import { formatReset } from './cuota.js';
import { executorsDir, isInstalled } from './executors/catalog.js';
import { readRateLimits } from './executors/codex.js';
import { checkSession, readQuota } from './executors/gemini.js';
import { getExecutor } from './executors/index.js';

const TITULO = { luna: 'Luna (ChatGPT)', gemini: 'Gemini (Google)' };

function executorDe(servicio, config) {
  const type = servicio === 'luna' ? 'codex' : 'gemini';
  return config.executor.type === type ? config.executor : { ...EXECUTOR_DEFAULTS[type], type };
}

/** Resumen de una ventana o modelo con menos cuota: "queda 40 % · se renueva mañana 09:00". */
function resumen(items, now) {
  const peor = items.filter((item) => item.pct != null).sort((a, b) => a.pct - b.pct)[0];
  if (!peor) return '';
  const reset = peor.resetAt ? ` · se renueva ${formatReset(peor.resetAt, now)}` : '';
  return peor.pct === 0 ? `agotada${reset}` : `queda ${peor.pct} %${reset}`;
}

async function estadoLuna(executor, cuenta, now) {
  const correo = correoLuna(cuenta);
  const res = await readRateLimits(executor, { env: entornoCuenta('luna', cuenta) });
  if (!res.ok) return { correo: res.email || correo, ok: false, estado: 'sin sesión' };
  return {
    correo: res.email || correo,
    ok: true,
    estado: resumen(res.windows.map((w) => ({ pct: w.usedPercent == null ? null : Math.max(0, 100 - w.usedPercent), resetAt: w.resetAt })), now) || 'con sesión',
  };
}

async function estadoGemini(cuenta, now) {
  const dir = geminiDirCuenta(cuenta);
  const session = await checkSession({ dir });
  if (!session.ok) return { correo: session.email, ok: false, estado: session.expired ? 'sesión caducada' : 'sin sesión' };
  const quota = await readQuota({ dir });
  return {
    correo: session.email,
    ok: true,
    // Si la cuota no se puede leer, se dice por qué (p. ej. Google ya no admite la cuenta en Gemini CLI).
    estado: quota.ok ? resumen(quota.models.map((m) => ({ pct: m.remainingPercent, resetAt: m.resetAt })), now) || 'con sesión' : `sin cuota: ${quota.message}`,
  };
}

/** Lista numerada de todas las cuentas: [{ n, servicio, cuenta, activa, correo, ok, estado }]. */
export async function listarTodas(config, { now = new Date(), geminiInstalado } = {}) {
  const filas = [];
  const conGemini = geminiInstalado ?? await isInstalled('gemini', { dir: executorsDir() });
  for (const servicio of SERVICIOS) {
    if (servicio === 'gemini' && !conGemini) continue;
    const activa = cuentaActiva(servicio);
    for (const cuenta of listarCuentas(servicio)) {
      const estado = servicio === 'luna' ? await estadoLuna(executorDe('luna', config), cuenta, now) : await estadoGemini(cuenta, now);
      filas.push({ n: filas.length + 1, servicio, cuenta, activa: cuenta === activa, ...estado });
    }
  }
  return filas;
}

function pintar(filas, out, conGemini) {
  out('Cuentas gratuitas (● = la que se usa)');
  for (const servicio of SERVICIOS) {
    const propias = filas.filter((fila) => fila.servicio === servicio);
    out('');
    out(TITULO[servicio]);
    if (!propias.length) out('     Gemini CLI no está instalado: agentrelay executors add gemini');
    for (const fila of propias) {
      const correo = (fila.correo || (fila.cuenta === PRINCIPAL ? 'cuenta principal' : fila.cuenta)).padEnd(30);
      out(`  ${fila.activa ? '●' : ' '} ${String(fila.n).padStart(2)}  ${correo} ${fila.estado}`);
    }
  }
  out('');
  out('Usar otra:       agentrelay cuenta <número>');
  out(`Añadir otra:     agentrelay cuenta nueva luna${conGemini ? '   ·   agentrelay cuenta nueva gemini' : ''}`);
  out('Quitar:          agentrelay cuenta quitar <número>');
}

async function iniciarSesion(servicio, cuenta, config, values, out) {
  const executor = executorDe(servicio, config);
  out(servicio === 'luna'
    ? 'Se abre el navegador: entra con la cuenta de ChatGPT que quieras usar.'
    : 'Se abre Gemini CLI: elige «Sign in with Google», entra con la cuenta que quieras usar y sal con /quit.');
  await getExecutor(executor.type).login(executor, {
    device: Boolean(values.device), env: entornoCuenta(servicio, cuenta), ...(servicio === 'gemini' ? { dir: geminiDirCuenta(cuenta) } : {}),
  });
}

async function usar(fila, config, values, out) {
  if (!fila.ok) {
    await iniciarSesion(fila.servicio, fila.cuenta, config, values, out);
    const [nueva] = (await listarTodas(config)).filter((f) => f.servicio === fila.servicio && f.cuenta === fila.cuenta);
    if (!nueva?.ok) throw new Error('No se completó el inicio de sesión; la cuenta en uso no ha cambiado.');
    fila = nueva;
  }
  activarCuenta(fila.servicio, fila.cuenta);
  out(`✔ ${TITULO[fila.servicio]}: ahora se usa ${fila.correo || fila.cuenta} (${fila.estado}).`);
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
    const conGemini = await isInstalled('gemini', { dir: executorsDir() });

    if (primero === 'nueva') {
      if (!SERVICIOS.includes(segundo)) throw new Error('Indica cuál: agentrelay cuenta nueva luna   o   agentrelay cuenta nueva gemini');
      if (segundo === 'gemini' && !conGemini) throw new Error('Gemini CLI no está instalado. Instálalo con: agentrelay executors add gemini');
      const cuenta = nombreLibre(segundo);
      crearCuenta(segundo, cuenta);
      try {
        await iniciarSesion(segundo, cuenta, config, values, out);
      } finally {
        const [fila] = (await listarTodas(config, { geminiInstalado: conGemini })).filter((f) => f.servicio === segundo && f.cuenta === cuenta);
        if (!fila?.ok) {
          borrarCuenta(segundo, cuenta);
          err('No se completó el inicio de sesión; no se ha añadido ninguna cuenta.');
        } else {
          activarCuenta(segundo, cuenta);
          out(`✔ Añadida y en uso: ${fila.correo || cuenta} (${fila.estado}). Para volver a otra: agentrelay cuenta`);
        }
      }
      return 0;
    }

    const filas = await listarTodas(config, { geminiInstalado: conGemini });
    const buscar = (texto) => {
      const fila = filas.find((f) => String(f.n) === String(texto));
      if (!fila) throw new Error(`No hay ninguna cuenta con el número ${texto}. Mira la lista con: agentrelay cuenta`);
      return fila;
    };

    if (primero === 'quitar') {
      const fila = buscar(segundo);
      if (fila.cuenta === PRINCIPAL) throw new Error('La cuenta principal no se quita desde AgentRelay (es la sesión normal de Codex o Gemini).');
      borrarCuenta(fila.servicio, fila.cuenta);
      out(`✔ Quitada ${fila.correo || fila.cuenta} y su sesión guardada.`);
      return 0;
    }
    if (primero) {
      await usar(buscar(primero), config, values, out);
      return 0;
    }

    pintar(filas, out, conGemini);
    const respuesta = await preguntar('\n¿Qué cuenta quieres usar? (número, Enter para salir) ');
    if (respuesta) await usar(buscar(respuesta), config, values, out);
    return 0;
  } catch (error) {
    err(error.message);
    return 1;
  }
}
