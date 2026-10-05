import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkExecutorModel } from '../src/executor-check.js';

const adapterWith = (ids) => ({ listModels: async () => ids.map((id) => ({ id })) });

test('acepta un modelo presente en la lista', async () => {
  const result = await checkExecutorModel({ type: 'codex', model: 'gpt-6' }, {
    adapter: adapterWith(['gpt-6']),
  });
  assert.deepEqual(result, { ok: true });
});

test('informa cuando el modelo no está disponible', async () => {
  const result = await checkExecutorModel({ type: 'codex', model: 'deepseek-v4-flash' }, {
    adapter: adapterWith(['gpt-6']),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /deepseek-v4-flash/);
  assert.match(result.message, /agentrelay use codex <modelo>/);
  assert.deepEqual(result.models, ['gpt-6']);
});

test('no bloquea si el adaptador no ofrece modelos', async () => {
  assert.deepEqual(await checkExecutorModel({ type: 'codex', model: 'gpt-6' }, { adapter: {} }), {
    ok: true,
    unknown: true,
  });
});

test('no bloquea si la lista está vacía o falla', async () => {
  const empty = await checkExecutorModel({ type: 'cline', model: 'fake' }, { adapter: adapterWith([]) });
  const failed = await checkExecutorModel({ type: 'cline', model: 'fake' }, {
    adapter: { listModels: async () => { throw new Error('fallo'); } },
  });
  assert.deepEqual(empty, { ok: true, unknown: true });
  assert.deepEqual(failed, { ok: true, unknown: true });
});

test('no bloquea si se agota el tiempo de consulta', async () => {
  const result = await checkExecutorModel({ type: 'codex', model: 'gpt-6' }, {
    adapter: { listModels: () => new Promise(() => {}) },
    timeoutMs: 10,
  });
  assert.deepEqual(result, { ok: true, unknown: true });
});

test('OpenCode acepta el modelo con o sin el prefijo opencode/', async () => {
  for (const [configured, available] of [
    ['opencode/nemotron-free', 'opencode/nemotron-free'],
    ['nemotron-free', 'opencode/nemotron-free'],
    ['opencode/nemotron-free', 'nemotron-free'],
  ]) {
    const result = await checkExecutorModel({ type: 'opencode', model: configured }, {
      adapter: adapterWith([available]),
    });
    assert.deepEqual(result, { ok: true });
  }
});

test('limita la lista del mensaje a ocho modelos y añade puntos suspensivos', async () => {
  const result = await checkExecutorModel({ type: 'codex', model: 'missing' }, {
    adapter: adapterWith(Array.from({ length: 10 }, (_, i) => `model-${i + 1}`)),
  });
  assert.match(result.message, /Disponibles: model-1, model-2, model-3, model-4, model-5, model-6, model-7, model-8, …\./);
  assert.doesNotMatch(result.message, /model-9/);
});
