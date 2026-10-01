import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

export function isOrphaned(state, { now = Date.now(), lastEventMs, alive = pidAlive, graceMs = 15000, unknownPidStaleMs = 6 * 3600 * 1000 } = {}) {
  if (state?.status !== 'running') return false;
  if (state.host && state.host !== os.hostname()) return false;
  const updated = Date.parse(state.updatedAt);
  const activity = Math.max(Number.isFinite(lastEventMs) ? lastEventMs : -Infinity, Number.isFinite(updated) ? updated : -Infinity);
  if (!Number.isFinite(activity)) return false;
  if (state.pid !== undefined && state.pid !== null) return !alive(state.pid) && now - activity > graceMs;
  return now - activity > unknownPidStaleMs;
}

export function lastActivityMs(root, id) {
  const file = path.join(root, '.agentrelay', 'runs', id, 'events.ndjson');
  try { if (existsSync(file)) return statSync(file).mtimeMs; } catch {}
  try {
    const state = JSON.parse((awaitReadState(root, id)));
    const updated = Date.parse(state.updatedAt);
    return Number.isFinite(updated) ? updated : NaN;
  } catch {}
  return NaN;
}

function awaitReadState(root, id) {
  return requireReadFile(path.join(root, '.agentrelay', 'runs', id, 'state.json'));
}

function requireReadFile(file) {
  return readFileSync(file, 'utf8');
}
