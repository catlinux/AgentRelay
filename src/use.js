// agentrelay use: cambia de ejecutor, modelo y esfuerzo con un solo comando.
//
//   agentrelay use                         interactivo (en un terminal) o resumen
//   agentrelay use opencode                cambia de ejecutor (modelo por defecto)
//   agentrelay use codex gpt-5.5 alto      ejecutor, modelo y esfuerzo
//   agentrelay use alto                    solo el esfuerzo
//   agentrelay use barato                  aplica un perfil guardado
//   agentrelay use --save barato           guarda lo actual como perfil
//
// Los cambios se escriben en ~/.agentrelay/config.json (o en el proyecto con
// --local) con las mismas funciones que `set`, que conservan los comentarios.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { CONFIG_FILE, EXECUTOR_DEFAULTS, agentrelayHome, loadConfig, parseJsonc } from './config.js';
import { setConfigValue, unsetConfigValue } from './config-file.js';
import { configTemplate } from './config-template.js';
import { CATALOG, executorsDir, isInstalled } from './executors/catalog.js';
import { getExecutor } from './executors/index.js';
import { loadChecks } from './model-check.js';
import { isExhausted, rankPosition, rankedFree } from './free-ranking.js';
import { parseSettingValue } from './settings.js';

export const EFFORT_ES = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo', max: 'máximo', none: 'ninguno' };
const effortLabel = (effort) => (effort ? EFFORT_ES[effort] || effort : 'por defecto');

function legacyModelMark(id, checks) {
  if (!id.endsWith('-free')) return '';
  const record = checks.models[id];
  if (record?.status === 'approved') {
    const date = new Date(record.checkedAt);
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return `  ✔ probado (${localDate})`;
  }
  if (record?.status === 'failed') return '  ✘ no pasó la prueba';
  return '  · sin probar';
}

function hasRanking(checks) {
  return Array.isArray(checks?.ranking?.entries) && checks.ranking.entries.length > 0;
}

function rankedModels(models, checks) {
  const available = new Map(models.map((model) => [model.id, model]));
  const ranked = rankedFree(checks);
  const result = ranked.filter((entry) => available.has(entry.id))
    .map((entry) => ({ ...available.get(entry.id), ranking: entry }));
  Object.defineProperty(result, 'stale', { value: ranked.stale });
  return result;
}

function rankingMark(id, checks, now = new Date()) {
  const entry = rankedFree(checks, { now }).find((item) => item.id === id);
  if (entry) {
    const position = rankPosition(checks, id);
    const score = entry.score >= 2 ? '✔✔' : '✔';
    const seconds = Number.isFinite(entry.seconds) ? entry.seconds : '—';
    return `#${position} ${score} ${seconds} s`;
  }
  if (isExhausted(checks, id, now)) return 'agotado hoy';
  if (checks.models[id]?.status === 'failed') return '✘';
  return '';
}

/** Devuelve el esfuerzo normalizado si el texto es un esfuerzo (alto, high…), o null. */
export function asEffort(text) {
  try { return parseSettingValue('effort', text).value ?? null; } catch { return null; }
}

/**
 * Interpreta los argumentos de `use`. Devuelve { profile } o { type, model, thinking }
 * (solo las claves indicadas). `profiles` son los perfiles guardados.
 */
export function parseUseArgs(args, profiles = {}) {
  if (args.length === 1 && Object.hasOwn(profiles, args[0]) && !Object.hasOwn(EXECUTOR_DEFAULTS, args[0])) return { profile: args[0] };
  const choice = {};
  for (const arg of args) {
    if (choice.type === undefined && choice.model === undefined && Object.hasOwn(EXECUTOR_DEFAULTS, arg)) choice.type = arg;
    else if (choice.thinking === undefined && /^(default|defecto)$/i.test(arg)) choice.thinking = null;
    else if (choice.thinking === undefined && asEffort(arg)) choice.thinking = asEffort(arg);
    else if (choice.model === undefined) choice.model = arg;
    else throw new Error(`No entiendo "${arg}". Uso: agentrelay use [ejecutor] [modelo] [esfuerzo] o agentrelay use <perfil>`);
  }
  return choice;
}

function configFile(values, root) {
  return values.local || values.project ? path.join(root, CONFIG_FILE) : path.join(agentrelayHome(), 'config.json');
}

/** Escribe los cambios en un solo paso y deshace si el resultado no es válido. */
function writeChanges(file, scope, edits, { cwd, configPath }) {
  const hadFile = existsSync(file);
  const previous = hadFile ? readFileSync(file, 'utf8') : configTemplate({ scope });
  let text = previous;
  for (const [key, value] of edits) text = value === undefined ? unsetConfigValue(text, key) : setConfigValue(text, key, value);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
  try { parseJsonc(text, file); return loadConfig({ cwd, configPath }); }
  catch (error) {
    if (hadFile) writeFileSync(file, previous, 'utf8'); else rmSync(file, { force: true });
    throw error;
  }
}

