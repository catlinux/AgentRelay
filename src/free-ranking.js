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

export function markExhausted(id, { home = agentrelayHome(), now = new Date(), reason = 'cuota agotada', ttlMs, until: resetAt, resetKnown, source, strikes } = {}) {
  const checks = pruneExhausted(loadChecks(home), now);
  const until = resetAt instanceof Date ? resetAt : ttlMs === undefined ? endOfLocalDay(now) : new Date(now.getTime() + ttlMs);
  const exhausted = checks.exhausted && typeof checks.exhausted === 'object' && !Array.isArray(checks.exhausted)
    ? checks.exhausted
    : {};
  const record = { at: now.toISOString(), until: until.toISOString(), reason };
  if (resetKnown !== undefined) record.resetKnown = Boolean(resetKnown);
  if (source !== undefined) record.source = source;
  if (strikes !== undefined) record.strikes = strikes;
  checks.exhausted = {
    ...exhausted,
    [id]: record,
  };
  saveChecks(checks, home);
  return checks.exhausted[id];
}

export function logQuotaEvent(home, { id, event, until, resetKnown, reason, now = new Date() } = {}) {
  if (!['agotada', 'restablecida'].includes(event)) throw new TypeError('Evento de cuota no válido');
  const checks = loadChecks(home);
  const record = { at: now.toISOString(), id, event };
  if (until instanceof Date) record.until = until.toISOString();
  else if (until !== undefined) record.until = new Date(until).toISOString();
  if (resetKnown !== undefined) record.resetKnown = Boolean(resetKnown);
  if (reason !== undefined) record.reason = reason;
  const quotaLog = Array.isArray(checks.quotaLog) ? checks.quotaLog : [];
  checks.quotaLog = [...quotaLog, record].slice(-30);
  saveChecks(checks, home);
  return record;
}

export function lastQuotaEvent(checks, id) {
  return Array.isArray(checks?.quotaLog) ? [...checks.quotaLog].reverse().find((entry) => entry?.id === id) ?? null : null;
}

export function clearExhausted(home = agentrelayHome(), id) {
  const checks = loadChecks(home);
  if (!checks.exhausted || typeof checks.exhausted !== 'object' || Array.isArray(checks.exhausted) || !(id in checks.exhausted)) return false;
  delete checks.exhausted[id];
  if (Object.keys(checks.exhausted).length === 0) delete checks.exhausted;
  saveChecks(checks, home);
  return true;
}

export function recordQuotaRecovered(id, { home = agentrelayHome(), now = new Date() } = {}) {
  const checks = loadChecks(home);
  const previous = lastQuotaEvent(checks, id);
  if (previous?.event !== 'agotada' && !checks.exhausted?.[id]) return false;
  clearExhausted(home, id);
  logQuotaEvent(home, { id, event: 'restablecida', now });
  return true;
}

export function recordReview(id, decision, { home = agentrelayHome(), now = new Date() } = {}) {
  if (!['accept', 'fix', 'reject', 'escalate'].includes(decision)) return null;
  const checks = loadChecks(home);
  const reviews = checks.reviews && typeof checks.reviews === 'object' && !Array.isArray(checks.reviews)
    ? checks.reviews
    : {};
  const previous = reviews[id] && typeof reviews[id] === 'object' && !Array.isArray(reviews[id])
    ? reviews[id]
    : {};
  const record = { accept: 0, fix: 0, reject: 0, escalate: 0 };
  for (const key of Object.keys(record)) {
    record[key] = Number.isInteger(previous[key]) && previous[key] >= 0 ? previous[key] : 0;
  }
  record[decision] += 1;
  record.last = now.toISOString();
  checks.reviews = { ...reviews, [id]: record };
  saveChecks(checks, home);
  return record;
}

export function reviewNet(checks, id) {
  const reviews = checks?.reviews?.[id];
  return (Number.isInteger(reviews?.accept) ? reviews.accept : 0)
    - (Number.isInteger(reviews?.fix) ? reviews.fix : 0)
    - (Number.isInteger(reviews?.reject) ? reviews.reject : 0)
    - (Number.isInteger(reviews?.escalate) ? reviews.escalate : 0);
}

// Devuelve una lista con .at y .stale no enumerables para conservar el contrato de array.
export function rankedFree(checks, { now = new Date(), max = Infinity, minScore = 1 } = {}) {
  const ranking = checks?.ranking;
  const entries = Array.isArray(ranking?.entries) ? ranking.entries : [];
  const models = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry && typeof entry.id === 'string'
      && Number.isFinite(entry.score) && entry.score >= minScore
      && !isExhausted(checks, entry.id, now))
    .sort((a, b) => Number(b.entry.apt === true) - Number(a.entry.apt === true)
      || (a.entry.tier === 'A' ? 0 : a.entry.tier === 'B' ? 1 : 2)
        - (b.entry.tier === 'A' ? 0 : b.entry.tier === 'B' ? 1 : 2)
      || b.entry.score - a.entry.score
      || reviewNet(checks, b.entry.id) - reviewNet(checks, a.entry.id)
      || a.index - b.index)
    .slice(0, Math.max(0, max))
    .map(({ entry: { id, score, seconds, kind, name, context, reasoning, apt, tier } }) => ({
      id, score, seconds, kind, name, context, reasoning, apt, tier, net: reviewNet(checks, id),
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
