// `agentrelay cuenta`: ver, añadir, activar y borrar cuentas gratuitas de Luna y Gemini.
// Las sesiones de OpenCode no se tocan: viven en su propia configuración.

import { EXECUTOR_DEFAULTS, loadConfig } from './config.js';
import {
  activarCuenta, borrarCuenta, crearCuenta, cuentaActiva, entornoCuenta, geminiDirCuenta, listarCuentas, PRINCIPAL, SERVICIOS,
} from './cuentas.js';
import { executorsDir, isInstalled } from './executors/catalog.js';
import { getExecutor } from './executors/index.js';

const TITULO = { luna: 'Luna (cuenta de ChatGPT)', gemini: 'Gemini (cuenta de Google)' };

function executorDe(servicio, config) {
  const type = servicio === 'luna' ? 'codex' : 'gemini';
  return config.executor.type === type ? config.executor : { ...EXECUTOR_DEFAULTS[type], type };
}

async function sesion(servicio, cuenta, executor) {
  const adapter = getExecutor(executor.type);
  const status = servicio === 'luna'
    ? await adapter.authStatus(executor, { env: entornoCuenta('luna', cuenta) })
    : await adapter.authStatus(executor, { dir: geminiDirCuenta(cuenta) });
  return status.ok ? status.message : 'sin sesión';
}

async function mostrar(config, out) {
  for (const servicio of SERVICIOS) {
    const activa = cuentaActiva(servicio);
    out(`${TITULO[servicio]}:`);
    if (servicio === 'gemini' && !await isInstalled('gemini', { dir: executorsDir() })) {
      out('  (Gemini CLI no instalado: agentrelay executors add gemini)');
      continue;
    }
    for (const cuenta of listarCuentas(servicio)) {
      out(`  ${cuenta === activa ? '●' : '○'} ${cuenta} — ${await sesion(servicio, cuenta, executorDe(servicio, config))}`);
    }
  }
  out('');
  out('Añadir:   agentrelay cuenta luna add <nombre>     (o gemini) — abre el inicio de sesión en una carpeta propia');
  out('Cambiar:  agentrelay cuenta luna use <nombre>     (principal = la cuenta de siempre)');
  out('Borrar:   agentrelay cuenta luna remove <nombre>');
  out('Cuánto queda en cada una: agentrelay cuota');
}

export async function cmdCuenta(positionals, values, { out = (line) => process.stdout.write(`${line}\n`), err = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const { config } = loadConfig({ cwd: values.cwd || process.cwd(), configPath: values.config });
  const [servicio, accion, nombre] = positionals;
  try {
    if (!servicio) {
      await mostrar(config, out);
      return 0;
    }
    if (!SERVICIOS.includes(servicio)) throw new Error(`Servicio desconocido: ${servicio}. Usa: agentrelay cuenta luna|gemini …`);
    if (!accion) {
      for (const cuenta of listarCuentas(servicio)) out(`${cuenta === cuentaActiva(servicio) ? '●' : '○'} ${cuenta}`);
      return 0;
    }
    if (!nombre) throw new Error(`Falta el nombre. Uso: agentrelay cuenta ${servicio} ${accion} <nombre>`);
    const executor = executorDe(servicio, config);
    if (accion === 'add') {
      if (servicio === 'gemini' && !await isInstalled('gemini', { dir: executorsDir() })) throw new Error('Gemini CLI no está instalado. Instálalo con: agentrelay executors add gemini');
      if (listarCuentas(servicio).includes(nombre)) throw new Error(`La cuenta "${nombre}" ya existe. Para iniciar sesión otra vez, bórrala y vuelve a añadirla.`);
      crearCuenta(servicio, nombre);
      out(servicio === 'luna'
        ? 'Inicia sesión con la otra cuenta de ChatGPT en el navegador.'
        : 'Se abre Gemini CLI: elige «Sign in with Google» con la otra cuenta y sal con /quit.');
      const adapter = getExecutor(executor.type);
      await adapter.login(executor, { device: Boolean(values.device), env: entornoCuenta(servicio, nombre) });
      const estado = await sesion(servicio, nombre, executor);
      if (estado === 'sin sesión') {
        borrarCuenta(servicio, nombre);
        throw new Error('No se completó el inicio de sesión; no se ha creado la cuenta.');
      }
      activarCuenta(servicio, nombre);
      out(`✔ Cuenta "${nombre}" añadida y activa (${estado}). Vuelve a la de siempre con: agentrelay cuenta ${servicio} use ${PRINCIPAL}`);
      return 0;
    }
    if (accion === 'use') {
      activarCuenta(servicio, nombre);
      out(`✔ ${TITULO[servicio]}: ahora se usa la cuenta "${nombre}".`);
      return 0;
    }
    if (accion === 'remove') {
      borrarCuenta(servicio, nombre);
      out(`✔ Cuenta "${nombre}" borrada (con su sesión guardada). Activa: ${cuentaActiva(servicio)}.`);
      return 0;
    }
    throw new Error(`Acción desconocida: ${accion}. Usa add, use o remove.`);
  } catch (error) {
    err(error.message);
    return 1;
  }
}
