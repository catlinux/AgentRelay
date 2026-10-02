// Interfaz de línea de comandos.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, EXECUTOR_DEFAULTS, agentrelayHome, loadConfig, parseJsonc } from './config.js';
import { migrateConfig } from './config-migrate.js';
import { setConfigValue, unsetConfigValue } from './config-file.js';
import { configTemplate } from './config-template.js';
import { applyModelsBlock, renderModelsBlock } from './config-models.js';
import { getExecutor } from './executors/index.js';
import { commandsStatus, commandsTargetDir, installCommands, legacyCommandsStatus, removeCommands, removeLegacyCommands } from './claude-commands.js';
import { canonicalSetting, parseSettingValue } from './settings.js';
import { CATALOG, executorsDir, getCatalogEntry, installExecutor, isInstalled } from './executors/catalog.js';
import { commitAll, commitPaths, isClean, isIgnored, repoRoot } from './git.js';
import { applyBlockToFile, blockStatus, GLOBAL_BLOCK, globalInstructionsPath, initExplanation, PROJECT_BLOCK, removeBlockFromFile, setupExplanation } from './instructions.js';
import { applyReview, DECISIONS, recheck, startRun } from './orchestrator.js';
import { confirm } from './prompt.js';
import { prepareRepository, scanFolder } from './prepare.js';
import { formatEvent, supportsLinks, useColor } from './events.js';
import { SELF_REVIEW_MODES } from './policy.js';
import { runProcess } from './proc.js';
import { latestRunId, listRunIds, loadState, runDir } from './store.js';
import { loadTask } from './task.js';
import { VERSION } from './version.js';
import { watchRuns } from './watch.js';
import { advise, appendRecord, comparison, displayLabel, executorKey, normalizeLabel, readRecords, triageFile, validateLabel } from './triage.js';
import { canOpenBrowser } from './platform.js';
import { aggregateUsage, renderUsage } from './usage.js';
import { createOutput } from './output.js';
import { isOrphaned, lastActivityMs } from './orphans.js';
import { appendEvent } from './events.js';
import { renderReport } from './report.js';
import { pendingChanges } from './git.js';
import { PRICES_SOURCE, loadPrices, localWindows, nextChange, tariffAt } from './pricing.js';
import { collectProjectState, refreshProjectState, renderProjectState, writeProjectState } from './project-state.js';

const TRIAGE_OUTCOMES = ['over', 'ok', 'under'];

const HELP = `AgentRelay ${VERSION} — delega tareas de desarrollo a un agente ejecutor y devuelve el resultado validado.

Uso:
  agentrelay run <tarea.json | ->   Delega una tarea (JSON en archivo o por stdin)
  agentrelay show [id]              Muestra el informe de una ejecución (por defecto, la última)
  agentrelay review <id> --decision <accept|fix|escalate|reject> [--feedback <texto>]
                                    Registra la revisión del orquestador
  agentrelay check [id]             Repite las validaciones sin cambiar el estado
  agentrelay list                   Lista las ejecuciones del repositorio
  agentrelay status [--write] [--json] Resume el estado del proyecto
  agentrelay start [--yes]          Prepara el proyecto y deja todo listo para trabajar
  agentrelay recover [id]           Recupera ejecuciones interrumpidas
  agentrelay usage [--since <fecha>] [--executor <tipo>] [--json]  Resume el consumo
  agentrelay pricing [--json]      Muestra precios y tarifa DeepSeek
  agentrelay watch [id]             Sigue en directo una ejecución (sin id, sigue todas las nuevas)
  agentrelay doctor                 Comprueba el entorno (git, ejecutor, configuración)
  agentrelay config [show|path|init|migrate [--dry-run]] Muestra, localiza, crea o migra la configuración
  agentrelay login [--device]       Inicia sesión de ChatGPT con Codex
  agentrelay setup                  Instala el bloque global y los comandos de Claude Code
  agentrelay update [--check] [--yes]   Actualiza AgentRelay a la última versión
  agentrelay init                   Prepara el proyecto: instrucciones en CLAUDE.md y AGENTS.md si existe, y el repositorio git si hace falta

  agentrelay config refresh [--only <ejecutor>] [--dry-run] Actualiza la lista de modelos
  agentrelay set <clave> <valor> [--local] Cambia un ajuste (ejemplo: set effort alto)
  agentrelay unset <clave> [--local]       Restablece un ajuste
  agentrelay models                Lista los modelos del ejecutor actual

Ajustes rápidos:
  agentrelay set model gpt-5.5
  agentrelay unset effort
  agentrelay models

  agentrelay executors              Lista los ejecutores disponibles e instalados
  agentrelay executors add <nombre> Instala un ejecutor opcional
  agentrelay triage record      Guarda el resultado de una elección
  agentrelay triage advise      Recomienda modelo y esfuerzo
  agentrelay triage stats       Resume el historial de triaje

Opciones comunes:
  --cwd <dir>             Repositorio de trabajo (por defecto, el directorio actual)
  --config <archivo>      Archivo de configuración alternativo
  --json                  Salida en JSON
  -q, --quiet             Solo errores, avisos y resultados esenciales
  -v, --verbose           Añade detalles para diagnosticar problemas
  -h, --help              Muestra esta ayuda
  -V, --version           Muestra la versión

Opciones de run:
  --level <1-5>           Nivel de orquestación (1 = máximo ahorro … 5 = máxima supervisión)
  --self-review <modo>    Fuerza el modo de self-review: ${SELF_REVIEW_MODES.join(' | ')}
  --allow-dirty           Permite delegar con cambios sin confirmar

Opciones de review:
  --feedback <texto>      Problemas a corregir (obligatorio con fix)
  --feedback-file <ruta>  Lee el feedback de un archivo
  --force                 Acepta sin superar la validación final, o corrige por encima del límite

Opciones de setup:
  --uninstall             Retira el bloque y los comandos de Claude Code
  --no-commands            No instala los comandos de Claude Code
  --yes                   Aplica sin pedir confirmación
  --login                 Conecta la cuenta de ChatGPT sin preguntar
  --executors <lista>     Instala ejecutores opcionales separados por comas
  --claude-dir <dir>      Directorio .claude (por defecto, ~/.claude)

Opciones de login:
  --device                Usa el código de dispositivo
  --browser               Fuerza el inicio de sesión con navegador

Opciones de usage:
  --since <fecha>         Incluye ejecuciones desde esta fecha
  --executor <tipo>       Filtra por ejecutor

Opciones de triage:
  --type --size --kind --executor --model --effort --level --outcome --run --note --signals --include-legacy

Opciones de init:
  --yes                   Aplica sin pedir confirmación (git init, primer commit, commit de instrucciones)
  --with-config           Crea además ${CONFIG_FILE}

Opciones de config init:
  --project               Crea ${CONFIG_FILE} en el proyecto
  --local                 Alias obsoleto de --project
  --force                 Sobrescribe el archivo de configuración existente

Códigos de salida: 0 correcto · 1 error · 2 tarea escalada al orquestador.
`;

const OPTIONS = {
  cwd: { type: 'string' },
  config: { type: 'string' },
  since: { type: 'string' },
  json: { type: 'boolean' },
  level: { type: 'string' },
  'self-review': { type: 'string' },
  'allow-dirty': { type: 'boolean' },
  quiet: { type: 'boolean', short: 'q' },
  verbose: { type: 'boolean', short: 'v' },
  decision: { type: 'string' },
  feedback: { type: 'string' },
  'feedback-file': { type: 'string' },
  force: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  only: { type: 'string' },
  yes: { type: 'boolean' },
  check: { type: 'boolean' },
  uninstall: { type: 'boolean' },
  'no-commands': { type: 'boolean' },
  'claude-dir': { type: 'string' },
  'with-config': { type: 'boolean' },
  project: { type: 'boolean' },
  local: { type: 'boolean' },
  device: { type: 'boolean' },
  browser: { type: 'boolean' },
  login: { type: 'boolean' },
  executors: { type: 'string' },
  type: { type: 'string' }, size: { type: 'string' }, kind: { type: 'string' }, model: { type: 'string' }, executor: { type: 'string' },
  'include-legacy': { type: 'boolean' },
  write: { type: 'boolean' },
  effort: { type: 'string' }, outcome: { type: 'string' }, run: { type: 'string' }, note: { type: 'string' }, signals: { type: 'string' },
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

function printResult(state, root, json, values = {}) {
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
  } else if (values.quiet) {
    process.stdout.write(`${state.id}  ${state.status}\n${path.join(dir, 'report.md')}\n`);
  } else {
    const report = path.join(dir, 'report.md');
    process.stdout.write(existsSync(report) ? readFileSync(report, 'utf8') : `Estado: ${state.status}\n`);
  }
  return state.status === 'escalated' ? 2 : 0;
}

