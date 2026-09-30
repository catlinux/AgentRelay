// Interfaz de línea de comandos.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, LOCAL_CONFIG_FILE, agentrelayHome, loadConfig } from './config.js';
import { configTemplate } from './config-template.js';
import { getExecutor } from './executors/index.js';
import { CATALOG, executorsDir, getCatalogEntry, installExecutor, isInstalled } from './executors/catalog.js';
import { commitAll, commitPaths, isClean, isIgnored, repoRoot } from './git.js';
import { applyBlockToFile, blockStatus, GLOBAL_BLOCK, globalInstructionsPath, initExplanation, PROJECT_BLOCK, removeBlockFromFile, setupExplanation } from './instructions.js';
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
import { advise, appendRecord, comparison, displayLabel, normalizeLabel, readRecords, triageFile, validateLabel } from './triage.js';

const TRIAGE_OUTCOMES = ['over', 'ok', 'under'];

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
  agentrelay config [show|path|init] Muestra, localiza o crea la configuración
  agentrelay login [--device]       Inicia sesión de ChatGPT con Codex
  agentrelay setup                  Instala/desinstala el bloque de AgentRelay en el CLAUDE.md global
  agentrelay init                   Prepara el proyecto: instrucciones en CLAUDE.md y, si hace falta, el repositorio git

  agentrelay executors              Lista los ejecutores disponibles e instalados
  agentrelay executors add <nombre> Instala un ejecutor opcional
  agentrelay triage record      Guarda el resultado de una elección
  agentrelay triage advise      Recomienda modelo y esfuerzo
  agentrelay triage stats       Resume el historial de triaje

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
  --type --size --kind --model --effort --level --outcome --run --note --signals  Opciones de triage

Opciones de init:
  --yes                   Aplica sin pedir confirmación (git init, primer commit, commit de CLAUDE.md)
  --with-config           Crea además ${CONFIG_FILE}

