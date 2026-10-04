// Políticas de orquestación: qué hace cada nivel y cuándo se usa la
// self-review del ejecutor o la revisión del orquestador.
//
// Modos de self-review:
//   none   -> el ejecutor implementa y devuelve el resultado.
//   inline -> el prompt de implementación incluye una lista de autorrevisión
//             (sin coste adicional de ejecuciones).
//   pass   -> además, una segunda ejecución revisa el diff y las validaciones
//             y corrige lo que encuentre.
//
// Revisión del orquestador:
//   on-failure -> solo ante bloqueos, fallos o señales graves.
//   selective  -> cuando hay señales de riesgo.
//   always     -> siempre.

export const SELF_REVIEW_MODES = ['none', 'inline', 'pass'];
export const COMPLEXITIES = ['trivial', 'normal', 'complex'];
export const POLICY_REVIEWS = ['on-failure', 'selective', 'always'];

// Política única de orquestación. Cada valor se puede sustituir con la sección
// "policy" de la configuración.
export const POLICY = Object.freeze({
  name: 'estándar',
  review: 'always',
  maxRetries: 2,
  autoFix: true,
  requireValidation: false,
  selfReview: { trivial: 'none', normal: 'inline', complex: 'pass' },
  skipPassMaxFiles: 1,
});

// Número de archivos modificados a partir del cual la revisión selectiva se activa.
const SELECTIVE_REVIEW_FILES = 5;

export function resolvePolicy(config) {
  const overrides = config.policy || {};
  const policy = { ...POLICY, ...overrides };
  policy.selfReview = { ...POLICY.selfReview, ...(overrides.selfReview || {}) };
  return policy;
}

/** Modo de self-review para una tarea: la tarea puede forzarlo; si no, decide el nivel. */
export function decideSelfReview(policy, task) {
  if (task.selfReview) return task.selfReview;
  return policy.selfReview[task.complexity] || 'inline';
}

/**
 * La pasada separada se omite cuando resulta redundante: el cambio es pequeño
 * y las validaciones objetivas ya lo cubren.
 */
export function shouldRunSelfReviewPass(policy, mode, { changedFiles, validationCount, checkPassed }) {
  if (mode !== 'pass') return { run: false, reason: `modo ${mode}` };
  if (changedFiles === 0) return { run: false, reason: 'no hay cambios que revisar' };
  if (validationCount > 0 && checkPassed && changedFiles <= policy.skipPassMaxFiles) {
    return { run: false, reason: 'cambio pequeño cubierto por validaciones' };
  }
  return { run: true, reason: '' };
}

/**
 * ¿Hace falta la revisión del orquestador? Devuelve los motivos para que el
 * informe explique la decisión.
 */
export function decideReview(policy, task, outcome) {
  const serious = [];
  const risk = [];

  if (outcome.changedFiles === 0) serious.push('el ejecutor no ha realizado cambios');
  if (outcome.headMoved) serious.push('el ejecutor ha creado commits');
  if (outcome.agentReport?.questions?.length) serious.push('el ejecutor tiene dudas');
  if (outcome.validationCount === 0 && policy.requireValidation) {
    serious.push('el nivel exige validaciones y la tarea no tiene');
  }

  if (task.complexity === 'complex') risk.push('tarea compleja');
  if (outcome.validationCount === 0) risk.push('sin validaciones objetivas');
  if (outcome.changedFiles > SELECTIVE_REVIEW_FILES) risk.push(`${outcome.changedFiles} archivos modificados`);
  if (outcome.agentReport?.issues?.length) risk.push('el ejecutor reporta incidencias');

  const reasons = [...serious, ...risk];
  let required;
  if (policy.review === 'always') required = true;
  else if (policy.review === 'selective') required = reasons.length > 0;
  else required = serious.length > 0;

  if (policy.review === 'always') reasons.unshift('la política revisa siempre');
  return { required, reasons };
}
