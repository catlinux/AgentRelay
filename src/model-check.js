// Pruebas sintéticas de modelos gratuitos de OpenCode.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentrelayHome } from './config.js';
import { getExecutor } from './executors/index.js';
import { buildImplementPrompt } from './prompts.js';
import { normalizeTask } from './task.js';
import { runProcess } from './proc.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_PER_DAY = 5;
export const MAX_SECONDS = 300;
const EMPTY_CHECKS = () => ({ lastRun: null, models: {} });

export const isFreeModel = (id) => typeof id === 'string' && id.endsWith('-free');
export const checksFile = (home = agentrelayHome()) => path.join(home, 'model-checks.json');

export function loadChecks(home = agentrelayHome()) {
  try {
    const value = JSON.parse(readFileSync(checksFile(home), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !(value.lastRun === null || (typeof value.lastRun === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastRun)))
      || !value.models || typeof value.models !== 'object' || Array.isArray(value.models)) return EMPTY_CHECKS();
    return { lastRun: value.lastRun, models: value.models };
  } catch { return EMPTY_CHECKS(); }
}

export function saveChecks(checks, home = agentrelayHome()) {
  mkdirSync(home, { recursive: true });
  writeFileSync(checksFile(home), `${JSON.stringify(checks, null, 2)}\n`, 'utf8');
}

