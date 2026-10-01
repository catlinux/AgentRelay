import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pidAlive, isOrphaned, lastActivityMs } from '../src/orphans.js';
import { makeRepo } from './helpers.js';
import { main } from '../src/cli.js';

test('pidAlive distinguishes live, impossible and invalid pids', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(2147483646), false);
  assert.equal(pidAlive(0), false);
});

test('isOrphaned checks status, host, liveness and staleness', () => {
  const now = 1000000;
  const recent = new Date(now - 1000).toISOString();
  const stale = new Date(now - 20000).toISOString();
  assert.equal(isOrphaned({ status: 'running', pid: 2, updatedAt: stale }, { now, alive: () => true }), false);
  assert.equal(isOrphaned({ status: 'running', pid: 2, updatedAt: recent }, { now, alive: () => false }), false);
  assert.equal(isOrphaned({ status: 'running', pid: 2, updatedAt: stale }, { now, alive: () => false }), true);
  assert.equal(isOrphaned({ status: 'running', updatedAt: recent }, { now }), false);
  assert.equal(isOrphaned({ status: 'running', updatedAt: new Date(now - 7 * 3600000).toISOString() }, { now }), true);
  assert.equal(isOrphaned({ status: 'running', pid: 2, host: 'elsewhere', updatedAt: stale }, { now, alive: () => false }), false);
  assert.equal(isOrphaned({ status: 'accepted', pid: 2, updatedAt: stale }, { now, alive: () => false }), false);
});

test('lastActivityMs reads event mtime and falls back when absent', () => {
  const repo = makeRepo();
  try {
    const dir = path.join(repo.dir, '.agentrelay', 'runs', 'r'); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ updatedAt: '2020-01-01T00:00:00Z' }));
    const fallback = lastActivityMs(repo.dir, 'r'); assert.equal(fallback, Date.parse('2020-01-01T00:00:00Z'));
    const file = path.join(dir, 'events.ndjson'); writeFileSync(file, '{}\n');
    const when = new Date('2020-01-01T00:00:00Z'); utimesSync(file, when, when);
    assert.equal(lastActivityMs(repo.dir, 'r'), when.getTime());
  } finally { repo.cleanup(); }
});

test('recover converts an orphan and allows check', async (t) => {
  const repo = makeRepo(); const out = []; const oldWrite = process.stdout.write;
  try {
    const dir = path.join(repo.dir, '.agentrelay', 'runs', 'r'); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'events.ndjson'), '{}\n');
    writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ id: 'r', status: 'running', pid: 2147483646, updatedAt: '2020-01-01T00:00:00Z', createdAt: '2020-01-01T00:00:00Z', attempts: [{ n: 1 }], task: { title: 'x', type: 'feature', complexity: 'normal', objective: 'x', acceptanceCriteria: [], validation: [], constraints: [], files: [], doNotModify: [] }, config: { executor: { type: 'codex' }, report: { maxDiffChars: 60000, maxOutputChars: 200 }, validation: { commands: [], timeoutSeconds: 2 } }, policy: { level: 1, name: 'x', review: 'x', maxRetries: 0 }, selfReview: { mode: 'none', pass: null }, usage: { inputTokens: 0, outputTokens: 0 }, retriesUsed: 0, lastCheck: null, reviews: [], baseline: { head: null } }));
    const old = new Date('2020-01-01T00:00:00Z'); utimesSync(path.join(dir, 'events.ndjson'), old, old);
    process.stdout.write = (s) => { out.push(String(s)); return true; }; t.mock.method(process, 'cwd', () => repo.dir);
    assert.equal(await main(['recover', 'r', '--cwd', repo.dir]), 0);
    assert.equal(JSON.parse((await import('node:fs')).readFileSync(path.join(dir, 'state.json'), 'utf8')).status, 'interrupted');
    assert.match(out.join(''), /agentrelay check r/);
    assert.equal((await import('../src/orchestrator.js')).recheck ? true : false, true);
  } finally { process.stdout.write = oldWrite; repo.cleanup(); }
});
