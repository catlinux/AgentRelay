import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXECUTOR_DEFAULTS } from '../src/config.js';
import { CODEX_FREE_QUOTA, executorFor, parsePaidEntry, pickEntry, routeEntries } from '../src/router.js';

const rankingChecks = {
  ranking: {
    entries: [
      { id: 'provider/c', score: 3, apt: true, tier: 'B' },
      { id: 'provider/not-apt', score: 99, apt: false, tier: 'A' },
      { id: 'provider/a', score: 2, apt: true, tier: 'A' },
      { id: 'provider/b', score: 10, apt: true, tier: 'B' },
      { id: 'provider/a2', score: 1, apt: true, tier: 'A' },
    ],
  },
};

test('routeEntries ordena Codex gratuito, gratuitos aptos y entradas de pago sin duplicados', () => {
  const entries = routeEntries({
    config: {
      executor: { type: 'codex', model: 'gpt-custom' },
      routing: { paidOrder: ['opencode:fake/paid-a', 'opencode:fake/paid-a', 'codex:gpt-custom', 'codex-api:gpt-paid', 'opencode:provider/paid'] },
    },
    checks: rankingChecks,
  });

  assert.deepEqual(entries.map((entry) => entry.key), [
    'codex:gpt-custom',
    'opencode:provider/a',
    'opencode:provider/a2',
    'opencode:provider/b',
    'opencode:provider/c',
    'opencode:fake/paid-a',
    'codex-api:gpt-paid',
    'opencode:provider/paid',
  ]);
  assert.equal(entries[0].quotaId, CODEX_FREE_QUOTA);
  assert.equal(entries.some((entry) => entry.key === 'opencode:provider/not-apt'), false);
});

test('routeEntries con esfuerzo alto solo incluye gratuitos de nivel A', () => {
  for (const effort of ['high', 'xhigh']) {
    const entries = routeEntries({
      config: { executor: { type: 'opencode', model: 'configured' }, routing: { paidOrder: ['opencode:fake/paid-a'] } },
      checks: rankingChecks,
      effort,
    });

    assert.deepEqual(entries.map((entry) => entry.key), [
      'codex:gpt-6-luna', 'opencode:provider/a', 'opencode:provider/a2', 'opencode:fake/paid-a',
    ]);
  }
});

test('parsePaidEntry reconoce Codex API, OpenCode y rechaza una cadena inválida', () => {
  const codexApi = parsePaidEntry('codex-api:gpt-paid');
  assert.equal(codexApi.type, 'codex');
  assert.equal(codexApi.api, true);
  assert.equal(codexApi.paid, true);
  assert.equal(codexApi.quotaId, 'paid:codex-api:gpt-paid');

  const opencode = parsePaidEntry('opencode:deepseek/deepseek-v4-pro');
  assert.equal(opencode.type, 'opencode');
  assert.equal(opencode.api, false);
  assert.equal(opencode.paid, true);
  assert.equal(opencode.quotaId, 'paid:opencode:deepseek/deepseek-v4-pro');

  assert.equal(parsePaidEntry('cline:deepseek/model'), null);

  assert.equal(parsePaidEntry('not-an-executor'), null);
});

test('pickEntry descarta cuotas agotadas y entradas no utilizables, y respeta exclude', async () => {
  const entries = [
    { key: 'exhausted', quotaId: 'quota-exhausted' },
    { key: 'unusable', quotaId: 'quota-unusable' },
    { key: 'excluded', quotaId: 'quota-excluded' },
    { key: 'usable', quotaId: 'quota-usable' },
  ];
  const checked = [];
  const result = await pickEntry(entries, {
    isAvailable: (quotaId) => quotaId !== 'quota-exhausted',
    isUsable: async (entry) => {
      checked.push(entry.key);
      return entry.key === 'unusable' ? { ok: false, reason: 'modelo no disponible' } : { ok: true };
    },
    exclude: ['excluded'],
  });

  assert.equal(result.entry, entries[3]);
  assert.deepEqual(result.skipped, [
    { key: 'exhausted', reason: 'cuota agotada' },
    { key: 'unusable', reason: 'modelo no disponible' },
  ]);
  assert.deepEqual(checked, ['unusable', 'usable']);
});

test('executorFor conserva los ajustes del mismo tipo y usa los valores por defecto al cambiar', () => {
  const base = {
    type: 'opencode', command: ['node', 'fake-opencode.mjs'], provider: null, model: 'configured',
    thinking: 'high', timeoutSeconds: 45, network: false, extraArgs: ['--custom'],
  };
  const sameType = executorFor({ type: 'opencode', model: 'fake/free-a', api: false }, base);
  assert.deepEqual(sameType.command, base.command);
  assert.equal(sameType.model, 'fake/free-a');
  assert.equal(sameType.provider, null);
  assert.deepEqual(sameType.extraArgs, ['--custom']);

  const codexApi = executorFor({ type: 'codex', model: 'gpt-paid', api: true }, base);
  assert.equal(codexApi.command, EXECUTOR_DEFAULTS.codex.command);
  assert.equal(codexApi.provider, EXECUTOR_DEFAULTS.codex.provider);
  assert.deepEqual(codexApi.extraArgs, []);
  assert.equal(codexApi.apiFallback, false);
  assert.equal(codexApi.forceApi, true);

  const codexFree = executorFor({ type: 'codex', model: 'gpt-free', api: false }, base);
  assert.equal(codexFree.apiFallback, false);
  assert.equal(codexFree.forceApi, false);
});