function localDate(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isDue(checks, now = new Date()) { return checks?.lastRun !== localDate(now); }

export function markDay(home = agentrelayHome(), now = new Date()) {
  const checks = loadChecks(home);
  checks.lastRun = localDate(now);
  saveChecks(checks, home);
}

export function pendingModels(listedIds, checks, max = MAX_PER_DAY, now = new Date()) {
  const models = checks?.models || {};
  const retryBefore = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return listedIds.map((item) => typeof item === 'string' ? item : item?.id)
    .filter((id) => {
      if (!isFreeModel(id)) return false;
      const record = models[id];
      if (!record) return true;
      return record.status === 'failed' && Date.parse(record.checkedAt) < retryBefore;
    }).slice(0, Math.max(0, max));
}

export async function startDailyCheck({ executor, env = process.env, home, now = new Date(), spawnFn = spawn, log = (line) => process.stderr.write(`${line}\n`) }) {
  try {
    if (env.AGENTRELAY_NO_MODEL_CHECK === '1' || env.NODE_TEST_CONTEXT !== undefined || !isDue(loadChecks(home), now)) return false;
    const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'agentrelay.js');
    const child = spawnFn(process.execPath, [entry, 'executors', 'check', '--background'], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
    log('Preparando en segundo plano el informe diario de ejecutores (y probando los modelos gratuitos nuevos de OpenCode, solo con una tarea de ejemplo, nunca con tu código).');
    return true;
  } catch { return false; }
}

export function buildProbe(baseDir = os.tmpdir()) {
  const root = mkdtempSync(path.join(baseDir, 'agentrelay-model-check-'));
  const workDir = path.join(root, 'work');
  mkdirSync(workDir);
  writeFileSync(path.join(workDir, 'package.json'), '{"type":"module"}\n');
  const checkFile = path.join(root, 'check.mjs');
  writeFileSync(checkFile, `import { sumar, restar } from './work/sumar.js';
const casos = [
  [sumar(2, 3) === 5, 'sumar positivos'],
  [restar(5, 3) === 2, 'restar positivos'],
  [sumar(-2, -3) === -5, 'sumar negativos'],
  [restar(-2, -3) === 1, 'restar negativos'],
  [sumar(0, 0) === 0 && restar(0, 0) === 0, 'ceros'],
];
if (casos.some(([ok]) => !ok)) { console.error(casos.filter(([ok]) => !ok).map(([, nombre]) => nombre).join(', ')); process.exit(1); }
console.log('OK');
`);
  return { root, workDir, checkFile };
}

function validReport(report) {
  return report && typeof report === 'object'
    && ['done', 'partial'].includes(report.status)
    && typeof report.summary === 'string'
    && Array.isArray(report.filesChanged);
}

export function evaluateProbe({ result, checkPassed, maxSeconds = MAX_SECONDS }) {
  let reason = 'La comprobación sintética ha fallado';
  if (!checkPassed) reason = 'La comprobación sintética ha fallado';
  else if (result.timedOut) reason = 'Se agotó el tiempo máximo';
  else if (!result?.ok) reason = 'El ejecutor no terminó correctamente';
  else if (!validReport(result.report)) reason = 'El informe final no es válido';
  else if (!Number.isFinite(result.durationMs) || result.durationMs > maxSeconds * 1000) reason = 'Superó el tiempo máximo';
  else if (result.error) reason = 'Error de API del ejecutor';
  else return { status: 'approved', reason: 'La prueba sintética y el informe son válidos' };
  return { status: 'failed', reason };
}

const PROBE_TASK = normalizeTask({
  title: 'Implementar una suma y una resta',
  objective: 'Crea sumar.js como módulo ES que exporte sumar(a, b) y restar(a, b), ambas operaciones aritméticas básicas.',
  context: 'Es una prueba sintética aislada. No accedas a archivos fuera de este directorio.',
  files: ['sumar.js'],
  acceptanceCriteria: ['sumar.js exporta sumar y restar correctamente, incluidos negativos y ceros.'],
});

export async function checkModel({ id, executor, adapter = getExecutor('opencode'), run = runProcess, tmpBase = os.tmpdir(), now = new Date() }) {
  const checkedAt = now.toISOString();
  let probe;
  let durationMs = 0;
  let result;
  let checkPassed = false;
  let failure = null;
  try {
    probe = buildProbe(tmpBase);
    const promptFile = '.prompt.md';
    writeFileSync(path.join(probe.workDir, promptFile), buildImplementPrompt(PROBE_TASK, { validationCommands: [], selfReview: 'none' }));
    const started = Date.now();
    result = await adapter.run({
      executor: { ...executor, model: id, timeoutSeconds: MAX_SECONDS },
      cwd: probe.workDir, promptFile,
    });
    durationMs = result?.durationMs ?? (Date.now() - started);
    if (result?.ok && !result.timedOut) {
      const checked = await run(process.execPath, [path.basename(probe.checkFile)], { cwd: probe.root, timeoutMs: MAX_SECONDS * 1000 });
      checkPassed = checked.code === 0 && !checked.timedOut && !checked.error;
    }
  } catch (error) { failure = error; }
  finally { if (probe) rmSync(probe.root, { recursive: true, force: true }); }
  const evaluated = failure
    ? { status: 'failed', reason: `No se pudo ejecutar la prueba: ${failure.message}` }
    : evaluateProbe({ result, checkPassed, maxSeconds: MAX_SECONDS });
  return {
    ...evaluated,
    checkedAt,
    seconds: Math.round(durationMs / 1000),
    ...(failure ? { reason: evaluated.reason.slice(0, 160) } : {}),
  };
}

/** `force` salta la comprobación de «ya se hizo hoy» (para el comando manual). */
export async function runChecks({ executor, adapter = getExecutor('opencode'), home = agentrelayHome(), now = new Date(), check = checkModel, log = () => {}, force = false }) {
  const checks = loadChecks(home);
  if (!force && !isDue(checks, now)) return { checked: [] };
  let listed;
  try { listed = await adapter.listModels(executor); } catch { return { checked: [] }; }
  if (!Array.isArray(listed) || !listed.length) return { checked: [] };
  // El día se marca antes de probar (y aunque no haya nada nuevo): evita revisiones simultáneas y repetidas.
  checks.lastRun = localDate(now);
  saveChecks(checks, home);
  const ids = pendingModels(listed, checks, MAX_PER_DAY, now);
  const checked = [];
  for (const id of ids) {
    let record;
    try { record = await check({ id, executor, adapter, now }); }
    catch (error) { record = { status: 'failed', checkedAt: now.toISOString(), seconds: 0, reason: `No se pudo ejecutar la prueba: ${error.message}` }; }
    checks.models[id] = record;
    saveChecks(checks, home);
    const summary = { id, status: record.status, reason: record.reason, seconds: record.seconds };
    checked.push(summary);
    log(summary);
  }
  return { checked };
}
