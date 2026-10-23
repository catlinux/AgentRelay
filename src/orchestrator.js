// Flujo de una ejecución:
//
//   implementar -> validar -> (corregir automáticamente mientras haya reintentos)
//   -> (self-review en pasada separada, si procede) -> decidir si hace falta
//   revisión del orquestador -> aceptada | pendiente de revisión | escalada
//
// La revisión del orquestador llega después con applyReview():
//   accept (con validación final) | fix (nuevo intento) | escalate | reject

import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getExecutor } from './executors/index.js';
import { projectRulesForExecutor } from './instructions.js';
import { diffFromBase, head, pendingChanges } from './git.js';
import { buildFixPrompt, buildImplementPrompt, buildSelfReviewPrompt } from './prompts.js';
import { decideReview, decideSelfReview, resolvePolicy, shouldRunSelfReviewPass } from './policy.js';
import { renderReport } from './report.js';
import { appendEvent } from './events.js';
import {
  createRunDir, ensureWorkspace, loadState, newRunId, relativeRunFile, saveState, workspaceDir, writeRunFile,
} from './store.js';
import { runValidations, scopeViolations } from './validate.js';
import { VERSION } from './version.js';
import { classifyExecutorError, isRateLimitError, isTransientError, maskSecrets, parseQuotaReset } from './executors/common.js';
import { CATALOGO } from './catalogo-ia.js';
import { isInstalled } from './executors/catalog.js';
import { alternativesHint } from './alternatives.js';
import { checkExecutorModel } from './executor-check.js';
import { agentrelayHome } from './config.js';
import { isAvailable as quotaAvailable, markQuotaAvailable, markQuotaExhausted } from './quota-state.js';
import { registrarGasto } from './gasto.js';
import { executorFor, pickEntry, routeEntries } from './router.js';
import { hasApiProfile } from './executors/codex.js';

export const DECISIONS = ['accept', 'fix', 'escalate', 'reject'];
const FINAL_STATUSES = ['accepted', 'rejected'];

/** Configuración del ejecutor que toca usar ahora: la entrada actual de la ruta o la configurada. */
function currentExecutor(state) {
  return state.route?.current ? executorFor(state.route.current, state.config.executor) : state.config.executor;
}

function context(root, state, onEvent) {
  const { config, task } = state;
  // Añade el evento al registro y lo notifica a quien lo muestra en tiempo real.
  const emit = (event) => {
    const written = appendEvent(root, state.id, event);
    if (onEvent) onEvent(written);
  };
  return {
    root,
    state,
    task,
    config,
    policy: state.policy,
    validationCommands: [...config.validation.commands, ...task.validation],
    emit,
  };
}

const isBlocked = (result) => result.report?.status === 'blocked' || Boolean(result.report?.needsEscalation);

function addUsage(state, usage) {
  if (!usage) return;
  const total = state.usage;
  total.inputTokens += usage.inputTokens || 0;
  total.outputTokens += usage.outputTokens || 0;
  total.cacheReadTokens += usage.cacheReadTokens || 0;
  if (typeof usage.totalCost === 'number') total.estimatedCost += usage.totalCost;
}