/** Crea el manejador onEvent que muestra los eventos formateados por stderr. */
function eventPrinter(values, root) {
  if (values.quiet) return undefined;
  const startedAtMs = Date.now();
  return (event) => {
    const line = formatEvent(event, startedAtMs, { color: useColor(process.stderr), ...(supportsLinks(process.stderr) ? { links: { root } } : {}) });
    if (line) process.stderr.write(`${line}\n`);
  };
}

async function cmdRun(positionals, values, runtime) {
  const source = positionals[0];
  if (!source) throw new Error('Indica la tarea: agentrelay run <tarea.json | ->');
  const task = loadTask(source === '-' ? '-' : path.resolve(source));
  if (values['self-review']) {
    if (!SELF_REVIEW_MODES.includes(values['self-review'])) throw new Error(`--self-review debe ser ${SELF_REVIEW_MODES.join(' | ')}`);
    task.selfReview = values['self-review'];
  }
  const root = await resolveRoot(values);
  const overrides = values.level ? { level: values.level } : undefined;
  const { config, warnings = [] } = loadConfig({ cwd: root, configPath: values.config, overrides });
  for (const warning of warnings) process.stderr.write(`[aviso] ${warning}\n`);
  showDeepSeekNotice(config.executor.model, values, runtime);
  const onEvent = eventPrinter(values, root);
  const state = await startRun({ root, task, config, allowDirty: values['allow-dirty'], onEvent });
  if (values.verbose) printAttemptDetails(state, root, config);
  if (values.verbose) {
    const { sources } = loadConfig({ cwd: root, configPath: values.config });
    process.stdout.write(`Archivos de configuración leídos: ${sources.length ? sources.join(', ') : 'ninguno'}\n`);
  }
  return printResult(state, root, values.json, values);
}

async function cmdShow(positionals, values) {
  const root = await resolveRoot(values);
  const state = loadState(root, resolveRunId(root, positionals[0]));
  return printResult(state, root, values.json, values);
}

async function cmdReview(positionals, values, runtime) {
  const root = await resolveRoot(values);
  if (!positionals[0]) throw new Error('Indica el id de la ejecución: agentrelay review <id> --decision ...');
  if (!values.decision) throw new Error(`Indica --decision ${DECISIONS.join(' | ')}`);
  let feedback = values.feedback || '';
  if (values['feedback-file']) feedback = readFileSync(path.resolve(values['feedback-file']), 'utf8');
  const onEvent = eventPrinter(values, root);
  if (values.decision === 'fix') {
    const before = loadState(root, positionals[0]);
    const canAttempt = before.status !== 'running' && !['accepted', 'rejected', 'escalated'].includes(before.status)
      && (values.force || before.retriesUsed < before.policy.maxRetries) && Boolean(feedback.trim());
    const model = before.config?.executor?.model || before.attempts?.at(-1)?.model?.id;
    if (canAttempt) showDeepSeekNotice(model, values, runtime);
  }
  const state = await applyReview({
    root, id: positionals[0], decision: values.decision, feedback, force: values.force, onEvent,
  });
  if (values.verbose) {
    const { config, sources } = loadConfig({ cwd: root, configPath: values.config });
    printAttemptDetails(state, root, config);
    process.stdout.write(`Archivos de configuración leídos: ${sources.length ? sources.join(', ') : 'ninguno'}\n`);
  }
  return printResult(state, root, values.json, values);
}

async function cmdCheck(positionals, values) {
  const root = await resolveRoot(values);
  const onEvent = eventPrinter(values);
  const { state, check } = await recheck({ root, id: resolveRunId(root, positionals[0]), onEvent });
  if (values.quiet) {
    process.stdout.write(`${state.id}  ${state.status}\n${path.join(runDir(root, state.id), 'report.md')}\n`);
    return check.passed ? 0 : 1;
  }
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
    const orphaned = isOrphaned(s, { lastEventMs: lastActivityMs(root, id) });
    return { id, status: orphaned ? 'running (¿interrumpida?)' : s.status, level: s.policy.level, attempts: s.attempts.length, title: s.task.title };
  });
  if (values.json) process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
  else if (!runs.length) process.stdout.write('No hay ejecuciones.\n');
  else for (const r of runs) process.stdout.write(`${r.id}  ${r.status.padEnd(16)} nivel ${r.level}  intentos ${r.attempts}  ${r.title}\n`);
  return 0;
}

async function cmdStatus(values) {
  const root = await resolveRoot(values);
  const state = await collectProjectState(root);
  if (values.write) await writeProjectState(root);
  process.stdout.write(values.json ? `${JSON.stringify(state, null, 2)}\n` : renderProjectState(state));
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
      ...(supportsLinks(process.stdout) ? { links: { root } } : {}),
      signal: controller.signal,
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
  return 0;
}

