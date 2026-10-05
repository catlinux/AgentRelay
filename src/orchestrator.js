// Flujo de una ejecución:
//
//   implementar -> validar -> (corregir automáticamente mientras haya reintentos)
//   -> (self-review en pasada separada, si procede) -> decidir si hace falta
//   revisión del orquestador -> aceptada | pendiente de revisión | escalada
//
// La revisión del orquestador llega después con applyReview():
//   accept (con validación final) | fix (nuevo intento) | escalate | reject

import path from 'node:path';
import os from 'node:os';
import { getExecutor } from './executors/index.js';
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
import { classifyExecutorError, maskSecrets } from './executors/common.js';
import { isInstalled } from './executors/catalog.js';
import { loadChecks } from './model-check.js';
import { alternativesHint } from './alternatives.js';
import { checkExecutorModel } from './executor-check.js';
import { agentrelayHome } from './config.js';
import { markExhausted } from './free-ranking.js';

export const DECISIONS = ['accept', 'fix', 'escalate', 'reject'];
const FINAL_STATUSES = ['accepted', 'rejected'];

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
    executor: getExecutor(config.executor.type),
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
  const common = { validationCommands: ctx.validationCommands, selfReview: state.selfReview.mode };

  let prompt;
  if (kind === 'implement') prompt = buildImplementPrompt(task, common);
  else if (kind === 'fix') {
    prompt = buildFixPrompt(task, {
      ...common, feedback, validations: check?.validations, scopeViolations: check?.scopeViolations,
    });
  } else {
    prompt = buildSelfReviewPrompt(task, {
      validationCommands: ctx.validationCommands, changedFiles: check.files, diff: check.patch, validations: check.validations,
    });
  }

  const base = `attempt-${n}-${kind}`;
  writeRunFile(root, state.id, `${base}.prompt.md`, prompt);
  const executor = {
    ...config.executor,
    thinking: task.effort ?? config.executor.thinking,
    model: task.model ?? config.executor.model,
  };
  const { provider, model } = executor;
  ctx.emit({ type: 'attempt_start', attempt: n, kind, provider, model });

  const startedAt = new Date().toISOString();
  const result = await ctx.executor.run({
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
  saveState(root, state);

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
  const violations = scopeViolations(diff.files, task.doNotModify);
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
      const errorKind = classifyExecutorError(`${result.error ?? ''} ${result.rawError ?? ''}`);
      if (errorKind) {
        let reason = errorKind === 'credentials'
          ? 'problema de credenciales del ejecutor: revisa con `agentrelay doctor` y vuelve a configurar la sesión con `agentrelay login` o la clave de API del proveedor'
          : 'problema de cuota o saldo del ejecutor: revisa el saldo o plan del proveedor o elige otro ejecutor.';
        if (errorKind === 'quota') {
          if (ctx.config.executor.type === 'opencode' && ctx.config.executor.model) {
            try { markExhausted(ctx.config.executor.model, { home: agentrelayHome() }); } catch {}
          }
          try {
            const installed = {
              opencode: await isInstalled('opencode'),
              cline: await isInstalled('cline'),
            };
            reason += `\n${alternativesHint({ current: ctx.config.executor, checks: loadChecks(), installed })}`;
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

/** Inicia una ejecución nueva para una tarea. */
export async function startRun({ root, task, config, allowDirty = false, onEvent }) {
  const pending = await pendingChanges(root);
  if (pending.length && !allowDirty) {
    throw new Error(
      `El repositorio tiene ${pending.length} cambio(s) sin confirmar. Confírmalos o guárdalos antes de delegar,`
      + ' o usa --allow-dirty (el diff incluirá esos cambios).',
    );
  }

  // Comprobación previa: sin ejecutor no tiene sentido gastar reintentos.
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
