import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isExhausted, markExhausted, rankPosition, rankedFree } from '../src/free-ranking.js';
import { loadChecks, saveChecks } from '../src/model-check.js';

function makeHome() {
  return mkdtempSync(path.join(os.tmpdir(), 'agentrelay-free-ranking-'));
}

test('rankedFree conserva el orden y filtra por score, max y agotamiento', () => {
  const now = new Date('2026-10-05T10:00:00.000Z');
  const checks = {
    lastRun: null,
    models: {},
    exhausted: { 'vendor/second-free': { until: '2026-10-05T11:00:00.000Z' } },
    ranking: {
      at: '2026-10-05T09:00:00.000Z',
      entries: [
        { id: 'vendor/first-free', score: 2, seconds: 8, kind: 'ok', name: 'First', context: 128000, reasoning: true },
        { id: 'vendor/second-free', score: 2, seconds: 7, kind: 'ok' },
        { id: 'vendor/partial-free', score: 1, seconds: 12, kind: 'parcial' },
        { id: 'vendor/failed-free', score: 0, seconds: 2, kind: 'quota' },
      ],
    },
  };

  const models = rankedFree(checks, { now, max: 2 });
  assert.deepEqual(models.map(({ id }) => id), ['vendor/first-free', 'vendor/partial-free']);
  assert.equal(models.at, checks.ranking.at);
  assert.equal(models.stale, false);
  assert.equal(Object.keys(models).includes('at'), false);
  assert.deepEqual(rankedFree(checks, { now, minScore: 2 }).map(({ id }) => id), ['vendor/first-free']);
});

test('markExhausted guarda hasta medianoche local y conserva datos previos', () => {
  const home = makeHome();
  try {
    const now = new Date(2026, 9, 5, 14, 30, 0, 0);
    const previous = {
      lastRun: '2026-10-05',
      models: { 'vendor/model-free': { status: 'approved', checkedAt: now.toISOString() } },
      ranking: { at: now.toISOString(), stoppedBy: null, entries: [{ id: 'vendor/model-free', score: 2 }] },
      exhausted: { 'vendor/old-free': { until: new Date(now.getTime() + 60_000).toISOString() } },
    };
    saveChecks(previous, home);

    const record = markExhausted('vendor/model-free', { home, now, reason: 'sin saldo' });
    const checks = loadChecks(home);

    assert.equal(record.until, new Date(2026, 9, 6).toISOString());
    assert.equal(record.reason, 'sin saldo');
    assert.deepEqual(checks.models, previous.models);
    assert.deepEqual(checks.ranking, previous.ranking);
    assert.deepEqual(checks.exhausted['vendor/old-free'], previous.exhausted['vendor/old-free']);
    assert.deepEqual(checks.exhausted['vendor/model-free'], record);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('isExhausted compara el instante actual con until', () => {
  const checks = { exhausted: { 'vendor/model-free': { until: '2026-10-06T00:00:00.000Z' } } };
  assert.equal(isExhausted(checks, 'vendor/model-free', new Date('2026-10-05T23:59:59.999Z')), true);
  assert.equal(isExhausted(checks, 'vendor/model-free', new Date('2026-10-06T00:00:00.000Z')), false);
  assert.equal(isExhausted(checks, 'vendor/missing-free', new Date('2026-10-05T00:00:00.000Z')), false);
});

test('rankPosition es uno basado y rankedFree queda vacío sin ranquing', () => {
  const checks = { ranking: { entries: [{ id: 'vendor/first-free' }, { id: 'vendor/second-free' }] } };
  assert.equal(rankPosition(checks, 'vendor/second-free'), 2);
  assert.equal(rankPosition(checks, 'vendor/missing-free'), null);
  assert.equal(rankPosition({}, 'vendor/first-free'), null);
  assert.deepEqual(rankedFree({}), []);
});