function normalizeRepoPath(file) {
  return path.posix.normalize(String(file).replace(/\\/g, '/')).replace(/^\.\//, '');
}

async function attempt(ctx, kind, { feedback, check } = {}) {
  const { state, task, config, root } = ctx;
  const n = state.attempts.length + 1;
  const configured = currentExecutor(state);
  const projectRules = projectRulesForExecutor(root, configured.type);
  const common = { validationCommands: ctx.validationCommands, selfReview: state.selfReview.mode, projectRules };

  let prompt;
  if (kind === 'implement') prompt = buildImplementPrompt(task, common);
  else if (kind === 'fix') {
    prompt = buildFixPrompt(task, {
      ...common, feedback, validations: check?.validations, scopeViolations: check?.scopeViolations,
    });
  } else {
    prompt = buildSelfReviewPrompt(task, {
      validationCommands: ctx.validationCommands, changedFiles: check.files, diff: check.patch, validations: check.validations, projectRules,
    });
  }

  const base = `attempt-${n}-${kind}`;
  writeRunFile(root, state.id, `${base}.prompt.md`, prompt);
  const executor = {
    ...configured,
    thinking: task.effort ?? configured.thinking,
    model: state.route ? configured.model : task.model ?? configured.model,
  };
  const { provider, model } = executor;
  ctx.emit({ type: 'attempt_start', attempt: n, kind, provider, model });

  const startedAt = new Date().toISOString();
  const result = await getExecutor(executor.type).run({
    executor, cwd: root, promptFile: relativeRunFile(state.id, `${base}.prompt.md`),
    onActivity: (activity) => ctx.emit({ type: 'activity', attempt: n, ...activity }),
  });
  writeRunFile(root, state.id, `${base}.ndjson`, result.rawOutput);
  if (result.rawError.trim()) writeRunFile(root, state.id, `${base}.stderr.log`, result.rawError);

  state.attempts.push({
    n,
    kind,
    startedAt,
    durationMs: result.durationMs,
    ok: result.ok,
    finishReason: result.finishReason,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    error: result.error ? maskSecrets(result.error) : result.error,
    model: result.model ?? (model ? { id: model, provider } : result.model),
    ...(state.route ? { route: state.route.current.key, paid: state.route.current.paid } : {}),
    iterations: result.iterations,
    toolCalls: result.toolCalls,
    usage: result.usage,
    ...(result.billing !== undefined ? { billing: result.billing } : {}),
    ...(result.fellBackFromQuota !== undefined ? { fellBackFromQuota: result.fellBackFromQuota } : {}),
    ...(result.quotaResetAt !== undefined ? { quotaResetAt: result.quotaResetAt } : {}),
    report: result.report,
    finalText: result.report ? null : result.text.slice(0, 4000),
    feedback: feedback || null,
  });
  addUsage(state, result.usage);
  if (state.route) { try { registrarGasto(state.route.current.key, result.usage); } catch {} }
  saveState(root, state);
  if (result.ok && state.route) {
    state.route.strikes = 0;
    try { markQuotaAvailable(state.route.current.quotaId, { home: agentrelayHome() }); } catch {}
  }

  ctx.emit({
    type: 'attempt_end',
    attempt: n,
    ok: result.ok,
    durationMs: result.durationMs,
    agentStatus: result.report?.status,
    error: result.error ? maskSecrets(result.error) : result.error,
  });
  return result;
}

async function evaluate(ctx) {
  const { root, state, task, config } = ctx;
  ctx.emit({ type: 'check_start' });
  const diff = await diffFromBase(root, state.baseline.head, path.join(workspaceDir(root), 'tmp'));
  const validations = await runValidations(ctx.validationCommands, {
    cwd: root, timeoutSeconds: config.validation.timeoutSeconds, maxOutputChars: config.report.maxOutputChars,
  });
  const violations = scopeViolations(diff.files, [...task.doNotModify, ...(task.references ?? [])]);
  const headMoved = (await head(root)) !== state.baseline.head;
  const passed = validations.every((v) => v.passed) && violations.length === 0;

  for (const v of validations) {
    ctx.emit({
      type: 'validation',
      command: v.command,
      passed: v.passed,
      exitCode: v.exitCode,
      timedOut: v.timedOut,
      durationMs: v.durationMs,
    });
  }

  const check = {
    at: new Date().toISOString(), passed, files: diff.files, validations, scopeViolations: violations, headMoved,
  };
  const lastAttempt = state.attempts.at(-1);
  if (lastAttempt?.report) {
    const declaredFiles = new Set((lastAttempt.report.filesChanged || []).map(normalizeRepoPath));
    const undeclaredFiles = diff.files
      .map((file) => normalizeRepoPath(file.path))
      .filter((file) => !file.startsWith('.agentrelay/') && !declaredFiles.has(file));
    if (undeclaredFiles.length) lastAttempt.undeclaredFiles = undeclaredFiles;
    else delete lastAttempt.undeclaredFiles;
  }
  writeRunFile(root, state.id, 'diff.patch', diff.patch);
  state.lastCheck = check;
  saveState(root, state);

  ctx.emit({ type: 'check', changedFiles: diff.files.length, passed, scopeViolations: violations, headMoved });
  return { ...check, patch: diff.patch };
}

function autoFeedback(result, check) {
  if (!result.ok) {
    return `The previous attempt did not finish correctly (${result.error}). Continue the task and complete it.`;
  }
  const parts = [];
  if (check.validations.some((v) => !v.passed)) parts.push('The validation commands listed below fail. Fix the problem so that they pass.');
  if (check.scopeViolations.length) parts.push('Some protected files were modified.');
  return parts.join('\n');
}

/**
 * Continúa el ciclo tras un intento: validaciones, correcciones automáticas,
 * self-review y decisión final.
 */
async function continueCycle(ctx, result) {
  const { state, policy } = ctx;
  for (;;) {
    const check = await evaluate(ctx);
    if (isBlocked(result)) return finalize(ctx, result, check);

    if (!result.ok) {
      const errorText = `${result.error ?? ''} ${result.rawError ?? ''}`;
      // Con routing auto, un límite de velocidad o un fallo pasajero se reintenta tras una pausa y, si persiste, salta (o se detiene).
      const errorKind = classifyExecutorError(errorText)
        ?? (state.route && isRateLimitError(errorText) ? 'quota' : null)
        ?? (state.route && isTransientError(errorText) ? 'transient' : null);
      const retry = state.route && errorKind ? retryPlan(state.route, errorKind, errorText) : null;
      if (retry) {
        state.route.strikes = retry.failures;
        (state.route.retries ??= []).push({
          at: new Date().toISOString(), entry: state.route.current.key, failures: retry.failures, of: retry.allowed,
          pauseSeconds: retry.pauseMs / 1000, reason: errorKind,
        });
        saveState(ctx.root, state);
        ctx.emit({
          type: 'route_retry', entry: state.route.current.key, failures: retry.failures, of: retry.allowed, pauseSeconds: retry.pauseMs / 1000,
        });
        await (routerHooks.sleep ?? sleep)(retry.pauseMs);
        result = await attempt(ctx, 'fix', { feedback: RETRY_FEEDBACK, check });
        continue;
      }
      if (errorKind && state.route && await switchRoute(ctx, result, errorKind)) {
        result = await attempt(ctx, 'fix', { feedback: SWITCH_FEEDBACK, check });
        continue;
      }
      if (errorKind) {
        let reason = errorKind === 'credentials'
          ? 'problema de credenciales del ejecutor: revisa con `agentrelay doctor` y vuelve a configurar la sesión con `agentrelay login` o la clave de API del proveedor'
          : errorKind === 'unavailable'
            ? 'el modelo configurado ya no está disponible en el proveedor: elige otro con agentrelay use'
            : errorKind === 'transient'
              ? 'el proveedor ha fallado varias veces seguidas (conexión o saturación): vuelve a intentarlo más tarde o elige otra IA.'
              : 'problema de cuota o saldo del ejecutor: revisa el saldo o plan del proveedor o elige otro ejecutor.';
        if (state.route) reason += `\n${routeStoppedMessage(state.route)}`;
        if (errorKind === 'quota' && !state.route) {
          if (ctx.config.executor.type === 'opencode' && ctx.config.executor.model) {
            try {
              markQuotaExhausted(ctx.config.executor.model, {
                home: agentrelayHome(),
                errorText: `${result.error ?? ''} ${result.rawError ?? ''}`,
              });
            } catch {}
          }
          try {
            const installed = { antigravity: await isInstalled('antigravity') };
            reason += `\n${alternativesHint({ current: ctx.config.executor, config: ctx.config, installed })}`;
          } catch {}
        }
        return finalize(ctx, result, check, { status: 'failed', reasons: [reason] });
      }
    }

    if (!result.ok || !check.passed) {
      if (policy.autoFix && state.retriesUsed < policy.maxRetries) {
        state.retriesUsed += 1;
        ctx.emit({ type: 'retry', n: state.retriesUsed, max: policy.maxRetries });
        result = await attempt(ctx, 'fix', { feedback: autoFeedback(result, check), check });
        continue;
      }
      return finalize(ctx, result, check);
    }

    if (state.selfReview.pass === null) {
      const decision = shouldRunSelfReviewPass(policy, state.selfReview.mode, {
        changedFiles: check.files.length, validationCount: check.validations.length, checkPassed: check.passed,
      });
      state.selfReview.pass = decision;
      if (decision.run) {
        ctx.emit({ type: 'self_review_start' });
        result = await attempt(ctx, 'self-review', { check });
        continue;
      }
      if (state.selfReview.mode === 'pass') ctx.emit({ type: 'self_review_skipped', reason: decision.reason });
    }
    return finalize(ctx, result, check);
  }
}

const SWITCH_FEEDBACK = 'The previous executor stopped before finishing (quota, credentials or model not available). '
  + 'The working tree keeps its partial changes: review them and continue the task from there until it is complete.';

// Intentos seguidos sobre la misma entrada antes de saltar a la siguiente (gratuita) o de detenerse y preguntar (de pago).
// Entre intentos se espera para no insistir en pleno fallo pasajero.
const FREE_ATTEMPTS = 2;
const PAID_ATTEMPTS = 3;
const FREE_PAUSES_MS = [5000];
const PAID_PAUSES_MS = [5000, 15000];
const RETRY_FEEDBACK = 'The previous attempt stopped before finishing because of a temporary provider error (quota, rate limit or connection). '
  + 'The working tree keeps its partial changes: review them and continue the task from there until it is complete.';
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Decide si se reintenta la misma entrada. Gratuita: cuota, saldo, límite o fallo pasajero (2 intentos), salvo que el error dé
 * la hora de reinicio. De pago: solo límite de velocidad o fallo pasajero (3 intentos); saldo, credenciales o modelo inexistente
 * son definitivos y detienen la tarea sin insistir.
 */
function retryPlan(route, errorKind, errorText) {
  const paid = route.current.paid;
  const allowed = paid ? PAID_ATTEMPTS : FREE_ATTEMPTS;
  const failures = (route.strikes ?? 0) + 1;
  if (failures >= allowed) return null;
  let retryable = false;
  if (errorKind === 'transient') retryable = true;
  else if (errorKind === 'quota' && !parseQuotaReset(errorText)) retryable = paid ? isRateLimitError(errorText) : true;
  if (!retryable) return null;
  const pauses = paid ? PAID_PAUSES_MS : FREE_PAUSES_MS;
  return { failures, allowed, pauseMs: pauses[Math.min(failures - 1, pauses.length - 1)] };
}

/** Mensaje cuando el enrutado se detiene: nunca se sigue con otra IA sin que el usuario la elija. */
function routeStoppedMessage(route) {
  const names = CATALOGO.filter((item) => item.ruta).map((item) => item.id).join(', ');
  return `Se detiene el enrutado: ha fallado ${route.current.label} y no queda ninguna otra IA en el orden (o se alcanzó routing.maxSwitches). `
    + `No se continúa con otra sin tu decisión: PREGUNTA al usuario qué IA usar. Opciones: agentrelay orden pago <${names}> y volver a lanzar la tarea (agentrelay orden muestra el orden actual). Mira la sección Enrutado del informe.`;
}

const SWITCH_REASONS = { quota: 'cuota agotada', credentials: 'sin credenciales', unavailable: 'modelo no disponible', transient: 'fallos repetidos del proveedor' };

const routeQuotaAvailable = (quotaId) => quotaAvailable(quotaId, new Date(), { home: agentrelayHome() });

// Solo para tests: sustituyen la lista de entradas y la comprobación de instalación/sesión,
// que dependen de los ejecutores reales de la máquina.
export const routerHooks = { entries: null, usable: null, sleep: null };
const usableEntry = (entry, base) => (routerHooks.usable ?? entryUsable)(entry, base);

/**
 * Marca la entrada actual de la ruta y pasa a la siguiente utilizable. No consume reintentos.
 * Devuelve la nueva entrada, o null si no queda ninguna o se alcanzó routing.maxSwitches.
 */
async function switchRoute(ctx, result, errorKind) {
  const { state, root } = ctx;
  const route = state.route;
  const from = route.current;
  if (errorKind === 'quota') {
    try {
      markQuotaExhausted(from.quotaId, { home: agentrelayHome(), errorText: `${result.error ?? ''} ${result.rawError ?? ''}` });
    } catch {}
  }
  // Credenciales o modelo no disponible: no es cuota, así que solo se descarta para esta ejecución.
  route.failed.push(from.key);
  if (route.switches.length >= (state.config.routing?.maxSwitches ?? 5)) { saveState(root, state); return null; }
  const { entry, skipped } = await pickEntry(route.entries, {
    isAvailable: routeQuotaAvailable,
    isUsable: (candidate) => usableEntry(candidate, state.config.executor),
    exclude: route.failed,
  });
  route.skipped.push(...skipped);
  if (!entry) { saveState(root, state); return null; }
  const change = {
    at: new Date().toISOString(), from: from.key, to: entry.key, reason: SWITCH_REASONS[errorKind] ?? errorKind,
    paid: entry.paid, trainsOnData: entry.trainsOnData,
  };
  route.switches.push(change);
  route.current = entry;
  route.strikes = 0;
  saveState(root, state);
  ctx.emit({ type: 'route_switch', ...change });
  return entry;
}

/** Comprueba que una entrada de la ruta se puede usar: instalada, con sesión y con el modelo disponible. */
async function entryUsable(entry, base) {
  const executor = executorFor(entry, base);
  const adapter = getExecutor(entry.type);
  try { await adapter.version(executor); } catch { return { ok: false, reason: 'ejecutor no instalado' }; }
  if (entry.type === 'codex' && entry.api) {
    if (!hasApiProfile()) return { ok: false, reason: 'sin clave de API (agentrelay login --api)' };
  } else if (adapter.authStatus) {
    const auth = await adapter.authStatus(executor);
    if (!auth.ok) return { ok: false, reason: 'sin sesión' };
    // Con una clave de API, Codex factura por uso: no es la cuota gratuita de ChatGPT.
    if (entry.type === 'codex' && !entry.paid && /api key/i.test(auth.message || '')) {
      return { ok: false, reason: 'Codex usa una clave de API, no la cuenta de ChatGPT' };
    }
  }
  try {
    const modelCheck = await checkExecutorModel(executor, { adapter });
    if (!modelCheck.ok && !modelCheck.unknown) return { ok: false, reason: 'modelo no disponible' };
  } catch {}
  return { ok: true };
}

/** Elige la primera entrada utilizable de una ejecución nueva con routing.mode = "auto". */
async function startRoute(config, task) {
  const effort = task.effort ?? config.executor.thinking;
  const entries = routerHooks.entries?.({ config, effort }) ?? routeEntries({ config, effort });
  const { entry, skipped } = await pickEntry(entries, {
    isAvailable: routeQuotaAvailable,
    isUsable: (candidate) => usableEntry(candidate, config.executor),
  });
  if (!entry) {
    const detail = skipped.map(({ key, reason }) => `${key}: ${reason}`).join('; ');
    throw new Error(`Ningún ejecutor de routing está disponible ahora (${detail || 'lista vacía'}). Revisa "agentrelay providers" y "agentrelay doctor", o vuelve a routing.mode "off".`);
  }
  return { mode: 'auto', entries, current: entry, first: entry.key, failed: [], skipped, switches: [] };
}

function finalize(ctx, result, check, forced = null) {
  const { state, policy, task, root } = ctx;
  let status;
  let reasons = [];

  if (forced) {
    status = forced.status;
    reasons = forced.reasons;
  } else if (isBlocked(result)) {
    status = 'escalated';
    reasons = ['el ejecutor informa de que está bloqueado o pide escalado'];
  } else if (!result.ok || !check.passed) {
    const why = !result.ok ? `el ejecutor ha fallado: ${result.error}` : 'las validaciones no se superan';
    if (policy.autoFix) {
      status = 'escalated';
      reasons = [`${why} tras ${state.retriesUsed} corrección(es)`];
    } else {
      status = 'awaiting_review';
      reasons = [why];
    }
  } else {
    const review = decideReview(policy, task, {
      headMoved: check.headMoved,
      agentReport: result.report,
      validationCount: check.validations.length,
      changedFiles: check.files.length,
    });
    reasons = review.reasons;
    const orchestratorAskedFix = state.reviews.some((r) => r.decision === 'fix');
    if (orchestratorAskedFix) reasons.unshift('corrección solicitada por el orquestador');
    status = review.required || orchestratorAskedFix ? 'awaiting_review' : 'accepted';
    if (status === 'accepted') state.acceptedBy = 'policy';
  }

  state.status = status;
  state.statusReasons = reasons;
  saveState(root, state);
  writeReport(root, state, check.patch);
  ctx.emit({ type: 'status', runId: state.id, status, reasons });
  return state;
}

export function writeReport(root, state, patch) {
  writeRunFile(root, state.id, 'report.md', renderReport(state, patch, state.config.report));
}

/** Comprobación previa del ejecutor configurado: sin ejecutor no tiene sentido gastar reintentos. */
async function preflight(config) {
  const adapter = getExecutor(config.executor.type);
  try {
    await adapter.version(config.executor);
  } catch (error) {
    throw new Error(`El ejecutor ${config.executor.type} no está disponible (${error.message}). Ejecuta "agentrelay doctor".`);
  }
  if (adapter.authStatus) {
    const auth = await adapter.authStatus(config.executor);
    if (!auth.ok) throw new Error(`El ejecutor ${config.executor.type} no tiene sesión iniciada. ${auth.message}`);
  }
  const modelCheck = await checkExecutorModel(config.executor);
  if (!modelCheck.ok) throw new Error(modelCheck.message);
}

/** Inicia una ejecución nueva para una tarea. */
export async function startRun({ root, task, config, allowDirty = false, onEvent }) {
  // Las guías de "references" se comprueban antes de gastar nada: una ruta mal escrita es un error del orquestador.
  // Solo archivos del propio repositorio: una guía fuera de él (../, ruta absoluta) haría leer al ejecutor archivos ajenos.
  const outside = (task.references ?? []).filter((file) => {
    const relative = path.relative(root, path.resolve(root, file));
    return path.isAbsolute(file) || relative.startsWith('..') || path.isAbsolute(relative);
  });
  if (outside.length) throw new Error(`"references" solo admite archivos del repositorio: ${outside.join(', ')}`);
  const missing = (task.references ?? []).filter((file) => !existsSync(path.resolve(root, file)));
  if (missing.length) throw new Error(`No existen estos archivos de "references": ${missing.join(', ')}`);
  const pending = await pendingChanges(root);
  if (pending.length && !allowDirty) {
    throw new Error(
      `El repositorio tiene ${pending.length} cambio(s) sin confirmar. Confírmalos o guárdalos antes de delegar,`
      + ' o usa --allow-dirty (el diff incluirá esos cambios).',
    );
  }

  // Con routing auto el enrutador elige y comprueba el ejecutor; un modelo fijado en la tarea lo desactiva.
  const route = config.routing?.mode === 'auto' && !task.model ? await startRoute(config, task) : null;
  if (!route) await preflight(config);

  ensureWorkspace(root);
  const policy = resolvePolicy(config);
  const id = newRunId();
  createRunDir(root, id);
  const state = {
    id,
    agentrelayVersion: VERSION,
    status: 'running',
    pid: process.pid,
    host: os.hostname(),
    statusReasons: [],
    createdAt: new Date().toISOString(),
    task,
    config,
    policy,
    selfReview: { mode: decideSelfReview(policy, task), pass: null },
    baseline: { head: await head(root), pendingAtStart: pending },
    retriesUsed: 0,
    attempts: [],
    lastCheck: null,
    reviews: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCost: 0 },
    ...(route ? { route } : {}),
  };
  writeRunFile(root, id, 'task.json', `${JSON.stringify(task, null, 2)}\n`);
  saveState(root, state);

  const ctx = context(root, state, onEvent);
  ctx.emit({
    type: 'run_start',
    runId: id,
    title: task.title,
    selfReview: state.selfReview.mode,
  });
  return guard(root, state, async () => continueCycle(ctx, await attempt(ctx, 'implement')));
}

