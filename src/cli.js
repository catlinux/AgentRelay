// Interfaz de línea de comandos.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, DEFAULT_CONFIG, loadConfig } from './config.js';
import { getExecutor } from './executors/index.js';
import { commitAll, commitPaths, isClean, isIgnored, repoRoot } from './git.js';
import { applyBlockToFile, GLOBAL_BLOCK, globalInstructionsPath, PROJECT_BLOCK, removeBlockFromFile } from './instructions.js';
import { applyReview, DECISIONS, recheck, startRun } from './orchestrator.js';
import { confirm } from './prompt.js';
import { prepareRepository } from './prepare.js';
import { formatEvent } from './events.js';
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
  agentrelay setup                  Instala/desinstala el bloque de AgentRelay en el CLAUDE.md global
  agentrelay init                   Prepara el proyecto: instrucciones en CLAUDE.md y, si hace falta, el repositorio git

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
    const line = formatEvent(event, startedAtMs);
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
    try {
      const adapter = getExecutor(executor.type);
      const version = await adapter.version(executor);
      line(true, `Ejecutor ${executor.type} ${version} · ${executor.provider}/${executor.model}`);
      process.stdout.write(`        ${adapter.commandParts(executor.command).join(' ')}\n`);
    } catch (error) {
      line(false, `Ejecutor ${executor.type} no disponible (${error.message}). Ejecuta "npm install" en la carpeta de AgentRelay.`);
    }
  }
  return ok ? 0 : 1;
}

async function cmdSetup(values) {
  const file = globalInstructionsPath(values['claude-dir']);
  const removing = Boolean(values.uninstall);
  process.stdout.write(`Se ${removing ? 'eliminará' : 'añadirá/actualizará'} el bloque de AgentRelay en ${file}\n`);

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