async function cmdRecover(positionals, values) {
  const root = await resolveRoot(values);
  const isOrphan = (id) => isOrphaned(loadState(root, id), { lastEventMs: lastActivityMs(root, id) });
  if (!positionals[0]) {
    const ids = listRunIds(root).filter(isOrphan);
    if (!ids.length) process.stdout.write('Ninguna ejecución interrumpida.\n');
    else for (const id of ids) { const state = loadState(root, id); process.stdout.write(`${id}  ${state.createdAt || '-'}  ${state.task?.title || '-'}\n`); }
    return 0;
  }
  const id = positionals[0];
  const state = loadState(root, id);
  if (!isOrphan(id)) {
    process.stderr.write(state.status === 'running' ? `La ejecución ${id} sigue en curso (proceso ${state.pid ?? 'desconocido'}).\n` : `La ejecución ${id} no está en curso.\n`);
    return 1;
  }
  state.status = 'interrupted';
  state.statusReasons = ['el proceso que la ejecutaba terminó sin cerrarla'];
  const attempt = state.attempts?.at(-1);
  if (attempt && attempt.startedAt && attempt.durationMs == null) { attempt.ok = false; attempt.error = 'interrumpido'; }
  const dir = runDir(root, id);
  writeFileSync(path.join(dir, 'state.json'), `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  appendEvent(root, id, { type: 'status', status: 'interrupted', runId: id, reasons: state.statusReasons });
  let patch = ''; try { patch = readFileSync(path.join(dir, 'diff.patch'), 'utf8'); } catch {}
  writeFileSync(path.join(dir, 'report.md'), renderReport(state, patch, state.config?.report));
  const changes = await pendingChanges(root);
  const paths = changes.slice(0, 10).map((line) => line.slice(3));
  const count = `${changes.length} archivo(s) modificado(s)`;
  process.stdout.write(`El ejecutor dejó en el repositorio: ${count}${paths.length ? `\n${paths.join('\n')}` : ''}\n\nSiguientes pasos:\nagentrelay check ${id}\nagentrelay review ${id} --decision fix --feedback "..."\nagentrelay review ${id} --decision reject\n`);
  return 0;
}

async function cmdDoctor(values) {
  let ok = true;
  const line = (good, text) => {
    if (!good) ok = false;
    if (good && values.quiet) return;
    process.stdout.write(`${good ? '[ok]   ' : '[fallo]'} ${text}\n`);
  };
  const warn = (text) => (values.quiet ? process.stderr : process.stdout).write(`[aviso] ${text}\n`);
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
    for (const warning of loaded.warnings) warn(warning);
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
      if (values.verbose) process.stdout.write(`        ${adapter.commandParts(executor.command).join(' ')}\n`);
      if (adapter.authStatus) {
        const auth = await adapter.authStatus(executor);
        line(auth.ok, auth.ok ? `Sesión: ${auth.message}` : auth.message);
      }
    } catch (error) {
      const hint = adapter?.installHint || 'Ejecuta "npm install" en la carpeta de AgentRelay.';
      line(false, `Ejecutor ${executor.type} no disponible (${error.message})${error.message.includes(hint) ? '' : `. ${hint}`}`);
    }
  }

  if (values.verbose && config) {
    const loaded = loadConfig({ cwd: root || path.resolve(values.cwd || process.cwd()), configPath: values.config });
    process.stdout.write(`Archivos de configuración: ${loaded.sources.length ? loaded.sources.join(', ') : 'ninguno'}\n`);
  }

  // Instrucciones del orquestador: tras actualizar AgentRelay pueden haber cambiado.
  const globalStatus = blockStatus(globalInstructionsPath(values['claude-dir']), GLOBAL_BLOCK);
  if (globalStatus === 'current') line(true, 'Instrucciones globales del orquestador: al día');
  else if (globalStatus === 'outdated') warn('Las instrucciones globales del orquestador están desactualizadas. Ejecuta "agentrelay setup".');
  else warn('Las instrucciones globales del orquestador no están instaladas. Ejecuta "agentrelay setup".');
  const commandStatus = commandsStatus(values['claude-dir']);
  const legacyCommands = legacyCommandsStatus(values['claude-dir']);
  if (legacyCommands.length) warn('Quedan comandos antiguos /agentrelay:â€¦ de una versión anterior. Ejecuta "agentrelay setup" para sustituirlos por /ar:â€¦.');
  if (commandStatus.details.every(({ state }) => state === 'foreign')) {
    process.stdout.write('[ok]   Los comandos de Claude Code existentes son tuyos; se conservan.\n');
  } else if (commandStatus.status === 'current') line(true, 'Comandos de Claude Code (/ar:…): al día');
  else if (commandStatus.status === 'outdated') warn('Los comandos de Claude Code (/ar:…) están desactualizados. Ejecuta "agentrelay setup".');
  else warn('Los comandos de Claude Code (/ar:…) no están instalados. Ejecuta "agentrelay setup".');
  if (root) {
    const interrupted = listRunIds(root).filter((id) => { const state = loadState(root, id); return state.status === 'interrupted' || isOrphaned(state, { lastEventMs: lastActivityMs(root, id) }); });
    if (interrupted.length) warn(`Hay ${interrupted.length} ejecución(es) interrumpida(s): ${interrupted.join(', ')}. Ejecuta "agentrelay recover".`);
    const projectStatus = projectInstructionStatus(root);
    if (projectStatus === 'current') line(true, 'Instrucciones de AgentRelay en este proyecto: al día');
    else if (projectStatus === 'outdated') warn('Las instrucciones de AgentRelay de este proyecto están desactualizadas. Ejecuta "agentrelay init".');
    else warn('Este proyecto no tiene las instrucciones de AgentRelay. Ejecuta "agentrelay init".');
  }
  return ok ? 0 : 1;
}

function configHome() { return agentrelayHome(); }

function configLeaves(value, prefix = '', result = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) configLeaves(child, prefix ? `${prefix}.${key}` : key, result);
  } else result[prefix] = value;
  return result;
}

async function cmdConfigRefresh(values, cwd, userFile) {
  const loaded = loadConfig({ cwd, configPath: values.config });
  const only = values.only;
  if (only && !Object.hasOwn(EXECUTOR_DEFAULTS, only)) throw new Error(`Ejecutor no soportado: ${only}`);
  const types = only ? [only] : Object.keys(EXECUTOR_DEFAULTS);
  const entries = await Promise.allSettled(types.map(async (type) => {
    const executor = { ...EXECUTOR_DEFAULTS[type], ...(type === loaded.config.executor.type ? loaded.config.executor : {}) };
    const adapter = getExecutor(type);
    if (!adapter.listModels) return { executor: type, title: CATALOG.find((item) => item.name === type)?.title || type, current: type === loaded.config.executor.type, models: [] };
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tiempo máximo de 20 s superado')), 20_000); });
    let models;
    try { models = await Promise.race([adapter.listModels(executor), timeout]); }
    finally { clearTimeout(timer); }
    return { executor: type, title: CATALOG.find((item) => item.name === type)?.title || type, current: type === loaded.config.executor.type, models: models || [] };
  }));
  const records = entries.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { executor: types[index], title: CATALOG.find((item) => item.name === types[index])?.title || types[index], current: types[index] === loaded.config.executor.type, models: [], error: result.reason?.message || String(result.reason) });
  let text = existsSync(userFile) ? readFileSync(userFile, 'utf8') : configTemplate({ scope: 'user' });
  const block = renderModelsBlock(records);
  text = applyModelsBlock(text, block);
  parseJsonc(text, userFile);
  if (values['dry-run']) process.stdout.write(`${block}\n`);
  else {
    mkdirSync(path.dirname(userFile), { recursive: true });
    writeFileSync(userFile, text, 'utf8');
  }
  for (const entry of records) process.stdout.write(`${entry.executor}: ${entry.error ? `no se pudo leer: ${entry.error}` : `${entry.models.length} modelos`}\n`);
  process.stdout.write(`Archivo: ${userFile}\n`);
  return 0;
}

async function cmdConfig(positionals, values, migrationResult) {
  const action = positionals[0] || 'show';
  const requestedCwd = path.resolve(values.cwd || process.cwd());
  let root;
  try { root = await repoRoot(requestedCwd); } catch {}
  const cwd = root || requestedCwd;
  const userFile = path.join(configHome(), 'config.json');
  const projectFile = path.join(cwd, CONFIG_FILE);
  if (action === 'refresh' && positionals.length === 1) return cmdConfigRefresh(values, cwd, userFile);
  if (action === 'migrate' && positionals.length === 1) {
    let result = migrationResult;
    if (!result) {
      try {
        result = migrateConfig({ home: agentrelayHome(), cwd, dryRun: values['dry-run'] });
      } catch (error) {
        process.stderr.write(`[aviso] No se pudo migrar la configuración: ${error.message}\n`);
        return 0;
      }
      for (const { from, error } of result.errors) process.stderr.write(`[aviso] No se pudo migrar ${from}: ${error}\n`);
    }
    if (result.failure || (result.errors.length && !result.actions.length)) return 0;
    if (!result.actions.length) {
      process.stdout.write('Nada que migrar\n');
      return 0;
    }
    for (const { from, into, backup } of result.actions) {
      process.stdout.write(`${values['dry-run'] ? 'Se migraría' : 'Migrado'} ${from} → ${into} (copia: ${backup})\n`);
    }
    return 0;
  }
  if (action === 'path' && positionals.length === 1) {
    for (const [label, file] of [['Usuario', userFile], ['Proyecto', projectFile]]) process.stdout.write(`${label}: ${file} (${existsSync(file) ? 'existe' : 'no existe'})\n`);
    return 0;
  }
  if (action === 'init' && positionals.length === 1) {
    const target = values.local || values.project ? projectFile : userFile;
    if (existsSync(target) && !values.force) {
      process.stdout.write(`${target} ya existe\n`);
      return 1;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, configTemplate({ scope: values.project || values.local ? 'project' : 'user' }), 'utf8');
    process.stdout.write(`Creado ${target}\n`);
    if (!values.project && !values.local) {
      try { await cmdConfigRefresh(values, cwd, target); }
      catch (error) { process.stderr.write(`[aviso] No se pudo añadir el bloque de modelos: ${error.message}\n`); }
    }
    if (!values.quiet) process.stdout.write('Descomenta las opciones para cambiar sus valores.\n');
    return 0;
  }
  if ((action !== 'show' || positionals.length > 1) && positionals.length) {
    process.stderr.write('Uso: agentrelay config [show|path|init [--project|--local (obsoleto)] [--force]|migrate [--dry-run]]\n');
    return 1;
  }
  const loaded = loadConfig({ cwd, configPath: values.config });
  const sections = new Map();
  for (const [key, value] of Object.entries(configLeaves(loaded.config))) {
    const section = key.split('.')[0];
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(`${key} = ${JSON.stringify(value)}   (${loaded.origins[key] || 'defecto'})`);
  }
  for (const [section, rows] of sections) process.stdout.write(`${section}\n${rows.join('\n')}\n`);
  process.stdout.write(loaded.sources.length ? `Archivos leídos:\n${loaded.sources.map((file) => `  ${file}`).join('\n')}\n` : 'Archivos leídos: ninguno: se usan los valores por defecto\n');
  for (const warning of loaded.warnings) process.stdout.write(`[aviso] ${warning}\n`);
  return 0;
}

function printAttemptDetails(state, root, config) {
  const adapter = getExecutor(config.executor.type);
  const command = adapter.commandParts(config.executor.command)[0] || String(config.executor.command);
  const dir = runDir(root, state.id);
  process.stdout.write(`Ejecutor: ${command}\n`);
  for (const attempt of state.attempts) {
    const base = `attempt-${attempt.n}-${attempt.kind}`;
    process.stdout.write(`Archivos del intento ${attempt.n}: ${path.join(dir, `${base}.prompt.md`)} · ${path.join(dir, `${base}.ndjson`)} · ${path.join(dir, `${base}.stderr.log`)} · ${path.join(dir, 'report.md')}\n`);
  }
}

async function cmdUsage(values) {
  const root = await resolveRoot(values);
  const result = aggregateUsage(root, { since: values.since, executor: values.executor });
  if (values.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(renderUsage(result));
  return 0;
}

export function showDeepSeekNotice(model, values, runtime = {}) {
  const prices = loadPrices();
  if (!prices[model] || prices[model].schedule !== 'deepseek') return;
  const now = runtime.clock ? runtime.clock() : new Date();
  const zone = runtime.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const period = tariffAt(now).period;
  const until = new Intl.DateTimeFormat('es-ES', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(nextChange(now));
  const label = period === 'peak' ? 'punta' : 'valle (precio al 50 %)';
  (runtime.output || createOutput({ quiet: values.quiet, verbose: values.verbose })).info(`Tarifa DeepSeek ahora: ${label} hasta las ${until} (hora local); punta de ${localWindows(now, zone)} en días laborables; no se tienen en cuenta los festivos chinos.`);
}

async function cmdPricing(values, runtime = {}) {
  const prices = loadPrices();
  const now = runtime.clock ? runtime.clock() : new Date(), zone = runtime.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const period = tariffAt(now).period;
  const file = path.join(agentrelayHome(), 'pricing.json');
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ prices, current: { period, changesAt: nextChange(now).toISOString(), localChangesAt: describeTariffChange(now, nextChange(now), zone), windows: localWindows(now, zone), timeZone: zone }, source: PRICES_SOURCE, overrideFile: file, overrideExists: existsSync(file), note: 'No se tienen en cuenta los festivos chinos. Codex y otros modelos no están en la tabla.' }, null, 2)}\n`);
    return 0;
  }
  const rows = Object.entries(prices).map(([id, p]) => [id, `${priceCell(p.input_hit.offpeak, 3)} / ${priceCell(p.input_hit.peak, 3)}`, `${priceCell(p.input_miss.offpeak, 2)} / ${priceCell(p.input_miss.peak, 2)}`, `${priceCell(p.output.offpeak, 2)} / ${priceCell(p.output.peak, 2)}`]);
  const headings = ['Modelo', 'Entrada caché (valle / punta)', 'Entrada sin caché (valle / punta)', 'Salida (valle / punta)'];
  const widths = headings.map((heading, i) => Math.max(heading.length, ...rows.map((row) => row[i].length)));
  process.stdout.write('USD por millón de tokens\n');
  process.stdout.write([headings, ...rows].map((row) => row.map((cell, i) => i ? cell.padStart(widths[i]) : cell.padEnd(widths[i])).join('  ').trimEnd()).join('\n') + '\n');
  process.stdout.write(`Tarifa ahora: ${period === 'peak' ? 'punta' : 'valle (50 % de descuento)'}; cambia ${describeTariffChange(now, nextChange(now), zone)}.\n`);
  process.stdout.write(`Punta en días laborables: ${localWindows(now, zone)} (${zone}).\nFuente: ${PRICES_SOURCE.url} (consultado ${PRICES_SOURCE.checkedAt}).\nArchivo de precios opcional: ${file} (${existsSync(file) ? 'existe' : 'no existe'}).\nNo se tienen en cuenta los festivos chinos. Codex y otros modelos no están en la tabla.\n`);
  return 0;
}