/** Ajustes que se acaban de cambiar pero que otro archivo con más prioridad (el del proyecto) vuelve a fijar. */
export function overriddenSettings(edits, saved, file) {
  const pinned = new Map();
  for (const [key] of edits) {
    const origin = saved.origins?.[key];
    if (origin && path.isAbsolute(origin) && path.resolve(origin) !== path.resolve(file)) {
      pinned.set(key.replace(/^executor\./, ''), origin);
    }
  }
  return pinned;
}

function warnOverridden(pinned, out) {
  if (!pinned.size) return;
  const files = [...new Set(pinned.values())];
  out(`Ojo: este cambio NO tiene efecto en este proyecto: ${files.join(', ')} fija ${[...pinned.keys()].join(', ')}. Para cambiarlo aquí: agentrelay use --local ... (o quita ese ajuste del archivo del proyecto).`);
}

/** Ediciones de configuración para aplicar una elección { type, model, thinking }. */
export function choiceEdits(choice, current) {
  const edits = [];
  const changedType = choice.type !== undefined && choice.type !== current.type;
  if (choice.type !== undefined) edits.push(['executor.type', choice.type]);
  // Al cambiar de ejecutor, lo guardado para el anterior deja de valer.
  if (changedType) for (const key of ['executor.model', 'executor.provider', 'executor.command']) edits.push([key, undefined]);
  if (choice.model !== undefined) edits.push(['executor.model', choice.model]);
  if (choice.thinking !== undefined) edits.push(['executor.thinking', choice.thinking === null ? undefined : choice.thinking]);
  return edits;
}

function describe(executor) {
  return `${executor.type} · ${executor.model || 'modelo por defecto'} · esfuerzo ${effortLabel(executor.thinking)}`;
}

function profileOf(executor) {
  return { type: executor.type, model: executor.model ?? null, thinking: executor.thinking ?? null };
}

/** Pregunta con una lista numerada. Devuelve el índice elegido, o `fallback` con Enter. */
async function pick(ask, title, items, fallback) {
  const lines = items.map((item, i) => `  ${String(i + 1).padStart(2)}) ${item}`);
  for (;;) {
    const answer = (await ask(`${title}\n${lines.join('\n')}\nElige un número${fallback !== null ? ' (Enter = sin cambios)' : ''}: `)).trim();
    if (!answer && fallback !== null) return fallback;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
    process.stdout.write('Número no válido.\n');
  }
}

async function interactive(current, ask, helpers) {
  const dir = executorsDir();
  const installed = await Promise.all(CATALOG.map((entry) => (entry.bundled ? true : isInstalled(entry.name, { dir }))));
  const currentIndex = CATALOG.findIndex((entry) => entry.name === current.type);
  const typeIndex = await pick(ask, '¿Qué ejecutor?', CATALOG.map((entry, i) => (
    `${entry.title}${entry.name === current.type ? '  ← en uso' : ''}${installed[i] ? '' : '  (no instalado)'}\n      ${entry.description}`
  )), currentIndex);
  const entry = CATALOG[typeIndex];
  if (!installed[typeIndex]) {
    if (entry.npmPackage) {
      const answer = (await ask(`${entry.title} no está instalado. ¿Instalarlo ahora? [s/N] `)).trim().toLowerCase();
      if (!['s', 'si', 'sí', 'y', 'yes'].includes(answer)) { process.stdout.write('Sin cambios.\n'); return null; }
      if (await helpers.install(entry.name) !== 0) return null;
    } else {
      process.stdout.write(`${entry.title} no está instalado. Instálalo aparte y conéctalo con: ${entry.connect}\n`);
    }
  }
  const choice = { type: entry.name };
  const executor = entry.name === current.type ? current : { ...current, ...EXECUTOR_DEFAULTS[entry.name], type: entry.name, thinking: null };
  const { models } = await modelsOf(entry.name, executor);
  const checks = entry.name === 'opencode' ? loadChecks() : null;
  let model = null;
  if (models.length) {
    let choices = models;
    if (checks && hasRanking(checks)) {
      choices = rankedModels(models, checks);
      if (executor.model && !choices.some((item) => item.id === executor.model)) {
        choices = [{ id: executor.model, currentOnly: true }, ...choices];
      }
    }
    const items = [...choices.map((item) => {
      const mark = checks && hasRanking(checks)
        ? rankingMark(item.id, checks)
        : checks ? legacyModelMark(item.id, checks) : '';
      const shortMark = item.ranking
        ? `  #${rankPosition(checks, item.id)}  ${item.ranking.score >= 2 ? '✔✔' : '✔'} ${Number.isFinite(item.ranking.seconds) ? item.ranking.seconds : '—'} s`
        : mark ? `  ${mark}` : '';
      return `${item.id}${item.id === executor.model ? '  ← en uso' : ''}${shortMark}`;
    }), 'Otro (escribirlo)'];
    const currentIndex = choices.findIndex((item) => item.id === executor.model);
    const index = await pick(ask, '¿Qué modelo?', items, currentIndex >= 0 ? currentIndex : 0);
    if (index === choices.length) choice.model = (await ask('Modelo: ')).trim() || undefined;
    else { model = choices[index]; choice.model = model.id; }
  } else {
    const typed = (await ask(`Modelo (Enter = ${executor.model || 'por defecto'}): `)).trim();
    if (typed) choice.model = typed;
  }
  const efforts = model?.efforts?.length ? model.efforts : ['low', 'medium', 'high'];
  const effortItems = ['por defecto', ...efforts.map((effort) => `${effortLabel(effort)}${effort === model?.defaultEffort ? ' (recomendado)' : ''}`)];
  const effortIndex = await pick(ask, '¿Qué esfuerzo de razonamiento?', effortItems, null);
  choice.thinking = effortIndex === 0 ? null : efforts[effortIndex - 1];
  return choice;
}

