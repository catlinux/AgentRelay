import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getQuotaState, isAvailable, markQuotaAvailable, markQuotaExhausted } from '../src/quota-state.js';
import { lastQuotaEvent } from '../src/free-ranking.js';
import { loadChecks } from '../src/model-check.js';

function makeHome() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-quota-state-'));
  const home = path.join(root, 'home');
  const previous = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  return {
    home,
    cleanup() {
      if (previous === undefined) delete process.env.AGENTRELAY_HOME;
      else process.env.AGENTRELAY_HOME = previous;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('guarda el reset indicado por el error con un minuto de margen', () => {
  const context = makeHome();
  try {
    const now = new Date('2026-10-09T10:00:00.000Z');
    const record = markQuotaExhausted('vendor/model', {
      home: context.home, now, errorText: '{"resets_in_seconds": 120}', reason: 'sin cuota',
    });
    assert.equal(record.until, new Date(now.getTime() + 180_000).toISOString());
    assert.equal(record.source, 'error');
    assert.equal(record.resetKnown, true);
    assert.equal(record.strikes, 1);
    assert.deepEqual(getQuotaState('vendor/model', { home: context.home, now }), {
      state: 'exhausted', until: new Date(now.getTime() + 180_000), source: 'error',
    });
    assert.deepEqual(lastQuotaEvent(loadChecks(context.home), 'vendor/model'), {
      at: now.toISOString(), id: 'vendor/model', event: 'agotada', until: record.until,
      resetKnown: true, reason: 'sin cuota',
    });
  } finally { context.cleanup(); }
});

test('aplica backoff de 10, 30 y 60 minutos y restablece la racha', () => {
  const context = makeHome();
  try {
    const now = new Date('2026-10-09T10:00:00.000Z');
    const first = markQuotaExhausted('vendor/model', { home: context.home, now });
    assert.equal(first.until, new Date(now.getTime() + 10 * 60_000).toISOString());
    assert.equal(first.source, 'backoff');
    assert.equal(first.resetKnown, false);
    assert.equal(first.strikes, 1);

    const secondAt = new Date(now.getTime() + 10 * 60_000);
    const second = markQuotaExhausted('vendor/model', { home: context.home, now: secondAt });
    assert.equal(second.until, new Date(secondAt.getTime() + 30 * 60_000).toISOString());
    assert.equal(second.strikes, 2);

    const thirdAt = new Date(secondAt.getTime() + 30 * 60_000);
    const third = markQuotaExhausted('vendor/model', { home: context.home, now: thirdAt });
    assert.equal(third.until, new Date(thirdAt.getTime() + 60 * 60_000).toISOString());
    assert.equal(third.strikes, 3);
    assert.deepEqual(getQuotaState('vendor/model', { home: context.home, now: thirdAt }), {
      state: 'unknown', nextProbe: new Date(third.until),
    });

    assert.equal(markQuotaAvailable('vendor/model', { home: context.home, now: thirdAt }), true);
    assert.equal(getQuotaState('vendor/model', { home: context.home, now: thirdAt }).state, 'available');
    assert.equal(lastQuotaEvent(loadChecks(context.home), 'vendor/model').event, 'restablecida');
    const afterRecovery = markQuotaExhausted('vendor/model', { home: context.home, now: thirdAt });
    assert.equal(afterRecovery.until, new Date(thirdAt.getTime() + 10 * 60_000).toISOString());
    assert.equal(afterRecovery.strikes, 1);
  } finally { context.cleanup(); }
});

test('permite mantener fijo en diez minutos el reintento de Codex', () => {
  const context = makeHome();
  try {
    const now = new Date('2026-10-09T10:00:00.000Z');
    markQuotaExhausted('codex:chatgpt', { home: context.home, now, unknownDelayMs: 10 * 60_000 });
    const secondAt = new Date(now.getTime() + 10 * 60_000);
    const second = markQuotaExhausted('codex:chatgpt', {
      home: context.home, now: secondAt, unknownDelayMs: 10 * 60_000,
    });
    assert.equal(second.until, new Date(secondAt.getTime() + 10 * 60_000).toISOString());
    assert.equal(second.strikes, 2);
    assert.equal(second.source, 'backoff');
  } finally { context.cleanup(); }
});

test('aplica la marca del proveedor al modelo y permite reintentar al vencer', () => {
  const context = makeHome();
  try {
    const now = new Date('2026-10-09T10:00:00.000Z');
    const provider = markQuotaExhausted('provider:vendor', {
      home: context.home, now, errorText: '{"resets_in_seconds": 120}',
    });
    assert.deepEqual(getQuotaState('vendor/model', { home: context.home, now }), {
      state: 'exhausted', until: new Date(provider.until), source: 'error',
    });
    assert.equal(isAvailable('vendor/model', new Date(now.getTime() + 179_999), { home: context.home }), false);
    assert.equal(isAvailable('vendor/model', new Date(provider.until), { home: context.home }), true);
  } finally { context.cleanup(); }
});
