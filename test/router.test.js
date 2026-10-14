import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXECUTOR_DEFAULTS } from '../src/config.js';
import { CODEX_FREE_QUOTA, executorFor, parsePaidEntry, pickEntry, routeEntries } from '../src/router.js';

test('routeEntries ordena Luna gratis, freeOrder y entradas de pago sin duplicados', () => {
  const entries = routeEntries({
    config: {
      executor: { type: 'codex', model: 'gpt-custom' },
      routing: {
        freeOrder: ['opencode:provider/free-a', 'opencode:provider/free-b', 'opencode:provider/free-a'],
        paidOrder: ['opencode:provider/free-a', 'opencode:fake/paid-a', 'opencode:fake/paid-a', 'codex:gpt-custom', 'codex-api:gpt-paid', 'opencode:provider/paid'],
      },
    },
  });

  assert.deepEqual(entries.map((entry) => entry.key), [
    'codex:gpt-custom',
    'opencode:provider/free-a',
    'opencode:provider/free-b',
    'opencode:fake/paid-a',
    'codex-api:gpt-paid',
    'opencode:provider/paid',
  ]);
  assert.equal(entries[0].quotaId, CODEX_FREE_QUOTA);
  assert.deepEqual(entries[1], {
    key: 'opencode:provider/free-a', type: 'opencode', model: 'provider/free-a', api: false, paid: false,
    quotaId: 'provider/free-a', tier: null, trainsOnData: null, label: 'provider/free-a (gratis)',
  });
});

test('routeEntries con esfuerzo alto omite freeOrder y conserva Luna y las entradas de pago', () => {
  for (const effort of ['high', 'xhigh', 'max']) {
    const entries = routeEntries({
      config: {
        executor: { type: 'opencode', model: 'configured' },
        routing: { freeOrder: ['opencode:provider/free-a'], paidOrder: ['opencode:fake/paid-a'] },
      },
      effort,
    });

    assert.deepEqual(entries.map((entry) => entry.key), [
      'codex:gpt-6-luna', 'opencode:fake/paid-a',
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

test('los modelos con cuota agotada siguen en la lista y se descartan al elegir con su motivo', async () => {
  const entries = routeEntries({
    config: {
      executor: { type: 'opencode' },
      routing: { freeOrder: ['opencode:provider/a', 'opencode:provider/a2'], paidOrder: [] },
    },
  });
  assert.ok(entries.some((entry) => entry.model === 'provider/a'));
  const { entry, skipped } = await pickEntry(entries.filter((candidate) => candidate.type === 'opencode'), {
    isAvailable: (quotaId) => quotaId !== 'provider/a',
  });
  assert.equal(entry.model, 'provider/a2');
  assert.deepEqual(skipped.map((item) => item.reason), ['cuota agotada']);
});