/** Lista de modelos de un ejecutor con tiempo máximo; devuelve { models, error }. */
async function modelsOf(type, executor, timeoutMs = 20_000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`tiempo máximo de ${timeoutMs / 1000} s superado`)), timeoutMs); });
  try {
    const adapter = getExecutor(type);
    return { models: adapter.listModels ? await Promise.race([adapter.listModels(executor), timeout]) || [] : [] };
  } catch (error) { return { models: [], error: error.message }; }
  finally { clearTimeout(timer); }
}

/** agentrelay use --list: todos los ejecutores y sus modelos en un solo sitio. */
async function listAll(current, out, values = {}) {
  const dir = executorsDir();
  for (const entry of CATALOG) {
    const installed = entry.bundled || await isInstalled(entry.name, { dir });
    out(`${entry.title} (${entry.name}) · ${installed ? 'instalado' : 'no instalado'} · ${entry.cost}${entry.name === current.type ? ' · en uso' : ''}`);
    if (!installed) { out(`    (instálalo con: ${entry.npmPackage ? `agentrelay executors add ${entry.name}` : entry.connect})`); continue; }
    const executor = entry.name === current.type ? current : { ...current, ...EXECUTOR_DEFAULTS[entry.name], type: entry.name, thinking: null };
    const { models, error } = await modelsOf(entry.name, executor);
    const checks = entry.name === 'opencode' ? loadChecks() : null;
    if (error) out(`    (no se pudo leer la lista: ${error})`);
    else if (!models.length) out(`    modelo por defecto: ${EXECUTOR_DEFAULTS[entry.name].model || '—'} (este ejecutor no ofrece lista)`);
    if (entry.name === 'opencode' && !values.all && hasRanking(checks)) {
      const ranked = rankedModels(models, checks);
      const rankedIds = new Set(ranked.map((model) => model.id));
      for (const model of ranked) {
        const currentMark = entry.name === current.type && model.id === current.model ? '●' : ' ';
        const position = rankPosition(checks, model.id);
        const score = model.ranking.score >= 2 ? '✔✔' : '✔';
        const seconds = Number.isFinite(model.ranking.seconds) ? model.ranking.seconds : '—';
        out(`  ${currentMark} ${model.id}  #${position}  ${score} ${seconds} s`);
      }
      const exhausted = models.map((model) => model.id).filter((id) => isExhausted(checks, id));
      const additional = models.filter((model) => !rankedIds.has(model.id) && !exhausted.includes(model.id)).length;
      if (additional > 0) out(`  (+${additional} modelos más de OpenCode sin probar o que no pasaron las pruebas: agentrelay use --list --all)`);
      if (exhausted.length) out(`  Agotados hoy (vuelven mañana): ${exhausted.join(', ')}`);
      if (ranked.stale) out('  (ranquing de hace más de 36 h; se actualiza el primer uso de cada día, o a mano con: agentrelay rank --run)');
      continue;
    }
    for (const model of models) {
      const efforts = model.efforts?.length ? `  ${model.efforts.map((effort) => `${effortLabel(effort)}${effort === model.defaultEffort ? '*' : ''}`).join(' ')}` : '';
      const mark = checks ? (values.all && hasRanking(checks) ? rankingMark(model.id, checks) : legacyModelMark(model.id, checks)) : '';
      out(`  ${entry.name === current.type && model.id === current.model ? '●' : ' '} ${model.id}${efforts}${mark ? `  ${mark}` : ''}`);
    }
    if (entry.name === 'opencode' && !values.all && !hasRanking(checks)) out('  Aún no hay ranquing de modelos gratuitos: agentrelay rank --run');
  }
  out('Cambia con: agentrelay use <ejecutor> <modelo> [esfuerzo]   (* = esfuerzo por defecto)');
}

