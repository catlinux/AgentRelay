import { getExecutor } from './executors/index.js';

/** Comprueba si el modelo configurado aparece en la lista del ejecutor. */
export async function checkExecutorModel(executor, { adapter, timeoutMs = 20_000 } = {}) {
  try {
    adapter ??= getExecutor(executor.type);
  } catch {
    return { ok: true, unknown: true };
  }
  if (typeof adapter.listModels !== 'function') return { ok: true, unknown: true };
  // Un proveedor ficticio no tiene una lista verificable; las sugerencias
  // genéricas del adaptador no deben tratarse como una lista autoritativa.
  if (executor.provider === 'fake') return { ok: true, unknown: true };

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Se agotó el tiempo')), timeoutMs);
  });
  let models;
  try {
    models = await Promise.race([adapter.listModels(executor), timeout]);
  } catch {
    return { ok: true, unknown: true };
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(models) || models.length === 0) return { ok: true, unknown: true };
  if (executor.model === null || executor.model === undefined) return { ok: true };

  const ids = models.map((model) => model?.id).filter((id) => typeof id === 'string');
  if (!ids.length) return { ok: true, unknown: true };
  const model = String(executor.model);
  const matches = (id) => id === model
    || (executor.type === 'opencode' && (id.replace(/^opencode\//, '') === model.replace(/^opencode\//, '')));
  if (ids.some(matches)) return { ok: true };

  const available = ids.slice(0, 8);
  if (ids.length > 8) available.push('…');
  return {
    ok: false,
    message: `El modelo «${model}» no está disponible para el ejecutor ${executor.type}. Disponibles: ${available.join(', ')}. Cámbialo con: agentrelay use ${executor.type} <modelo>. Si no sabes de dónde sale este modelo, mira: agentrelay config.`,
    models: ids,
  };
}
