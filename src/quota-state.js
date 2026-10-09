import { agentrelayHome } from './config.js';
import { parseQuotaReset } from './executors/common.js';
import { loadChecks } from './model-check.js';
import { logQuotaEvent, markExhausted, recordQuotaRecovered } from './free-ranking.js';

const MIN_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 8 * 24 * 60 * 60 * 1000;
const BACKOFF_MS = [10 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];

export function markQuotaExhausted(id, {
  home = agentrelayHome(), now = new Date(), errorText = '', reason = 'cuota agotada', unknownDelayMs,
} = {}) {
  const checks = loadChecks(home);
  const previous = checks.exhausted?.[id];
  const strikes = Number.isInteger(previous?.strikes) && previous.strikes > 0
    ? previous.strikes + 1
    : previous ? 2 : 1;
  const reset = parseQuotaReset(errorText, now);
  const resetKnown = Boolean(reset);
  const delayMs = resetKnown
    ? Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, reset.getTime() - now.getTime() + MIN_DELAY_MS))
    : Number.isFinite(unknownDelayMs)
      ? Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, unknownDelayMs))
      : BACKOFF_MS[Math.min(strikes - 1, BACKOFF_MS.length - 1)];
  const until = new Date(now.getTime() + delayMs);
  const record = markExhausted(id, {
    home, now, until, reason, resetKnown, source: resetKnown ? 'error' : 'backoff', strikes,
  });
  logQuotaEvent(home, { id, event: 'agotada', until, resetKnown, reason, now });
  return record;
}

export function markQuotaAvailable(id, { home = agentrelayHome(), now = new Date() } = {}) {
  return recordQuotaRecovered(id, { home, now });
}

function stateFor(checks, id, now) {
  const record = checks.exhausted?.[id];
  const time = Date.parse(record?.until);
  if (!Number.isFinite(time) || time <= now.getTime()) return { state: 'available' };
  if (record.source === 'backoff' || record.resetKnown === false) {
    return { state: 'unknown', nextProbe: new Date(time) };
  }
  return { state: 'exhausted', until: new Date(time), source: 'error' };
}

export function getQuotaState(id, { home = agentrelayHome(), now = new Date() } = {}) {
  const checks = loadChecks(home);
  const provider = typeof id === 'string' ? id.slice(0, id.indexOf('/')) : '';
  const ids = provider ? [id, `provider:${provider}`] : [id];
  const states = ids.map((key) => stateFor(checks, key, now)).filter((entry) => entry.state !== 'available');
  if (states.length === 0) return { state: 'available' };
  return states.reduce((latest, entry) => {
    const latestTime = Date.parse(latest.state === 'unknown' ? latest.nextProbe : latest.until);
    const entryTime = Date.parse(entry.state === 'unknown' ? entry.nextProbe : entry.until);
    if (entryTime > latestTime || (entryTime === latestTime && entry.state === 'exhausted')) return entry;
    return latest;
  });
}

export function isAvailable(id, now = new Date(), { home = agentrelayHome() } = {}) {
  const quota = getQuotaState(id, { home, now });
  if (quota.state === 'available') return true;
  return Date.parse(quota.state === 'unknown' ? quota.nextProbe : quota.until) <= now.getTime();
}