export async function cmdUse(positionals, values, helpers, runtime = {}) {
  const cwd = path.resolve(values.cwd || process.cwd());
  const root = values.local || values.project ? await helpers.resolveRoot(values) : cwd;
  const scope = values.local || values.project ? 'project' : 'user';
  const file = configFile(values, root);
  const loaded = loadConfig({ cwd: root, configPath: values.config });
  const current = loaded.config.executor;
  const profiles = loaded.config.profiles || {};
  const out = (text) => process.stdout.write(`${text}\n`);

  if (values.list) { await listAll(current, out, values); return 0; }

  // Guardar el ajuste actual como perfil.
  if (values.save !== undefined) {
    const name = String(values.save).trim();
    if (!/^[\p{L}\p{N}_-]+$/u.test(name)) throw new Error('El nombre del perfil solo puede tener letras, números, - y _.');
    if (Object.hasOwn(EXECUTOR_DEFAULTS, name)) throw new Error(`"${name}" es un ejecutor; elige otro nombre para el perfil.`);
    writeChanges(path.join(agentrelayHome(), 'config.json'), 'user', [[`profiles.${name}`, profileOf(current)]], { cwd: root, configPath: values.config });
    out(`✔ Perfil "${name}" guardado: ${describe(current)}`);
    out(`Úsalo con: agentrelay use ${name}`);
    return 0;
  }

  let choice;
  if (positionals.length) {
    if (positionals[0] === 'cline') throw new Error('Ejecutor desconocido: cline. Disponibles: codex, opencode. Cline se retiró; usa: agentrelay use opencode deepseek/deepseek-flash');
    const parsed = parseUseArgs(positionals, profiles);
    if (parsed.profile) {
      const profile = profiles[parsed.profile];
      choice = { type: profile.type, model: profile.model ?? undefined, thinking: profile.thinking ?? null };
    } else choice = parsed;
  } else {
    const ask = runtime.ask || (process.stdin.isTTY && process.stdout.isTTY ? null : undefined);
    if (ask === undefined) {
      out(`En uso: ${describe(current)}`);
      out(`Ejecutores: ${CATALOG.map((entry) => entry.name).join(', ')}`);
      if (Object.keys(profiles).length) out(`Perfiles: ${Object.entries(profiles).map(([name, p]) => `${name} (${describe(p)})`).join('; ')}`);
      out('Cambia con: agentrelay use <ejecutor> [modelo] [esfuerzo]   o   agentrelay use <perfil>');
      return 0;
    }
    let rl;
    const question = ask || ((text) => { rl ||= readline.createInterface({ input: process.stdin, output: process.stdout }); return rl.question(text); });
    try {
      out(`En uso: ${describe(current)}\n`);
      choice = await interactive(current, question, helpers);
      if (!choice) return 0;
      const interactiveEdits = choiceEdits(choice, current);
      const saved = writeChanges(file, scope, interactiveEdits, { cwd: root, configPath: values.config });
      out(`✔ Ahora: ${describe(saved.config.executor)}${scope === 'project' ? ` (solo en este proyecto: ${CONFIG_FILE})` : ''}`);
      warnOverridden(overriddenSettings(interactiveEdits, saved, file), out);
      const name = (await question('¿Guardarlo como perfil? Escribe un nombre (Enter = no): ')).trim();
      if (name) await cmdUse([], { ...values, save: name }, helpers, runtime);
      await offerLogin(saved.config.executor, helpers);
      return 0;
    } finally { rl?.close(); }
  }

  if (choice.type && choice.type !== current.type && !(await isInstalled(choice.type, { dir: executorsDir() }))) {
    const entry = CATALOG.find((item) => item.name === choice.type);
    out(`Aviso: ${entry.title} no está instalado. ${entry.npmPackage ? `Instálalo con: agentrelay executors add ${entry.name}` : `Instálalo aparte y conéctalo con: ${entry.connect}`}`);
  }
  const edits = choiceEdits(choice, current);
  const saved = writeChanges(file, scope, edits, { cwd: root, configPath: values.config });
  out(`✔ Ahora: ${describe(saved.config.executor)}${scope === 'project' ? ` (solo en este proyecto: ${CONFIG_FILE})` : ''}`);
  warnOverridden(overriddenSettings(edits, saved, file), out);
  return 0;
}

async function offerLogin(executor, helpers) {
  const adapter = getExecutor(executor.type);
  if (!adapter.login || !adapter.authStatus) return;
  const status = await adapter.authStatus(executor).catch(() => ({ ok: true }));
  if (!status.ok) process.stdout.write('Falta iniciar sesión: ejecuta agentrelay login\n');
}