function priceCell(value, digits) { return value.toFixed(digits).replace('.', ','); }
function localDateKey(date, zone) {
  const parts = new Intl.DateTimeFormat('es-ES', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
}
function describeTariffChange(now, change, zone) {
  const clock = new Intl.DateTimeFormat('es-ES', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(change);
  const today = localDateKey(now, zone), target = localDateKey(change, zone);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (target === today) return `hoy a las ${clock}`;
  if (target === tomorrow) return `mañana a las ${clock}`;
  const date = new Intl.DateTimeFormat('es-ES', { timeZone: zone, day: 'numeric', month: 'long' }).format(change);
  return `el ${date} a las ${clock} (hora local)`;
}

const EFFORT_ES = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo', max: 'máximo', none: 'ninguno' };

function effectiveDescription(loaded, key) {
  const parts = key.split('.');
  const value = parts.length === 1 ? loaded.config[parts[0]] : loaded.config[parts[0]][parts[1]];
  return `${JSON.stringify(value)} (${loaded.origins[key] || 'defecto'})`;
}

function inlineComment(line) {
  let quoted = false, escaped = false;
  for (let i = 0; i < line.length - 1; i++) {
    const char = line[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '/' && line[i + 1] === '/') return line.slice(i).trimEnd();
  }
  return '';
}

function preserveInlineComment(previousText, nextText, dottedKey) {
  const leaf = dottedKey.split('.').at(-1);
  const property = new RegExp(`^[\\t ]*"${leaf}"\\s*:`);
  const oldLine = previousText.split(/\r?\n/).find(line => property.test(line));
  const comment = oldLine && inlineComment(oldLine);
  if (!comment) return nextText;
  const lines = nextText.split(/\r?\n/);
  const index = lines.findIndex(line => property.test(line));
  if (index !== -1 && !inlineComment(lines[index])) lines[index] = `${lines[index]} ${comment}`;
  return lines.join(nextText.includes('\r\n') ? '\r\n' : '\n');
}

async function applySetting(key, parsed, values) {
  const project = Boolean(values.project || values.local);
  const cwd = project ? await resolveRoot(values) : path.resolve(values.cwd || process.cwd());
  const home = agentrelayHome();
  const file = project ? path.join(cwd, CONFIG_FILE) : path.join(home, 'config.json');
  const hadFile = existsSync(file);
  const previousText = hadFile ? readFileSync(file, 'utf8') : configTemplate({ scope: project ? 'project' : 'user' });
  let priorConfig;
  try { priorConfig = loadConfig({ cwd, configPath: values.config, home }).config; } catch { priorConfig = null; }
  const changedExecutor = key === 'executor.type' && priorConfig && priorConfig.executor.type !== parsed.value;
  let nextText = parsed.unset ? unsetConfigValue(previousText, key) : setConfigValue(previousText, key, parsed.value);
  nextText = preserveInlineComment(previousText, nextText, key);
  if (changedExecutor) for (const extra of ['executor.model', 'executor.provider', 'executor.command']) {
    const changedText = unsetConfigValue(nextText, extra);
    nextText = preserveInlineComment(nextText, changedText, extra);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, nextText, 'utf8');
  let loaded;
  try { parseJsonc(nextText); loaded = loadConfig({ cwd, configPath: values.config, home }); }
  catch (error) { if (hadFile) writeFileSync(file, previousText, 'utf8'); else rmSync(file, { force: true }); throw error; }
  const shown = parsed.unset ? effectiveDescription(loaded, key) : JSON.stringify(parsed.value);
  const suffix = project ? ` (solo en este proyecto: ${CONFIG_FILE})` : '';
  process.stdout.write(`✔ ${key} = ${shown}${suffix}\n`);
  if (changedExecutor) process.stdout.write('Se eliminaron model, provider y command guardados para el ejecutor anterior.\n');
  if (!parsed.unset && loaded.origins[key] !== file) {
    const origin = loaded.origins[key];
    const label = origin && path.basename(origin) === CONFIG_FILE ? `${CONFIG_FILE} del proyecto` : origin && path.basename(origin) === 'config.json' ? 'config.json del usuario' : null;
    if (label) process.stdout.write(`Ojo: ${label} lo sustituye por ${effectiveDescription(loaded, key)}\n`);
  }
  if (!parsed.unset && key === 'executor.thinking') {
    const adapter = getExecutor(loaded.config.executor.type);
    const models = await adapter.listModels?.(loaded.config.executor) || [];
    const model = models.find((item) => item.id === loaded.config.executor.model);
    if (model?.efforts && !model.efforts.includes(parsed.value)) process.stdout.write(`Aviso: ${model.id} admite: ${model.efforts.map((effort) => EFFORT_ES[effort] || effort).join(', ')}\n`);
  }
  if (!parsed.unset && key === 'executor.model') {
    const adapter = getExecutor(loaded.config.executor.type);
    const models = await adapter.listModels?.(loaded.config.executor) || [];
    if (models.length && !models.some((item) => item.id === parsed.value)) process.stdout.write(`Aviso: ${parsed.value} no está en la lista de modelos de la cuenta (puede ser nuevo o no estar disponible).\n`);
  }
  return 0;
}

async function cmdSet(positionals, values) {
  if (positionals.length !== 2) throw new Error('Uso: agentrelay set <clave> <valor>');
  const [alias, raw] = positionals;
  const key = canonicalSetting(alias);
  if (!key) throw new Error(`Opción no ajustable: ${alias}`);
  return applySetting(key, parseSettingValue(key, raw), values);
}

async function cmdUnset(positionals, values) {
  if (positionals.length !== 1) throw new Error('Uso: agentrelay unset <clave>');
  const key = canonicalSetting(positionals[0]);
  if (!key) throw new Error(`Opción no ajustable: ${positionals[0]}`);
  return applySetting(key, { unset: true }, values);
}

async function cmdModels(values) {
  const loaded = loadConfig({ cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config });
  const executor = loaded.config.executor;
  const adapter = getExecutor(executor.type);
  const models = await adapter.listModels?.(executor) || [];
  if (!models.length) {
    process.stdout.write('Este ejecutor no ofrece lista de modelos. Indica uno con: agentrelay set model <id>\n');
    return 0;
  }
  for (const model of models) {
    const efforts = model.efforts ? model.efforts.map((effort) => `${EFFORT_ES[effort] || effort}${effort === model.defaultEffort ? '*' : ''}`).join(' ') : '—';
    process.stdout.write(`${model.id === executor.model ? '●' : ' '} ${model.id}  ${efforts}\n`);
  }
  process.stdout.write(`Esfuerzo actual: ${executor.thinking ? (EFFORT_ES[executor.thinking] || executor.thinking) : 'por defecto'}\n`);
  process.stdout.write('Cambia el modelo con: agentrelay set model <id>\nCambia el esfuerzo con: agentrelay set effort <bajo|medio|alto|extremo|máximo>\n');
  return 0;
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

function requiredTriage(values, field) {
  if (values[field] === undefined) throw new Error(`Indica --${field}.`);
  return validateLabel(field, values[field]);
}

async function cmdTriage(positionals, values) {
  const action = positionals[0];
  const file = triageFile();
  const records = readRecords(file);
  const kind = values.kind === undefined ? 'orchestrator' : validateLabel('kind', values.kind);
  if (action === 'record') {
    const record = { kind, type: null, size: null, effort: null, outcome: null, signals: [] };
    let config;
    const currentConfig = () => config ||= loadConfig({ cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config }).config;
    let runState;
    if (values.run && kind === 'executor') {
      const root = await resolveRoot(values);
      runState = loadState(root, values.run);
      record.executor = runState.config?.executor?.type;
      record.model = runState.attempts?.[0]?.model?.id;
      const task = runState.task || {};
      record.type = ({ feature: 'implementation', refactor: 'implementation', fix: 'debugging', docs: 'docs', test: 'implementation' })[task.type] || 'implementation';
      record.size = ({ trivial: 'small', normal: 'normal', complex: 'large' })[task.complexity] || 'normal';
      record.effort = normalizeLabel('effort', runState.config?.executor?.thinking || 'medium');
      if (!['low', 'medium', 'high', 'xhigh'].includes(record.effort)) record.effort = 'medium';
      record.level = Number(runState.policy?.level) || 3;
      const attempts = runState.attempts || [];
      record.signals.push(`intentos:${attempts.length}`, `reintentos:${runState.retriesUsed || 0}`);
      const escalated = runState.status === 'escalated';
      if (escalated) record.signals.push('escalado');
      if (attempts.some((a) => a.kind === 'fix' || a.check?.passed === false || a.validationPassed === false)
        || runState.lastCheck?.validations?.some((v) => !v.passed)) record.signals.push('validación-fallida');
      record.outcome = runState.status === 'accepted' && attempts.length === 1 && !runState.retriesUsed && !escalated ? 'ok' : 'under';
    }
    if (kind === 'executor') {
      record.executor = values.executor ?? record.executor ?? currentConfig().executor.type;
      record.model = values.model ?? record.model ?? currentConfig().executor.model ?? 'default';
      record.executor = String(record.executor).trim();
      record.model = String(record.model).trim();
      if (!record.executor || !record.model) throw new Error('El registro del ejecutor requiere --executor y --model o una configuraciÃ³n actual.');
    }
    if (values.type !== undefined) record.type = validateLabel('type', values.type);
    if (values.size !== undefined) record.size = validateLabel('size', values.size);
    if (values.effort !== undefined) record.effort = validateLabel('effort', values.effort);
    if (values.outcome !== undefined) record.outcome = validateLabel('outcome', values.outcome);
    if (values.signals !== undefined) record.signals = values.signals.split(',').map((x) => x.trim().slice(0, 60)).filter(Boolean);
    record.type ||= requiredTriage(values, 'type');
    record.size ||= requiredTriage(values, 'size');
    record.outcome ||= requiredTriage(values, 'outcome');
    if (kind === 'orchestrator') {
      record.model = requiredTriage(values, 'model');
      record.effort = record.effort || requiredTriage(values, 'effort');
    } else {
      if (values.level !== undefined) {
        if (!/^[1-5]$/.test(values.level)) throw new Error('--level debe ser un entero entre 1 y 5.');
        record.level = Number(values.level);
      }
      record.level ||= Number(config?.level) || 3;
      record.effort ||= requiredTriage(values, 'effort');
    }
    if (values.run) record.run = values.run;
    if (values.note !== undefined) record.note = String(values.note).slice(0, 200);
    const saved = appendRecord(record, file);
    const choice = kind === 'orchestrator' ? `${saved.model} · esfuerzo ${displayLabel('effort', saved.effort)}` : `${saved.executor} · ${saved.model} · nivel ${saved.level}/esfuerzo ${displayLabel('effort', saved.effort)}`;
    process.stdout.write(`Anotado: ${kind === 'orchestrator' ? 'orquestador' : 'ejecutor'} · ${displayLabel('type', saved.type)} · ${displayLabel('size', saved.size)} · ${choice} · ${displayLabel('outcome', saved.outcome)}\n`);
    return 0;
  }
  if (action === 'advise') {
    const type = requiredTriage(values, 'type'), size = requiredTriage(values, 'size');
    let config;
    const currentConfig = () => config ||= loadConfig({ cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config }).config;
    const executor = kind === 'executor' ? String(values.executor ?? currentConfig().executor.type).trim() : undefined;
    const model = kind === 'executor' ? String(values.model ?? currentConfig().executor.model ?? 'default').trim() : undefined;
    const result = advise(records, { kind, type, size, executor, model, includeLegacy: values['include-legacy'] });
    const compare = kind === 'orchestrator' && values.model !== undefined && values.effort !== undefined
      ? comparison(result, validateLabel('model', values.model), validateLabel('effort', values.effort)) : null;
    const output = { ...result, ...(kind === 'executor' ? { executor, model } : {}), comparison: compare };
    if (values.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else {
      const effortEs = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo' };
      if (kind === 'orchestrator') process.stdout.write(`Recomendación (orquestador): ${result.step.model} · esfuerzo ${effortEs[result.step.effort]}\n`);
      else process.stdout.write(`Ejecutor: ${executor} · ${model}\nRecomendación (ejecutor): esfuerzo ${effortEs[result.step.effort]} · nivel ${result.step.level}\n`);
      process.stdout.write(`Motivo: ${result.reason}\nMuestras: ${result.samples} · confianza ${result.confidence}\n`);
      if (compare) {
        const current = `${values.model} · ${effortEs[normalizeLabel('effort', values.effort)]}`;
        const recommended = `${result.step.model} · ${effortEs[result.step.effort]}`;
        process.stdout.write(compare === 'keep' ? `Modelo actual: ${current} · el modelo actual es adecuado\n` : `Modelo actual: ${current} → conviene ${compare === 'down' ? 'bajar' : 'subir'} a ${recommended}\n`);
      }
    }
    return 0;
  }
  if (action === 'stats') {
    const selected = values.kind === undefined ? records : records.filter((r) => r.kind === kind);
    if (values.json) {
      const groups = new Map();
      for (const r of selected) {
        const key = JSON.stringify([r.kind, r.kind === 'executor' ? (r.executor && r.model ? executorKey(r.executor, r.model) : '') : '', r.type, r.size]);
        groups.set(key, [...(groups.get(key) || []), r]);
      }
      const rows = [...groups].map(([key, group]) => {
        const [groupKind, pair, type, size] = JSON.parse(key);
        const [groupExecutor, groupModel] = pair ? pair.split('|') : ['', ''];
        const counts = Object.fromEntries(['over', 'ok', 'under'].map((o) => [o, group.filter((r) => r.outcome === o).length]));
        const steps = new Map();
        for (const r of group) { const step = groupKind === 'orchestrator' ? `${r.model}-${r.effort}` : `${r.effort}/n${r.level}`; steps.set(step, (steps.get(step) || 0) + 1); }
        const mostUsedStep = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        const rec = advise(records, { kind: groupKind, type, size, executor: groupExecutor, model: groupModel }).step;
        return { kind: groupKind, ...(groupKind === 'executor' ? (groupExecutor && groupModel ? { executor: groupExecutor, model: groupModel } : { executor: 'sin ejecutor (antiguo)' }) : {}), type, size, records: group.length, counts, mostUsedStep, recommendation: groupKind === 'orchestrator' ? `${rec.model}-${rec.effort}` : `${rec.effort}/n${rec.level}` };
      });
      process.stdout.write(`${JSON.stringify({ file, total: selected.length, groups: rows }, null, 2)}\n`);
    }
    else if (!selected.length) process.stdout.write(`Sin datos todavía\nArchivo: ${file}\nTotal: 0\n`);
    else {
      process.stdout.write(`Clase / ejecutor y modelo   Tipo             Tamaño     Registros  Sobró/Bien/Corto  Paso más usado  Recomendación\n`);
      const groups = new Map();
      for (const r of selected) {
        const key = JSON.stringify([r.kind, r.kind === 'executor' ? (r.executor && r.model ? executorKey(r.executor, r.model) : '') : '', r.type, r.size]);
        groups.set(key, [...(groups.get(key) || []), r]);
      }
      for (const [key, group] of groups) {
        const [groupKind, pair, type, size] = JSON.parse(key);
        const [groupExecutor, groupModel] = pair ? pair.split('|') : ['', ''];
        const counts = TRIAGE_OUTCOMES.map((o) => group.filter((r) => r.outcome === o).length);
        const steps = new Map(); for (const r of group) { const s = groupKind === 'orchestrator' ? `${r.model}-${r.effort}` : `${r.effort}/n${r.level}`; steps.set(s, (steps.get(s) || 0) + 1); }
        const popular = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        const rec = advise(records, { kind: groupKind, type, size, executor: groupExecutor, model: groupModel }).step;
        const recommendation = groupKind === 'orchestrator' ? `${rec.model}-${displayLabel('effort', rec.effort)}` : `${displayLabel('effort', rec.effort)}/n${rec.level}`;
        const popularDisplay = groupKind === 'orchestrator'
          ? popular.replace(/-(low|medium|high|xhigh)$/, (_, e) => `-${displayLabel('effort', e)}`)
          : popular.replace(/^(low|medium|high|xhigh)/, (e) => displayLabel('effort', e));
        const executorLabel = groupKind === 'executor' ? (groupExecutor && groupModel ? `${groupExecutor} · ${groupModel}` : 'sin ejecutor (antiguo)') : 'orquestador';
        process.stdout.write(`${executorLabel.padEnd(28)} ${displayLabel('type', type).padEnd(15)} ${displayLabel('size', size).padEnd(10)} ${String(group.length).padEnd(10)} ${counts.join('/').padEnd(17)} ${popularDisplay.padEnd(15)} ${recommendation}\n`);
      }
      process.stdout.write(`Archivo: ${file}\nTotal: ${selected.length}\n`);
    }
    return 0;
  }
  throw new Error('Uso: agentrelay triage record|advise|stats');
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
  process.stdout.write(`Para usarlo: ejecuta "agentrelay set --local executor ${name}" o edita agentrelay.config.json\n`);
  return 0;
}

async function signIn(adapter, executor, { device = false, browser = false, showAccountHint = true } = {}) {
  const browserStatus = canOpenBrowser();
  const useDevice = device || (!browser && !browserStatus.ok);
  if (showAccountHint && adapter.accountHint) process.stdout.write(`${adapter.accountHint}\n`);
  if (!device && !browser && !browserStatus.ok && showAccountHint) {
    process.stdout.write(`No se puede abrir un navegador en este equipo (${browserStatus.reason}): se usará el código de dispositivo.\n`);
  }
  if (showAccountHint) process.stdout.write(useDevice
    ? 'Se mostrará un código para iniciar sesión con tu cuenta de ChatGPT.\n'
    : 'Se abrirá el navegador para iniciar sesión con tu cuenta de ChatGPT…\n');
  await adapter.login(executor, { device: useDevice });
  const result = adapter.authStatus ? await adapter.authStatus(executor) : { ok: true };
  if (result.ok) {
    process.stdout.write('✔ Sesión iniciada\n');
    return 0;
  }
  process.stderr.write(`No se pudo iniciar sesión: ${result.message} Prueba "agentrelay login --device".\n`);
  if (showAccountHint && adapter.accountHint && !result.message?.includes(adapter.accountHint)) process.stderr.write(`${adapter.accountHint}\n`);
  return 1;
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
  return signIn(adapter, executor, { device: values.device, browser: values.browser, showAccountHint: !values.quiet });
}

async function cmdSetup(values) {
  const file = globalInstructionsPath(values['claude-dir']);
  const removing = Boolean(values.uninstall);
  if (!values.quiet) for (const line of setupExplanation(file, removing)) process.stdout.write(`${line}\n`);

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
    const commands = removeCommands(values['claude-dir']);
    const legacy = removeLegacyCommands(values['claude-dir']);
    process.stdout.write(`Comandos de Claude Code eliminados: ${commands.removed.length + legacy.removed.length ? [...commands.removed, ...legacy.removed].join(', ') : 'ninguno'}\n`);
    if (commands.kept.length) process.stdout.write(`Conservados (archivo tuyo): ${commands.kept.join(', ')}\n`);
    process.stdout.write(`${action === 'removed' ? 'eliminado' : 'no había bloque'} ${file}\n`);
  } else {
    const { action } = applyBlockToFile(file, GLOBAL_BLOCK);
    const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
    process.stdout.write(`${label} ${file}\n`);
  }
  if (!removing) {
    if (!values['no-commands']) {
      if (!values.quiet) process.stdout.write(`Comandos de Claude Code: /ar:estado, /ar:modelo, /ar:esfuerzo, /ar:nivel, /ar:ejecutor y /ar:triaje, en ${commandsTargetDir(values['claude-dir'])}\n`);
      const result = installCommands(values['claude-dir']);
      const legacy = removeLegacyCommands(values['claude-dir']);
      if (legacy.removed.length && !values.quiet) process.stdout.write(`Comandos antiguos retirados (ahora son /ar:...): ${legacy.removed.join(', ')}\n`);
      const counts = [];
      if (result.created.length) counts.push(`comandos creados: ${result.created.length}`);
      if (result.updated.length) counts.push(`actualizados: ${result.updated.length}`);
      if (result.unchanged.length) counts.push('sin cambios');
      if (!values.quiet) process.stdout.write(`${counts.join(' · ') || 'sin cambios'}\n`);
      if (result.skipped.length && !values.quiet) process.stdout.write(`omitidos (ya existía un archivo tuyo con ese nombre): ${result.skipped.join(', ')}\n`);
    }
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
          if (!values.quiet) process.stdout.write('Ejecutores opcionales: agentrelay executors add <nombre> (ver agentrelay executors)\n');
          noTtyNotice = true;
        }
      } else if (answer && await installOptionalExecutor(entry.name, dir) !== 0) {
        return 1;
      }
    }
    let config;
    try {
      config = loadConfig({ cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config }).config;
    } catch {
      // Setup sigue siendo útil aunque no se pueda cargar la configuración.
      return 0;
    }
    const executor = config.executor;
    const adapter = getExecutor(executor.type);
    if (adapter.login && adapter.authStatus) {
      const current = await adapter.authStatus(executor);
      if (current.ok) {
        process.stdout.write(`✔ Sesión activa: ${current.message}\n`);
      } else {
        if (adapter.accountHint && !values.quiet) process.stdout.write(`${adapter.accountHint}\n`);
        let answer;
        if (values.login) answer = true;
        else if (values.yes) answer = null;
        else answer = await confirm('¿Conectar ahora tu cuenta de ChatGPT?', { yes: false });
        if (answer === true) {
          const result = await signIn(adapter, executor, { showAccountHint: !values.quiet });
          if (values.login && result !== 0) return 1;
        } else {
          if (!values.quiet) process.stdout.write('Puedes hacerlo más tarde con: agentrelay login\n');
        }
      }
    }
  }
  return 0;
}