Opciones de config init:
  --project               Crea ${CONFIG_FILE} en el proyecto
  --local                 Crea ${LOCAL_CONFIG_FILE}
  --force                 Sobrescribe el archivo de configuración existente

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
  project: { type: 'boolean' },
  local: { type: 'boolean' },
  device: { type: 'boolean' },
  executors: { type: 'string' },
  type: { type: 'string' }, size: { type: 'string' }, kind: { type: 'string' }, model: { type: 'string' },
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
  const { config, warnings = [] } = loadConfig({ cwd: root, configPath: values.config, overrides });
  for (const warning of warnings) process.stderr.write(`[aviso] ${warning}\n`);
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
  const warn = (text) => process.stdout.write(`[aviso] ${text}\n`);
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

  // Instrucciones del orquestador: tras actualizar AgentRelay pueden haber cambiado.
  const globalStatus = blockStatus(globalInstructionsPath(values['claude-dir']), GLOBAL_BLOCK);
  if (globalStatus === 'current') line(true, 'Instrucciones globales del orquestador: al día');
  else if (globalStatus === 'outdated') warn('Las instrucciones globales del orquestador están desactualizadas. Ejecuta "agentrelay setup".');
  else warn('Las instrucciones globales del orquestador no están instaladas. Ejecuta "agentrelay setup".');
  if (root) {
    const projectStatus = blockStatus(path.join(root, 'CLAUDE.md'), PROJECT_BLOCK);
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

async function cmdConfig(positionals, values) {
  const action = positionals[0] || 'show';
  const requestedCwd = path.resolve(values.cwd || process.cwd());
  const cwd = await repoRoot(requestedCwd) || requestedCwd;
  const userFile = path.join(configHome(), 'config.json');
  const projectFile = path.join(cwd, CONFIG_FILE);
  const localFile = path.join(cwd, LOCAL_CONFIG_FILE);
  if (action === 'path' && positionals.length === 1) {
    for (const [label, file] of [['Usuario', userFile], ['Proyecto', projectFile], ['Local', localFile]]) process.stdout.write(`${label}: ${file} (${existsSync(file) ? 'existe' : 'no existe'})\n`);
    return 0;
  }
  if (action === 'init' && positionals.length === 1) {
    const target = values.local ? localFile : values.project ? projectFile : userFile;
    if (values.local && values.project) throw new Error('Usa --project o --local, no ambos.');
    if (existsSync(target) && !values.force) {
      process.stdout.write(`${target} ya existe\n`);
      return 1;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, configTemplate({ scope: values.project || values.local ? 'project' : 'user' }), 'utf8');
    process.stdout.write(`Creado ${target}\nDescomenta las opciones para cambiar sus valores.\n`);
    return 0;
  }
  if ((action !== 'show' || positionals.length > 1) && positionals.length) {
    process.stderr.write('Uso: agentrelay config [show|path|init [--project|--local] [--force]]\n');
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
    let runState;
    if (values.run && kind === 'executor') {
      const root = await resolveRoot(values);
      runState = loadState(root, values.run);
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
      record.level ||= requiredTriage(values, 'level');
      record.effort ||= requiredTriage(values, 'effort');
    }
    if (values.run) record.run = values.run;
    if (values.note !== undefined) record.note = String(values.note).slice(0, 200);
    const saved = appendRecord(record, file);
    const choice = kind === 'orchestrator' ? `${saved.model} · esfuerzo ${displayLabel('effort', saved.effort)}` : `nivel ${saved.level}/esfuerzo ${displayLabel('effort', saved.effort)}`;
    process.stdout.write(`Anotado: ${kind === 'orchestrator' ? 'orquestador' : 'ejecutor'} · ${displayLabel('type', saved.type)} · ${displayLabel('size', saved.size)} · ${choice} · ${displayLabel('outcome', saved.outcome)}\n`);
    return 0;
  }
  if (action === 'advise') {
    const type = requiredTriage(values, 'type'), size = requiredTriage(values, 'size');
    const result = advise(records, { kind, type, size });
    const compare = kind === 'orchestrator' && values.model !== undefined && values.effort !== undefined
      ? comparison(result, validateLabel('model', values.model), validateLabel('effort', values.effort)) : null;
    const output = { ...result, comparison: compare };
    if (values.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else {
      const effortEs = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo' };
      if (kind === 'orchestrator') process.stdout.write(`Recomendación (orquestador): ${result.step.model} · esfuerzo ${effortEs[result.step.effort]}\n`);
      else process.stdout.write(`Recomendación (ejecutor): esfuerzo ${effortEs[result.step.effort]} · nivel ${result.step.level}\n`);
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
      for (const r of selected) { const key = `${r.kind}|${r.type}|${r.size}`; groups.set(key, [...(groups.get(key) || []), r]); }
      const rows = [...groups].map(([key, group]) => {
        const [groupKind, type, size] = key.split('|');
        const counts = Object.fromEntries(['over', 'ok', 'under'].map((o) => [o, group.filter((r) => r.outcome === o).length]));
        const steps = new Map();
        for (const r of group) { const step = groupKind === 'orchestrator' ? `${r.model}-${r.effort}` : `${r.effort}/n${r.level}`; steps.set(step, (steps.get(step) || 0) + 1); }
        const mostUsedStep = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        const rec = advise(records, { kind: groupKind, type, size }).step;
        return { kind: groupKind, type, size, records: group.length, counts, mostUsedStep, recommendation: groupKind === 'orchestrator' ? `${rec.model}-${rec.effort}` : `${rec.effort}/n${rec.level}` };
      });
      process.stdout.write(`${JSON.stringify({ file, total: selected.length, groups: rows }, null, 2)}\n`);
    }
    else if (!selected.length) process.stdout.write(`Sin datos todavía\nArchivo: ${file}\nTotal: 0\n`);
    else {
      process.stdout.write(`Clase        Tipo             Tamaño     Registros  Sobró/Bien/Corto  Paso más usado  Recomendación\n`);
      const groups = new Map();
      for (const r of selected) { const key = `${r.kind}|${r.type}|${r.size}`; groups.set(key, [...(groups.get(key) || []), r]); }
      for (const [key, group] of groups) {
        const [groupKind, type, size] = key.split('|');
        const counts = TRIAGE_OUTCOMES.map((o) => group.filter((r) => r.outcome === o).length);
        const steps = new Map(); for (const r of group) { const s = groupKind === 'orchestrator' ? `${r.model}-${r.effort}` : `${r.effort}/n${r.level}`; steps.set(s, (steps.get(s) || 0) + 1); }
        const popular = [...steps].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        const rec = advise(records, { kind: groupKind, type, size }).step;
        const recommendation = groupKind === 'orchestrator' ? `${rec.model}-${displayLabel('effort', rec.effort)}` : `${displayLabel('effort', rec.effort)}/n${rec.level}`;
        const popularDisplay = groupKind === 'orchestrator'
          ? popular.replace(/-(low|medium|high|xhigh)$/, (_, e) => `-${displayLabel('effort', e)}`)
          : popular.replace(/^(low|medium|high|xhigh)/, (e) => displayLabel('effort', e));
        process.stdout.write(`${(groupKind === 'orchestrator' ? 'orquestador' : 'ejecutor').padEnd(12)} ${displayLabel('type', type).padEnd(15)} ${displayLabel('size', size).padEnd(10)} ${String(group.length).padEnd(10)} ${counts.join('/').padEnd(17)} ${popularDisplay.padEnd(15)} ${recommendation}\n`);
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
    writeFileSync(configFile, configTemplate({ scope: 'project' }));
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
      case 'config': return await cmdConfig(rest, values);
      case 'executors': return await cmdExecutors(rest, values);
      case 'triage': return await cmdTriage(rest, values);
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
