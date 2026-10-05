import { agentrelayHome } from './config.js';
import { loadChecks, saveChecks } from './model-check.js';

export function endOfLocalDay(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export function isExhausted(checks, id, now = new Date()) {
  const until = Date.parse(checks?.exhausted?.[id]?.until);
  return Number.isFinite(until) && until > now.getTime();
}

export function pruneExhausted(checks, now = new Date()) {
  if (!checks?.exhausted || typeof checks.exhausted !== 'object' || Array.isArray(checks.exhausted)) return checks;
  for (const [id, record] of Object.entries(checks.exhausted)) {
    const until = Date.parse(record?.until);
    if (!Number.isFinite(until) || until <= now.getTime()) delete checks.exhausted[id];
  }
  if (Object.keys(checks.exhausted).length === 0) delete checks.exhausted;
  return checks;
}

export function markExhausted(id, { home = agentrelayHome(), now = new Date(), reason = 'cuota agotada' } = {}) {
  const checks = pruneExhausted(loadChecks(home), now);
  const exhausted = checks.exhausted && typeof checks.exhausted === 'object' && !Array.isArray(checks.exhausted)
    ? checks.exhausted
    : {};
  checks.exhausted = {
    ...exhausted,
    [id]: { at: now.toISOString(), until: endOfLocalDay(now).toISOString(), reason },
  };
  saveChecks(checks, home);
  return checks.exhausted[id];
}

// Devuelve una lista con .at y .stale no enumerables para conservar el contrato de array.
export function rankedFree(checks, { now = new Date(), max = Infinity, minScore = 1 } = {}) {
  const ranking = checks?.ranking;
  const entries = Array.isArray(ranking?.entries) ? ranking.entries : [];
  const models = entries
    .filter((entry) => entry && typeof entry.id === 'string'
      && Number.isFinite(entry.score) && entry.score >= minScore
      && !isExhausted(checks, entry.id, now))
    .slice(0, Math.max(0, max))
    .map(({ id, score, seconds, kind, name, context, reasoning }) => ({
      id, score, seconds, kind, name, context, reasoning,
    }));
  const at = ranking?.at ?? null;
  const rankedAt = Date.parse(at);
  Object.defineProperties(models, {
    at: { value: at },
    stale: { value: !Number.isFinite(rankedAt) || now.getTime() - rankedAt > 36 * 60 * 60 * 1000 },
  });
  return models;
}

export function rankPosition(checks, id) {
  const entries = checks?.ranking?.entries;
  if (!Array.isArray(entries)) return null;
  const index = entries.findIndex((entry) => entry?.id === id);
  return index < 0 ? null : index + 1;
}
