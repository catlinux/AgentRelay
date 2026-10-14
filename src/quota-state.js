import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { agentrelayHome } from './config.js';
import { parseQuotaReset } from './executors/common.js';

const MIN_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 14 * 24 * 60 * 60 * 1000;
const BACKOFF_MS = [10 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];

const QUOTA_LOG_LIMIT = 30;

const emptyQuota = () => ({ exhausted: {}, quotaLog: [] });
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const quotaFile = (home = agentrelayHome()) => path.join(home, 'quota.json');

export function loadQuota(home = agentrelayHome()) {
  try {
    const value = JSON.parse(readFileSync(quotaFile(home), 'utf8'));
    if (!isPlainObject(value)) return emptyQuota();
    return {
      exhausted: isPlainObject(value.exhausted) ? value.exhausted : {},
      quotaLog: Array.isArray(value.quotaLog) ? value.quotaLog : [],
    };
  } catch { return emptyQuota(); }
}

function saveQuota(quota, home) {
  mkdirSync(home, { recursive: true });
  writeFileSync(quotaFile(home), `${JSON.stringify(quota, null, 2)}
`, 'utf8');
}

export function isExhausted(quota, id, now = new Date()) {
  const until = Date.parse(quota?.exhausted?.[id]?.until);
  return Number.isFinite(until) && until > now.getTime();
}

export function lastQuotaEvent(quota, id) {
  return Array.isArray(quota?.quotaLog) ? [...quota.quotaLog].reverse().find((entry) => entry?.id === id) ?? null : null;
}

export function clearExhausted(home = agentrelayHome(), id) {
  const quota = loadQuota(home);
  if (!(id in quota.exhausted)) return false;
  delete quota.exhausted[id];
  saveQuota(quota, home);
  return true;
}

function logQuotaEvent(home, { id, event, until, resetKnown, reason, now }) {
  const quota = loadQuota(home);
  const record = { at: now.toISOString(), id, event };
  if (until instanceof Date) record.until = until.toISOString();
  if (resetKnown !== undefined) record.resetKnown = Boolean(resetKnown);
  if (reason !== undefined) record.reason = reason;
  quota.quotaLog = [...quota.quotaLog, record].slice(-QUOTA_LOG_LIMIT);
  saveQuota(quota, home);
}

export function markQuotaAvailable(id, { home = agentrelayHome(), now = new Date() } = {}) {
  const quota = loadQuota(home);
  if (lastQuotaEvent(quota, id)?.event !== 'agotada' && !quota.exhausted[id]) return false;
  clearExhausted(home, id);
  logQuotaEvent(home, { id, event: 'restablecida', now });
  return true;
}

export function markQuotaExhausted(id, {
  home = agentrelayHome(), now = new Date(), errorText = '', reason = 'cuota agotada', unknownDelayMs,
} = {}) {
  const quota = loadQuota(home);
  const previous = quota.exhausted[id];
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
  const record = {
    at: now.toISOString(), until: until.toISOString(), reason, resetKnown, source: resetKnown ? 'error' : 'backoff', strikes,
  };
  for (const [key, value] of Object.entries(quota.exhausted)) {
    if (!(Date.parse(value?.until) > now.getTime())) delete quota.exhausted[key];
  }
  quota.exhausted[id] = record;
  saveQuota(quota, home);
  logQuotaEvent(home, { id, event: 'agotada', until, resetKnown, reason, now });
  return record;
}

function stateFor(quota, id, now) {
  const record = quota.exhausted[id];
  const time = Date.parse(record?.until);
  if (!Number.isFinite(time) || time <= now.getTime()) return { state: 'available' };
  if (record.source === 'backoff' || record.resetKnown === false) {
    return { state: 'unknown', nextProbe: new Date(time) };
  }
  return { state: 'exhausted', until: new Date(time), source: 'error' };
}

export function getQuotaState(id, { home = agentrelayHome(), now = new Date() } = {}) {
  const quota = loadQuota(home);
  const provider = typeof id === 'string' ? id.slice(0, id.indexOf('/')) : '';
  const ids = provider ? [id, `provider:${provider}`] : [id];
  const states = ids.map((key) => stateFor(quota, key, now)).filter((entry) => entry.state !== 'available');
  if (states.length === 0) return { state: 'available' };
  return states.reduce((latest, entry) => {
    const latestTime = Date.parse(latest.state === 'unknown' ? latest.nextProbe : latest.until);
    const entryTime = Date.parse(entry.state === 'unknown' ? entry.nextProbe : entry.until);
    if (entryTime > latestTime || (entryTime === latestTime && entry.state === 'exhausted')) return entry;
    return latest;
  });
}

export function isAvailable(id, now = new Date(), { home = agentrelayHome() } = {}) {
  const state = getQuotaState(id, { home, now });
  if (state.state === 'available') return true;
  return Date.parse(state.state === 'unknown' ? state.nextProbe : state.until) <= now.getTime();
}
