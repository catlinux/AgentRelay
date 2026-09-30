// Interfaz de línea de comandos.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, DEFAULT_CONFIG, loadConfig } from './config.js';
import { getExecutor } from './executors/index.js';
import { CATALOG, executorsDir, getCatalogEntry, installExecutor, isInstalled } from './executors/catalog.js';
import { commitAll, commitPaths, isClean, isIgnored, repoRoot } from './git.js';
import { applyBlockToFile, GLOBAL_BLOCK, globalInstructionsPath, initExplanation, PROJECT_BLOCK, removeBlockFromFile, setupExplanation } from './instructions.js';
import { applyReview, DECISIONS, recheck, startRun } from './orchestrator.js';
import { confirm } from './prompt.js';
import { prepareRepository } from './prepare.js';
import { formatEvent, useColor } from './events.js';
import { SELF_REVIEW_MODES } from './policy.js';
import { runProcess } from './proc.js';
import { latestRunId, listRunIds, loadState, runDir } from './store.js';
import { loadTask } from './task.js';
import { VERSION } from './version.js';
import { watchRuns } from './watch.js';

const HELP = `AgentRelay ${VERSION} — delega tareas de desarrollo a un agente ejecutor y devuelve el resultado validado.

Uso:
  agentrelay run <tarea.json | ->   Delega una tarea (JSON en archivo o por stdin)
  agentrelay show [id]              Muestra el informe de una ejecución (por defecto, la última)
  agentrelay review <id> --decision <accept|fix|escalate|reject> [--feedback <texto>]
                                    Registra la revisión del orquestador
  agentrelay check [id]             Repite las validaciones sin cambiar el estado
  agentrelay list                   Lista las ejecuciones del repositorio
  agentrelay watch [id]             Sigue en directo una ejecución (sin id, sigue todas las nuevas)
  agentrelay doctor                 Comprueba el entorno (git, ejecutor, configuración)
  agentrelay login [--device]       Inicia sesión de ChatGPT con Codex
  agentrelay setup                  Instala/desinstala el bloque de AgentRelay en el CLAUDE.md global
  agentrelay init                   Prepara el proyecto: instrucciones en CLAUDE.md y, si hace falta, el repositorio git

  agentrelay executors              Lista los ejecutores disponibles e instalados
  agentrelay executors add <nombre> Instala un ejecutor opcional

Opciones comunes:
  --cwd <dir>             Repositorio de trabajo (por defecto, el directorio actual)
  --config <archivo>      Archivo de configuración alternativo
  --json                  Salida en JSON

Opciones de run:
  --level <1-5>           Nivel de orquestación (1 = máximo ahorro … 5 = máxima supervisión)
  --self-review <modo>    Fuerza el modo de self-review: ${SELF_REVIEW_MODES.join(' | ')}
  --allow-dirty           Permite delegar con cambios sin confirmar
  --quiet                 Sin mensajes de progreso

Opciones de review:
  --feedback <texto>      Problemas a corregir (obligatorio con fix)
  --feedback-file <ruta>  Lee el feedback de un archivo
  --force                 Acepta sin superar la validación final, o corrige por encima del límite

Opciones de setup:
  --uninstall             Retira el bloque de AgentRelay
  --yes                   Aplica sin pedir confirmación
  --claude-dir <dir>      Directorio .claude (por defecto, ~/.claude)

  --executors <lista>     Instala ejecutores opcionales separados por comas

Opciones de init:
  --yes                   Aplica sin pedir confirmación (git init, primer commit, commit de CLAUDE.md)
  --with-config           Crea además ${CONFIG_FILE}

Códigos de salida: 0 correcto · 1 error · 2 tarea escalada al orquestador.
`;

const OPTIONS = {
  cwd: { type: 'string' },
  config: { type: 'string' },
  json: { type: 'boolean' },
  level: { type: 'string' },
  'self-review': { type: 'string' },
  'allow-dirty': { type: 'boolean' },
  quiet: { type: 'boolean' },
  decision: { type: 'string' },
  feedback: { type: 'string' },
  'feedback-file': { type: 'string' },
  force: { type: 'boolean' },
  yes: { type: 'boolean' },
  uninstall: { type: 'boolean' },
  'claude-dir': { type: 'string' },
  'with-config': { type: 'boolean' },
  device: { type: 'boolean' },
  executors: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
};

