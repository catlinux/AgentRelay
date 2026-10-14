// agentrelay evaluar: prueba los modelos gratuitos de OpenCode Go de la cuenta y
// propone (o aplica) el nuevo routing.freeOrder. Solo se ejecuta cuando se invoca.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXECUTOR_DEFAULTS, agentrelayHome, loadConfig, parseJsonc } from './config.js';
import { setConfigValue } from './config-file.js';
import { configTemplate } from './config-template.js';
import { isInstalled } from './executors/catalog.js';
import { authStatus as opencodeAuthStatus } from './executors/opencode.js';
import { routeEntries } from './router.js';
import {
  evaluar as evaluarReal, marcarRevertido, marcarUltimoAplicado, ultimoAplicado,
} from './evaluar.js';

const userConfigFile = () => path.join(agentrelayHome(), 'config.json');

/** Escribe solo routing.freeOrder en la configuración de usuario y deshace si queda inválida. */
function writeFreeOrder(freeOrder, { cwd, configPath }) {
  const file = userConfigFile();
  const hadFile = existsSync(file);
  const previous = hadFile ? readFileSync(file, 'utf8') : configTemplate({ scope: 'user' });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, setConfigValue(previous, 'routing.freeOrder', freeOrder), 'utf8');
  try {
    const text = readFileSync(file, 'utf8');
    parseJsonc(text, file);
    return loadConfig({ cwd, configPath });
  } catch (error) {
    if (hadFile) writeFileSync(file, previous, 'utf8'); else rmSync(file, { force: true });
    throw error;
  }
}

function describeOrder(loaded, out) {
  out('Orden efectivo del enrutado:');
  routeEntries({ config: loaded.config }).forEach((entry, index) => {
    out(`  ${index + 1}. ${entry.label}${entry.paid ? ' · de pago' : ''}`);
  });
}

function warnProjectOverride(loaded, out) {
  const origin = loaded.origins?.['routing.freeOrder'];
  if (origin && path.isAbsolute(origin) && path.resolve(origin) !== path.resolve(userConfigFile())) {
    out(`Aviso: ${origin} fija routing.freeOrder y anula este cambio en ese proyecto.`);
  }
}

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function revertir(values, { out, err }) {
  if (values.models || values.runs || values['no-apply']) {
    err('--revert no se puede combinar con --models, --runs ni --no-apply.');
    return 1;
  }
  const home = agentrelayHome();
  const run = ultimoAplicado(home);
  if (!run) {
    out('No hay ninguna evaluación aplicada que deshacer.');
    return 0;
  }
  const previous = Array.isArray(run.freeOrderPrevio) ? run.freeOrderPrevio : [];
  const loaded = writeFreeOrder(previous, { cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config });
  marcarRevertido(home, run.at);
  out(`routing.freeOrder restaurado: ${previous.length ? previous.join(', ') : '(vacío)'}`);
  warnProjectOverride(loaded, out);
  describeOrder(loaded, out);
  return 0;
}

export async function cmdEvaluar(positionals, values, runtime = {}) {
  const out = runtime.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = runtime.err ?? ((text) => process.stderr.write(`${text}\n`));
  if (positionals.length) {
    err('Uso: agentrelay evaluar [--models a,b] [--runs N] [--no-apply] [--revert]');
    return 1;
  }
  if (values.revert) return revertir(values, { out, err });

  let runs = 1;
  if (values.runs !== undefined) {
    runs = Number(values.runs);
    if (!Number.isInteger(runs) || runs < 1 || runs > 3) {
      err('--runs debe ser un entero entre 1 y 3.');
      return 1;
    }
  }
  const modelos = values.models
    ? String(values.models).split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;

  const cwd = path.resolve(values.cwd || process.cwd());
  const loaded = loadConfig({ cwd, configPath: values.config });
  const executor = loaded.config.executor.type === 'opencode'
    ? loaded.config.executor
    : { ...loaded.config.executor, ...EXECUTOR_DEFAULTS.opencode, type: 'opencode' };

  if (!await (runtime.isInstalled ?? isInstalled)('opencode')) {
    err('OpenCode no está instalado. Instálalo con: agentrelay executors add opencode');
    return 1;
  }
  const auth = await (runtime.authStatus ?? opencodeAuthStatus)(executor);
  if (!auth.ok) {
    err(auth.message || 'OpenCode no tiene sesión. Conéctala con: agentrelay login opencode');
    return 1;
  }

  const log = (event) => {
    if (event?.type === 'sondeo') out(`Sondeando ${event.modelo}…`);
    else if (event?.type === 'tarea') out(`  ${event.modelo} · ${event.tarea} (repetición ${event.run}/${runs})`);
  };
  let result;
  try {
    result = await (runtime.evaluar ?? evaluarReal)({ executor, modelos, runs, log });
  } catch (error) {
    err(error.message);
    return 1;
  }

  out(result.informe);
  out(`Informe guardado en: ${result.rutaInforme}`);

  if (result.sinAptos || !result.seleccion.length) {
    out('Ningún modelo es apto: no se cambia nada.');
    return 0;
  }
  const nuevo = result.seleccion.map((id) => `opencode:${id}`);
  if (values['no-apply']) {
    out(`Propuesta sin aplicar: routing.freeOrder = ${nuevo.join(', ')}`);
    out('Para aplicarla, vuelve a ejecutar agentrelay evaluar sin --no-apply.');
    return 0;
  }

  const paidBefore = loaded.config.routing.paidOrder;
  const after = writeFreeOrder(nuevo, { cwd, configPath: values.config });
  if (!sameList(after.config.routing.paidOrder, paidBefore)) {
    err('Error: routing.paidOrder ha cambiado al aplicar; revisa la configuración.');
    return 1;
  }
  marcarUltimoAplicado(agentrelayHome(), nuevo);
  out(`routing.freeOrder aplicado: ${nuevo.join(', ')} (para deshacer: agentrelay evaluar --revert)`);
  warnProjectOverride(after, out);
  describeOrder(after, out);
  return 0;
}