async function guard(root, state, fn) {
  try {
    return await fn();
  } catch (error) {
    state.status = 'failed';
    state.statusReasons = [error.message];
    saveState(root, state);
    throw error;
  }
}

/** Registra la decisión del orquestador sobre una ejecución. */
export async function applyReview({ root, id, decision, feedback = '', force = false, onEvent }) {
  if (!DECISIONS.includes(decision)) throw new Error(`Decisión no válida: ${decision} (${DECISIONS.join(' | ')})`);
  const state = loadState(root, id);
  if (FINAL_STATUSES.includes(state.status)) throw new Error(`La ejecución ${id} ya está cerrada (${state.status})`);
  if (state.status === 'running') throw new Error(`La ejecución ${id} todavía está en curso`);
  if (state.status === 'interrupted' && !['fix', 'reject', 'accept', 'escalate'].includes(decision)) throw new Error(`La ejecución ${id} está interrumpida`);

  const ctx = context(root, state, onEvent);
  const review = { at: new Date().toISOString(), decision, feedback: feedback || null };
  if (decision === 'fix') {
    if (!feedback.trim()) throw new Error('La decisión "fix" necesita --feedback con los problemas a corregir');
    if (state.retriesUsed >= state.policy.maxRetries && !force) {
      throw new Error(
        `Se ha alcanzado el máximo de reintentos (${state.policy.maxRetries}). `
        + 'Escala la tarea (--decision escalate) o usa --force para un intento más.',
      );
    }
    state.reviews.push(review);
    state.retriesUsed += 1;
    state.status = 'running';
    state.pid = process.pid;
    state.host = os.hostname();
    saveState(root, state);
    ctx.emit({ type: 'review', decision, feedback: review.feedback });
    ctx.emit({ type: 'status', runId: state.id, status: 'running', reasons: [] });
    return guard(root, state, async () => {
      const result = await attempt(ctx, 'fix', { feedback, check: state.lastCheck });
      return continueCycle(ctx, result);
    });
  }

  if (decision === 'accept') {
    const check = await evaluate(ctx);
    review.finalCheckPassed = check.passed;
    if (!check.passed && !force) {
      writeReport(root, state, check.patch);
      throw new Error('La validación final no se supera; revisa el informe o usa --force para aceptar igualmente');
    }
    state.reviews.push(review);
    state.status = 'accepted';
    state.acceptedBy = 'orchestrator';
    state.statusReasons = [check.passed ? 'aceptada tras validación final' : 'aceptada con --force sin superar la validación final'];
    saveState(root, state);
    writeReport(root, state, check.patch);
    ctx.emit({ type: 'review', decision, feedback: review.feedback });
    ctx.emit({ type: 'status', runId: state.id, status: 'accepted', reasons: state.statusReasons });
    return state;
  }

  state.reviews.push(review);
  if (decision === 'escalate') {
    state.status = 'escalated';
    state.statusReasons = [feedback || 'el orquestador asume la tarea'];
  } else {
    state.status = 'rejected';
    state.statusReasons = [feedback || 'rechazada por el orquestador; los cambios siguen en el árbol de trabajo'];
  }
  saveState(root, state);
  ctx.emit({ type: 'review', decision, feedback: review.feedback });
  ctx.emit({ type: 'status', runId: state.id, status: state.status, reasons: state.statusReasons });
  return state;
}

/** Vuelve a ejecutar las validaciones sin cambiar el estado (p. ej. tras un cambio manual). */
export async function recheck({ root, id, onEvent }) {
  const state = loadState(root, id);
  if (!['awaiting_review', 'escalated', 'interrupted'].includes(state.status)) throw new Error(`No se puede validar la ejecución ${id} en estado ${state.status}`);
  const ctx = context(root, state, onEvent);
  const check = await evaluate(ctx);
  writeReport(root, state, check.patch);
  return { state, check };
}