async function cmdUpdate(values) {
  const root = path.resolve(process.env.AGENTRELAY_INSTALL_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (!existsSync(path.join(root, '.git'))) {
    process.stderr.write('Esta instalación no puede actualizarse sola. La instalación global con npm i -g todavía no es compatible.\n');
    return 1;
  }
  const git = async (args) => runProcess('git', args, { cwd: root, windowsShell: false, timeoutMs: 120_000 });
  const dirty = await git(['status', '--porcelain']);
  if (dirty.code !== 0) { process.stderr.write(`No se pudo comprobar el estado de la instalación: ${dirty.stderr.trim()}\n`); return 1; }
  if (dirty.stdout.trim()) {
    process.stderr.write(`La instalación tiene cambios locales; no se modificó nada:\n${dirty.stdout.trim()}\n`);
    return 1;
  }
  const fetched = await git(['fetch']);
  if (fetched.code !== 0) { process.stderr.write(`git fetch falló: ${fetched.stderr.trim()}\n`); return 1; }
  const old = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  let upstreamResult = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : 'origin/main';
  const upstreamHead = await git(['rev-parse', '--verify', upstream]);
  if (upstreamHead.code !== 0) { process.stderr.write(`No se encuentra la rama remota ${upstream}. Comprueba el remoto con: git -C "${root}" remote -v\n`); return 1; }
  const counts = await git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
  if (ahead > 0) {
    process.stderr.write(`La rama local tiene ${ahead} commit(s) que no están en ${upstream}; no se modificó nada. Inspecciona con:\ngit -C "${root}" log --oneline ${upstream}..HEAD\ngit -C "${root}" status\n`);
    return 1;
  }
  if (behind === 0) { process.stdout.write(`Ya tienes la última versión (${old.slice(0, 7)})\n`); return 0; }
  const incoming = await git(['log', '--format=%h %s', '--max-count=20', `HEAD..${upstream}`]);
  process.stdout.write(`Cambios disponibles:\n${incoming.stdout.trim()}\n`);
  const total = Number((await git(['rev-list', '--count', `HEAD..${upstream}`])).stdout.trim());
  if (total > 20) process.stdout.write(`… y ${total - 20} más\n`);
  if (values.check) return 0;
  if (!values.yes) {
    if (!process.stdin.isTTY) { process.stdout.write('Para aplicar la actualización, ejecuta: agentrelay update --yes\n'); return 0; }
    const answer = await confirm('¿Actualizar AgentRelay ahora?', { yes: false });
    if (answer !== true) { process.stdout.write(answer === null ? 'Para aplicar la actualización, ejecuta: agentrelay update --yes\n' : 'Cancelado.\n'); return answer === null ? 0 : 1; }
  }
  const pulled = upstreamResult.code === 0
    ? await git(['pull', '--ff-only'])
    : await git(['pull', '--ff-only', 'origin', 'main']);
  if (pulled.code !== 0) { process.stderr.write(`No se pudo avanzar sin conflictos. Inspecciona con:\ngit -C "${root}" status\ngit -C "${root}" log --oneline --graph --decorate -20\n${pulled.stderr.trim()}\n`); return 1; }
  process.stdout.write('Instalando dependencias (npm ci)…\n');
  const npm = await runProcess('npm', ['ci'], { cwd: root, timeoutMs: 10 * 60 * 1000 });
  if (npm.code !== 0 || npm.error || npm.timedOut) {
    const output = [npm.stdout, npm.stderr].filter(Boolean).join('\n').trim();
    process.stderr.write(`npm ci falló${output ? `:\n${output.split(/\r?\n/).slice(-30).join('\n')}` : ''}\n`);
    return 1;
  }
  const setup = await cmdSetup({ yes: true, cwd: root });
  if (setup !== 0) return setup;
  const doctor = await cmdDoctor({ cwd: root });
  const updated = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  process.stdout.write(`Actualización: ${old.slice(0, 7)} → ${updated.slice(0, 7)}. Reinicia agentrelay watch y el chat del orquestador si estaban abiertos.\n`);
  return doctor;
}

/** Crea agentrelay.config.json si se pidió con --with-config y no existe. */
function writeConfigIfRequested(root, values) {
  if (!values['with-config']) return;
  const configFile = path.join(root, CONFIG_FILE);
  if (existsSync(configFile)) {
    process.stdout.write(`${configFile} ya existe; se mantiene.\n`);
  } else {
    writeFileSync(configFile, configTemplate({ scope: 'project' }));
    process.stdout.write(`Creado ${configFile}\n`);
  }
}

function initInstructionFiles(dir) {
  const claudeFile = path.join(dir, 'CLAUDE.md');
  const agentsFile = path.join(dir, 'AGENTS.md');
  if (!existsSync(agentsFile)) {
    if (!existsSync(claudeFile)) {
      return [
        { file: agentsFile, block: PROJECT_BLOCK },
        { file: claudeFile, content: '@AGENTS.md' },
      ];
    }
    return [{ file: claudeFile, block: PROJECT_BLOCK }];
  }

  const claude = existsSync(claudeFile) ? readFileSync(claudeFile, 'utf8') : '';
  if (/^[ \t]*@AGENTS\.md[ \t]*\r?$/m.test(claude)) return [{ file: agentsFile, block: PROJECT_BLOCK }];
  return [{ file: claudeFile, block: PROJECT_BLOCK }, { file: agentsFile, block: PROJECT_BLOCK }];
}

function ensureProjectConfigIgnored(root) {
  const file = path.join(root, '.gitignore');
  const requiredEntries = [CONFIG_FILE, '.agentrelay/'];
  if (!existsSync(file)) {
    writeFileSync(file, `${requiredEntries.join('\n')}\n`, 'utf8');
    return true;
  }
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const missingEntries = requiredEntries.filter((entry) => !lines.includes(entry));
  if (!missingEntries.length) return false;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(file, `${text}${text && !text.endsWith('\n') ? newline : ''}${missingEntries.join(newline)}${newline}`, 'utf8');
  return true;
}

function projectInstructionStatus(dir) {
  const claudeFile = path.join(dir, 'CLAUDE.md');
  const agentsFile = path.join(dir, 'AGENTS.md');
  const claude = existsSync(claudeFile) ? readFileSync(claudeFile, 'utf8') : '';
  const files = /^[ \t]*@AGENTS\.md[ \t]*\r?$/m.test(claude)
    ? [agentsFile]
    : [claudeFile, ...(existsSync(agentsFile) ? [agentsFile] : [])];
  const statuses = files.map((file) => blockStatus(file, PROJECT_BLOCK));
  const existingStatuses = statuses.filter((status) => status !== 'nofile');
  if (existingStatuses.length && existingStatuses.every((status) => status === 'current')) return 'current';
  if (statuses.includes('outdated')) return 'outdated';
  return 'missing';
}

async function cmdInit(values) {
  const dir = path.resolve(values.cwd || process.cwd());
  const root = await repoRoot(dir);

  // Sin repositorio: preparar la carpeta (git init, .gitignore y primer commit).
  if (!root) {
    const result = await prepareRepository(dir, {
      yes: values.yes,
      out: (line) => { if (!values.quiet) process.stdout.write(`${line}\n`); },
      err: (line) => process.stderr.write(`${line}\n`),
    });
    if (result.status === 'needs-confirmation') return 1;
    if (result.status === 'cancelled') {
      process.stdout.write('Cancelado.\n');
      return 0;
    }

    ensureProjectConfigIgnored(dir);

    const instructionFiles = initInstructionFiles(dir);
    for (const instruction of instructionFiles) {
      if (!values.quiet) process.stdout.write(`${initExplanation(instruction.file, { importOnly: instruction.content !== undefined })}\n`);
      let action;
      if (instruction.content !== undefined) {
        writeFileSync(instruction.file, `${instruction.content}\n`);
        action = 'created';
      } else {
        ({ action } = applyBlockToFile(instruction.file, instruction.block));
      }
      const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
      process.stdout.write(`${label} ${instruction.file}\n`);
    }

    const res = await commitAll(dir, 'Estado inicial (AgentRelay)');
    if (res.ok) {
      process.stdout.write('Repositorio preparado con un primer commit.\n');
      writeConfigIfRequested(dir, values);
      return 0;
    }
    process.stderr.write(`El repositorio se ha creado pero no se pudo crear el primer commit: ${res.error}. Configura tu identidad (git config user.name / user.email) y confirma los archivos con git add -A && git commit.\n`);
    return 1;
  }

  const instructionFiles = initInstructionFiles(root);

  // Estado del repositorio antes de tocar nada.
  const wasClean = await isClean(root);
  const ignoredFiles = new Set(await Promise.all(instructionFiles.map(async ({ file }) => (
    await isIgnored(root, path.relative(root, file)) ? file : null
  ))));

  const changedFiles = [];
  for (const instruction of instructionFiles) {
    if (!values.quiet) process.stdout.write(`${initExplanation(instruction.file, { importOnly: instruction.content !== undefined })}\n`);
    let action;
    if (instruction.content !== undefined) {
      writeFileSync(instruction.file, `${instruction.content}\n`);
      action = 'created';
    } else {
      ({ action } = applyBlockToFile(instruction.file, instruction.block));
    }
    const label = action === 'created' ? 'creado' : action === 'added' ? 'añadido' : action === 'updated' ? 'actualizado' : 'sin cambios';
    process.stdout.write(`${label} ${instruction.file}\n`);
    if (action !== 'unchanged') changedFiles.push(instruction.file);
  }
  const gitignoreChanged = ensureProjectConfigIgnored(root);
  if (gitignoreChanged) process.stdout.write(`Añadido ${CONFIG_FILE} a .gitignore\n`);
  const hasImportFile = instructionFiles.some(({ content }) => content !== undefined);
  const commitFiles = hasImportFile && [...ignoredFiles].some((file) => file !== null)
    ? []
    : changedFiles.filter((instructionFile) => !ignoredFiles.has(instructionFile));

  const filesToCommit = [...commitFiles, ...(gitignoreChanged ? [path.join(root, '.gitignore')] : [])];
  if (filesToCommit.length && wasClean) {
    const ok = await confirm(`¿Crear un commit con los archivos de instrucciones${gitignoreChanged ? ' y .gitignore' : ''}?`, { yes: values.yes });
    if (ok === true) {
      const res = await commitPaths(root, filesToCommit.map((file) => path.relative(root, file)), 'Añade las instrucciones de AgentRelay');
      if (!res.ok) {
        process.stderr.write(`No se pudo crear el commit de las instrucciones: ${res.error}\n`);
      } else {
        process.stdout.write('Commit de instrucciones creado.\n');
      }
    } else if (ok === null) {
      process.stderr.write('Los archivos de instrucciones han cambiado: confírmalos con git antes de delegar (AgentRelay necesita el repositorio limpio), o ejecuta de nuevo con --yes.\n');
    }
  } else if (changedFiles.length && !wasClean) {
    process.stderr.write('El repositorio tenía cambios pendientes: confirma los archivos de instrucciones con git antes de delegar (AgentRelay necesita el repositorio limpio).\n');
  }

  writeConfigIfRequested(root, values);

  return 0;
}

async function cmdStart(values) {
  const dir = path.resolve(values.cwd || process.cwd());
  process.stdout.write('1/4 Preparar el proyecto\n');
  const initStatus = await cmdInit(values);
  const root = await repoRoot(dir);
  if (initStatus !== 0 || !root) return 1;

  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  if (!gitignore.split(/\r?\n/).includes('.agentrelay/')) {
    const newline = gitignore.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(gitignorePath, `${gitignore}${gitignore && !gitignore.endsWith('\n') ? newline : ''}.agentrelay/${newline}`, 'utf8');
  }

  process.stdout.write('2/4 Dejar el árbol limpio\n');
  let changes = await pendingChanges(root);
  if (changes.length) {
    process.stdout.write(`Hay ${changes.length} cambio(s) sin confirmar:\n`);
    for (const change of changes) process.stdout.write(`  ${change.slice(3)}\n`);
    const sensitive = scanFolder(root).sensitive;
    const sensitiveChanges = changes.map((change) => change.slice(3).replace(/\\/g, '/'))
      .filter((file) => sensitive.includes(file));
    if (sensitiveChanges.length) {
      if (!values.yes) {
        await confirm('¿Confirmar esos cambios en un commit «Estado inicial»?', { yes: values.yes });
      }
      process.stderr.write(`No se creará el commit inicial porque hay archivos sensibles: ${sensitiveChanges.join(', ')}. Revísalos y retíralos o confírmalos manualmente.\n`);
    } else {
      if (sensitiveChanges.length) process.stdout.write(`Aviso: parecen sensibles: ${sensitiveChanges.join(', ')}\n`);
      const answer = await confirm('¿Confirmar esos cambios en un commit «Estado inicial»?', { yes: values.yes });
      if (answer === true) {
        const committed = await commitAll(root, 'Estado inicial');
        if (!committed.ok) process.stderr.write(`No se pudo crear el commit: ${committed.error}\n`);
      } else {
        process.stderr.write('AgentRelay necesita un árbol limpio para delegar. Confirma los cambios con: git add … && git commit …\n');
      }
    }
    changes = await pendingChanges(root);
    if (changes.length) {
      process.stderr.write('AgentRelay necesita un árbol limpio para delegar. Confirma los cambios manualmente con: git add … && git commit …\n');
    }
  }
  const treeClean = changes.length === 0;

  process.stdout.write('3/4 Comprobar el entorno\n');
  const doctorStatus = await cmdDoctor(values);

  process.stdout.write('4/4 Estado del proyecto\n');
  const state = await collectProjectState(root);
  await writeProjectState(root);
  const rendered = renderProjectState(state);
  const section = rendered.match(/## Qué hacer ahora\n[\s\S]*?(?=\n## |$)/);
  if (section) process.stdout.write(`${section[0]}\n`);
  process.stdout.write('\nMensaje para tu orquestador (pégalo en su chat):\n');
  process.stdout.write('Lee AGENTS.md y .agentrelay/ESTADO.md, ejecuta git status --short y agentrelay list, y continúa con lo pendiente. Eres el orquestador: no escribas código tú, delégalo con agentrelay run (en Windows usa agentrelay.cmd), en tareas pequeñas, y revisa cada resultado. Si tienes dudas, pregúntame antes de empezar.\n');
  process.stdout.write('\nSigue lo que hace el ejecutor con: agentrelay watch (en otra terminal, en esta carpeta).\n');
  return doctorStatus === 0 && treeClean ? 0 : 1;
}

export async function main(argv, runtime = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${HELP}`);
    return 1;
  }
  const { values, positionals } = parsed;
  try { createOutput({ quiet: values.quiet, verbose: values.verbose }); }
  catch (error) { process.stderr.write(`${error.message}\n`); return 1; }
  const [command, ...rest] = positionals;

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (values.help || !command || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  let migrationResult;
  if (runtime.autoMigrate && command !== 'completion' && command !== 'completions'
    && process.env.AGENTRELAY_NO_MIGRATE !== '1') {
    const requestedCwd = path.resolve(values.cwd || process.cwd());
    let root;
    try { root = await repoRoot(requestedCwd); } catch {}
    const cwd = root || requestedCwd;
    try {
      migrationResult = migrateConfig({
        home: agentrelayHome(),
        cwd,
        dryRun: command === 'config' && rest[0] === 'migrate' && values['dry-run'],
      });
      for (const { from, error } of migrationResult.errors) process.stderr.write(`[aviso] No se pudo migrar ${from}: ${error}\n`);
      if (migrationResult.changed) process.stderr.write(`Configuración unificada: ${migrationResult.actions.length} archivo(s) antiguo(s) migrado(s) (copia .bak)\n`);
    } catch (error) {
      process.stderr.write(`[aviso] No se pudo migrar la configuración: ${error.message}\n`);
      if (command === 'config' && rest[0] === 'migrate') migrationResult = { actions: [], changed: false, errors: [], failure: error.message };
    }
  }

  try {
    switch (command) {
      case 'run': return await cmdRun(rest, values, runtime);
      case 'show': return await cmdShow(rest, values);
      case 'review': return await cmdReview(rest, values, runtime);
      case 'check': return await cmdCheck(rest, values);
      case 'list': return await cmdList(values);
      case 'status': return await cmdStatus(values);
      case 'recover': return await cmdRecover(rest, values);
      case 'usage': return await cmdUsage(values);
      case 'pricing': return await cmdPricing(values, runtime);
      case 'watch': return await cmdWatch(rest, values);
      case 'doctor': return await cmdDoctor(values);
      case 'update': return await cmdUpdate(values);
      case 'config': return await cmdConfig(rest, values, migrationResult);
      case 'set': return await cmdSet(rest, values);
      case 'unset': return await cmdUnset(rest, values);
      case 'models': return await cmdModels(values);
      case 'executors': return await cmdExecutors(rest, values);
      case 'triage': return await cmdTriage(rest, values);
      case 'login': return await cmdLogin(values);
      case 'setup': return await cmdSetup(values);
      case 'init': return await cmdInit(values);
      case 'start': return await cmdStart(values);
      default:
        process.stderr.write(`Comando desconocido: ${command}\n\n${HELP}`);
        return 1;
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  } finally {
    if (['run', 'review', 'recover', 'init'].includes(command) && process.env.AGENTRELAY_NO_STATE !== '1') {
      try {
        const root = await repoRoot(path.resolve(values.cwd || process.cwd()));
        if (root) await refreshProjectState(root);
      } catch {
        // La actualización automática del estado nunca altera el comando.
      }
    }
  }
}