async function resolveRoot(values) {
  const cwd = path.resolve(values.cwd || process.cwd());
  const root = await repoRoot(cwd);
  if (!root) throw new Error(`${cwd} no es un repositorio git. Ejecuta "agentrelay init" para prepararlo (hace git init, crea un .gitignore con patrones de secretos y un primer commit, pidiendo confirmación).`);
  return root;
}

function resolveRunId(root, id) {
  const runId = id || latestRunId(root);
  if (!runId) throw new Error('No hay ejecuciones en este repositorio');
  return runId;
}

function printResult(state, root, json) {
  const dir = runDir(root, state.id);
  if (json) {
    const check = state.lastCheck;
    const output = {
      id: state.id,
      status: state.status,
      reasons: state.statusReasons,
      level: state.policy.level,
      selfReview: state.selfReview,
      retriesUsed: state.retriesUsed,
      changedFiles: check?.files ?? [],
      validations: check?.validations.map(({ command, passed, exitCode, timedOut }) => ({ command, passed, exitCode, timedOut })) ?? [],
      scopeViolations: check?.scopeViolations ?? [],
      agentReport: state.attempts[state.attempts.length - 1]?.report ?? null,
      usage: state.usage,
      reportFile: path.join(dir, 'report.md'),
      diffFile: path.join(dir, 'diff.patch'),
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    const report = path.join(dir, 'report.md');
    process.stdout.write(existsSync(report) ? readFileSync(report, 'utf8') : `Estado: ${state.status}\n`);
  }
  return state.status === 'escalated' ? 2 : 0;
}

/** Crea el manejador onEvent que muestra los eventos formateados por stderr. */
function eventPrinter(values) {
  if (values.quiet) return undefined;
  const startedAtMs = Date.now();
  return (event) => {
    const line = formatEvent(event, startedAtMs, { color: useColor(process.stderr) });
    if (line) process.stderr.write(`${line}\n`);
  };
}

async function cmdRun(positionals, values) {
  const source = positionals[0];
  if (!source) throw new Error('Indica la tarea: agentrelay run <tarea.json | ->');
  const task = loadTask(source === '-' ? '-' : path.resolve(source));
  if (values['self-review']) {
    if (!SELF_REVIEW_MODES.includes(values['self-review'])) throw new Error(`--self-review debe ser ${SELF_REVIEW_MODES.join(' | ')}`);
    task.selfReview = values['self-review'];
  }
  const root = await resolveRoot(values);
  const overrides = values.level ? { level: values.level } : undefined;
  const { config } = loadConfig({ cwd: root, configPath: values.config, overrides });
  const onEvent = eventPrinter(values);
  const state = await startRun({ root, task, config, allowDirty: values['allow-dirty'], onEvent });
  return printResult(state, root, values.json);
}

async function cmdShow(positionals, values) {
  const root = await resolveRoot(values);
  const state = loadState(root, resolveRunId(root, positionals[0]));
  return printResult(state, root, values.json);
}

async function cmdReview(positionals, values) {
  const root = await resolveRoot(values);
  if (!positionals[0]) throw new Error('Indica el id de la ejecución: agentrelay review <id> --decision ...');
  if (!values.decision) throw new Error(`Indica --decision ${DECISIONS.join(' | ')}`);
  let feedback = values.feedback || '';
  if (values['feedback-file']) feedback = readFileSync(path.resolve(values['feedback-file']), 'utf8');
  const onEvent = eventPrinter(values);
  const state = await applyReview({
    root, id: positionals[0], decision: values.decision, feedback, force: values.force, onEvent,
  });
  return printResult(state, root, values.json);
}

async function cmdCheck(positionals, values) {
  const root = await resolveRoot(values);
  const onEvent = eventPrinter(values);
  const { state, check } = await recheck({ root, id: resolveRunId(root, positionals[0]), onEvent });
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ id: state.id, passed: check.passed, files: check.files, validations: check.validations, scopeViolations: check.scopeViolations }, null, 2)}\n`);
  } else {
    process.stdout.write(`Validación ${check.passed ? 'correcta' : 'fallida'} · informe: ${path.join(runDir(root, state.id), 'report.md')}\n`);
  }
  return check.passed ? 0 : 1;
}

async function cmdList(values) {
  const root = await resolveRoot(values);
  const runs = listRunIds(root).map((id) => {
    const s = loadState(root, id);
    return { id, status: s.status, level: s.policy.level, attempts: s.attempts.length, title: s.task.title };
  });
  if (values.json) process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
  else if (!runs.length) process.stdout.write('No hay ejecuciones.\n');
  else for (const r of runs) process.stdout.write(`${r.id}  ${r.status.padEnd(16)} nivel ${r.level}  intentos ${r.attempts}  ${r.title}\n`);
  return 0;
}

async function cmdWatch(positionals, values) {
  const root = await resolveRoot(values);
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  try {
    await watchRuns({
      root,
      id: positionals[0],
      write: (line) => process.stdout.write(`${line}\n`),
      color: useColor(process.stdout),
      signal: controller.signal,
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
  return 0;
}

async function cmdDoctor(values) {
  let ok = true;
  const line = (good, text) => {
    if (!good) ok = false;
    process.stdout.write(`${good ? '[ok]   ' : '[fallo]'} ${text}\n`);
  };
  const major = Number(process.versions.node.split('.')[0]);
  line(major >= 20, `Node.js ${process.versions.node} (se necesita >= 20) · ${process.platform}/${process.arch}`);

  const gitVersion = await runProcess('git', ['--version'], { windowsShell: false, timeoutMs: 30_000 });
  line(gitVersion.code === 0, gitVersion.code === 0 ? gitVersion.stdout.trim() : 'git no disponible');

  const cwd = path.resolve(values.cwd || process.cwd());
  const root = gitVersion.code === 0 ? await repoRoot(cwd) : null;
  line(Boolean(root), root ? `Repositorio: ${root}` : `${cwd} no es un repositorio git`);

  let config;
  try {
    const loaded = loadConfig({ cwd: root || cwd, configPath: values.config });
    config = loaded.config;
    line(true, `Configuración: ${loaded.sources.length ? loaded.sources.join(', ') : 'valores por defecto'} · nivel ${config.level}`);
  } catch (error) {
    line(false, error.message);
  }

  if (config) {
    const executor = config.executor;
    const model = [executor.provider, executor.model].filter(Boolean).join('/') || 'modelo por defecto del ejecutor';
    let adapter = null;
    try {
      adapter = getExecutor(executor.type);
      const version = await adapter.version(executor);
      line(true, `Ejecutor ${executor.type} ${version} · ${model}`);
      process.stdout.write(`        ${adapter.commandParts(executor.command).join(' ')}\n`);
      if (adapter.authStatus) {
        const auth = await adapter.authStatus(executor);
        line(auth.ok, auth.ok ? `Sesión: ${auth.message}` : auth.message);
      }
    } catch (error) {
      const hint = adapter?.installHint || 'Ejecuta "npm install" en la carpeta de AgentRelay.';
      line(false, `Ejecutor ${executor.type} no disponible (${error.message})${error.message.includes(hint) ? '' : `. ${hint}`}`);
    }
  }
  return ok ? 0 : 1;
}

async function cmdExecutors(positionals, values) {
  const action = positionals[0];
  const dir = executorsDir();
  if (!action) {
    let configured = null;
    try {
      const cwd = path.resolve(values.cwd || process.cwd());
      const root = await repoRoot(cwd);
      configured = loadConfig({ cwd: root || cwd, configPath: values.config }).config.executor.type;
    } catch {
      // Listing remains useful when the project config cannot be loaded.
    }
    for (const entry of CATALOG) {
      const installed = await isInstalled(entry.name, { dir });
      const state = entry.bundled ? 'incluido' : installed ? 'instalado' : 'no instalado';
      const mark = entry.bundled || installed ? '✔' : '·';
      process.stdout.write(`${mark} ${entry.title} (${entry.name}) — ${state}${configured === entry.name ? ' · en uso' : ''}\n`);
      process.stdout.write(`  ${entry.description}\n`);
    }
    process.stdout.write('Añade uno con: agentrelay executors add <nombre>\n');
    return 0;
  }
  if (action !== 'add' || positionals.length !== 2) {
    process.stderr.write('Uso: agentrelay executors [add <nombre>]\n');
    return 1;
  }
  const name = positionals[1];
  const entry = getCatalogEntry(name, dir);
  if (!entry) {
    process.stderr.write(`Ejecutor desconocido: ${name}. Disponibles: ${CATALOG.map((item) => item.name).join(', ')}\n`);
    return 1;
  }
  if (entry.bundled) {
    process.stdout.write('Codex ya viene incluido con AgentRelay.\n');
    return 0;
  }
  if (await isInstalled(name, { dir })) {
    process.stdout.write(`${entry.title} ya está instalado en ${dir}.\n`);
    return 0;
  }
  return installOptionalExecutor(name, dir);
}

async function installOptionalExecutor(name, dir = executorsDir()) {
  const entry = getCatalogEntry(name, dir);
  process.stdout.write(`Se instalará ${entry.title} en ${dir}.\n`);
  const result = await installExecutor(name, { dir });
  if (!result.ok) {
    process.stderr.write(`No se pudo instalar ${entry.title}: ${result.error}\n`);
    return 1;
  }
  process.stdout.write(`✔ ${entry.title} instalado en ${dir}\n`);
  if (entry.connect) process.stdout.write(`Conéctalo con: ${entry.connect}\n`);
  process.stdout.write(`Para usarlo: pon { "executor": { "type": "${name}" } } en agentrelay.config.local.json\n`);
  return 0;
}

async function cmdLogin(values) {
  const cwd = path.resolve(values.cwd || process.cwd());
  const { config } = loadConfig({ cwd, configPath: values.config });
  const executor = config.executor;
  const adapter = getExecutor(executor.type);
  if (!adapter.login) {
    process.stdout.write(`El ejecutor ${executor.type} no necesita iniciar sesión con AgentRelay (se gestiona en su propia configuración).\n`);
    return 0;
  }
  const current = adapter.authStatus ? await adapter.authStatus(executor) : { ok: false, message: '' };
  if (current.ok) {
    process.stdout.write(`Sesión activa: ${current.message}. Para cambiar de cuenta ejecuta "codex logout" y vuelve a ejecutar este comando.\n`);
    return 0;
  }
  if (adapter.accountHint) process.stdout.write(`${adapter.accountHint}\n`);
  process.stdout.write(values.device
    ? 'Se mostrará un código para iniciar sesión con tu cuenta de ChatGPT.\n'
    : 'Se abrirá el navegador para iniciar sesión con tu cuenta de ChatGPT…\n');
  await adapter.login(executor, { device: values.device });
  const result = adapter.authStatus ? await adapter.authStatus(executor) : { ok: true };
  if (result.ok) {
    process.stdout.write('✔ Sesión iniciada\n');
    return 0;
  }
  process.stderr.write(`No se pudo iniciar sesión: ${result.message} Prueba "agentrelay login --device".\n`);
  if (adapter.accountHint && !result.message?.includes(adapter.accountHint)) process.stderr.write(`${adapter.accountHint}\n`);
  return 1;
}

async function cmdSetup(values) {
  const file = globalInstructionsPath(values['claude-dir']);
  const removing = Boolean(values.uninstall);
  for (const line of setupExplanation(file, removing)) process.stdout.write(`${line}\n`);

  const ok = await confirm(removing ? '¿Eliminar el bloque de AgentRelay?' : '¿Añadir el bloque de AgentRelay?', { yes: values.yes });
  if (ok === null) {
    process.stderr.write('Ejecuta de nuevo con --yes para aplicar el cambio.\n');
    return 1;
  }
  if (ok === false) {
    process.stdout.write('Cancelado.\n');
    return 0;
  }

  if (removing) {
    const { action } = removeBlockFromFile(file);
    process.stdout.write(`${action === 'removed' ? 'eliminado' : 'no había bloque'} ${file}\n`);
  } else {
    const { action } = applyBlockToFile(file, GLOBAL_BLOCK);
    const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
    process.stdout.write(`${label} ${file}\n`);
  }
  if (!removing) {
    const dir = executorsDir();
    const requested = [...new Set((values.executors || '').split(',').map((item) => item.trim()).filter(Boolean))];
    for (const name of requested) {
      const entry = getCatalogEntry(name, dir);
      if (!entry) {
        process.stderr.write(`Ejecutor desconocido: ${name}. Disponibles: ${CATALOG.map((item) => item.name).join(', ')}\n`);
        return 1;
      }
      if (entry.bundled) {
        process.stdout.write('Codex ya viene incluido con AgentRelay.\n');
      } else if (await isInstalled(name, { dir })) {
        process.stdout.write(`${entry.title} ya está instalado en ${dir}.\n`);
      } else if (await installOptionalExecutor(name, dir) !== 0) {
        return 1;
      }
    }
    let noTtyNotice = false;
    for (const entry of CATALOG.filter((item) => !item.bundled && !requested.includes(item.name))) {
      if (await isInstalled(entry.name, { dir })) continue;
      const answer = await confirm(`¿Instalar también ${entry.title}? ${entry.description}`, { yes: false });
      if (answer === null) {
        if (!noTtyNotice) {
          process.stdout.write('Ejecutores opcionales: agentrelay executors add <nombre> (ver agentrelay executors)\n');
          noTtyNotice = true;
        }
      } else if (answer && await installOptionalExecutor(entry.name, dir) !== 0) {
        return 1;
      }
    }
  }
  return 0;
}

/** Crea agentrelay.config.json si se pidió con --with-config y no existe. */
function writeConfigIfRequested(root, values) {
  if (!values['with-config']) return;
  const configFile = path.join(root, CONFIG_FILE);
  if (existsSync(configFile)) {
    process.stdout.write(`${configFile} ya existe; se mantiene.\n`);
  } else {
    const { level, executor, validation } = DEFAULT_CONFIG;
    writeFileSync(configFile, `${JSON.stringify({ level, executor, validation }, null, 2)}\n`);
    process.stdout.write(`Creado ${configFile}\n`);
  }
}

async function cmdInit(values) {
  const dir = path.resolve(values.cwd || process.cwd());
  const root = await repoRoot(dir);

  // Sin repositorio: preparar la carpeta (git init, .gitignore y primer commit).
  if (!root) {
    const result = await prepareRepository(dir, {
      yes: values.yes,
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
    });
    if (result.status === 'needs-confirmation') return 1;
    if (result.status === 'cancelled') {
      process.stdout.write('Cancelado.\n');
      return 0;
    }

    const file = path.join(dir, 'CLAUDE.md');
    process.stdout.write(`${initExplanation(file)}\n`);
    const { action } = applyBlockToFile(file, PROJECT_BLOCK);
    const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
    process.stdout.write(`${label} ${file}\n`);

    const res = await commitAll(dir, 'Estado inicial (AgentRelay)');
    if (res.ok) {
      process.stdout.write('Repositorio preparado con un primer commit.\n');
      writeConfigIfRequested(dir, values);
      return 0;
    }
    process.stderr.write(`El repositorio se ha creado pero no se pudo crear el primer commit: ${res.error}. Configura tu identidad (git config user.name / user.email) y confirma los archivos con git add -A && git commit.\n`);
    return 1;
  }

  const file = path.join(root, 'CLAUDE.md');

  // Estado del repositorio antes de tocar nada.
  const wasClean = await isClean(root);
  const ignored = await isIgnored(root, 'CLAUDE.md');

  process.stdout.write(`${initExplanation(file)}\n`);
  const { action } = applyBlockToFile(file, PROJECT_BLOCK);
  const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
  process.stdout.write(`${label} ${file}\n`);
  const changed = action !== 'unchanged';

  if (changed && wasClean && !ignored) {
    const ok = await confirm('¿Crear un commit con CLAUDE.md?', { yes: values.yes });
    if (ok === true) {
      const res = await commitPaths(root, ['CLAUDE.md'], 'Añade las instrucciones de AgentRelay');
      if (!res.ok) {
        process.stderr.write(`No se pudo crear el commit de CLAUDE.md: ${res.error}\n`);
      } else {
        process.stdout.write('Commit de CLAUDE.md creado.\n');
      }
    } else if (ok === null) {
      process.stderr.write('CLAUDE.md ha cambiado: confírmalo con git antes de delegar (AgentRelay necesita el repositorio limpio), o ejecuta de nuevo con --yes.\n');
    }
  } else if (changed && !wasClean) {
    process.stderr.write('El repositorio tenía cambios pendientes: confirma CLAUDE.md con git antes de delegar (AgentRelay necesita el repositorio limpio).\n');
  }

  writeConfigIfRequested(root, values);

  return 0;
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`);
    return 1;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (values.help || !command || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  try {
    switch (command) {
      case 'run': return await cmdRun(rest, values);
      case 'show': return await cmdShow(rest, values);
      case 'review': return await cmdReview(rest, values);
      case 'check': return await cmdCheck(rest, values);
      case 'list': return await cmdList(values);
      case 'watch': return await cmdWatch(rest, values);
      case 'doctor': return await cmdDoctor(values);
      case 'executors': return await cmdExecutors(rest, values);
      case 'login': return await cmdLogin(values);
      case 'setup': return await cmdSetup(values);
      case 'init': return await cmdInit(values);
      default:
        process.stderr.write(`Comando desconocido: ${command}\n\n${HELP}`);
        return 1;
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}
