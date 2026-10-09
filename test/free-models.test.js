import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverFreeModels,
  discoverProviderModels,
  fetchModelsDev,
  loadFreeMetadata,
  readCache,
  writeCache,
} from '../src/free-models.js';

const fixture = (models) => ({ opencode: { models }, other: { models: { ignored: {} } } });
const zeroCost = (extra = {}) => ({ cost: { input: 0, output: 0 }, ...extra });
const response = (data) => ({ ok: true, status: 200, json: async () => data });
const newHome = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-free-models-'));

test('detecta gratuitos sin sufijo y excluye modelos -free con coste', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/grok-code', { id: 'opencode/big-pickle' }, 'opencode/paid-free'],
    metadata: {
      'grok-code': zeroCost({ name: 'Grok Code' }),
      'big-pickle': zeroCost({ name: 'Big Pickle' }),
      'paid-free': { cost: { input: 1, output: 1 } },
    },
    source: 'red',
  });

  assert.deepEqual(candidates.map(({ id, reason }) => ({ id, reason })), [
    { id: 'opencode/grok-code', reason: 'metadatos' },
    { id: 'opencode/big-pickle', reason: 'metadatos' },
  ]);
});

test('usa el sufijo cuando falta metadata para un modelo listado', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/model-free', 'opencode/paid'],
    metadata: { paid: { cost: { input: 2, output: 3 } } },
    source: 'red',
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].reason, 'sufijo');
  assert.equal(candidates[0].listed, true);
});

test('incluye precio desconocido solo cuando hay metadatos parciales disponibles', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/unknown-price', 'opencode/incomplete-price', 'opencode/model-free', 'opencode/paid-free', 'opencode/paid'],
    metadata: {
      'incomplete-price': { cost: { input: 0 } },
      'paid-free': { cost: { input: 1, output: 1 } },
      paid: { cost: { input: 2, output: 3 } },
    },
    source: 'red',
  });
  assert.deepEqual(candidates.map(({ id, reason, listed }) => ({ id, reason, listed })), [
    { id: 'opencode/model-free', reason: 'sufijo', listed: true },
    { id: 'opencode/unknown-price', reason: 'sin precio conocido', listed: true },
    { id: 'opencode/incomplete-price', reason: 'sin precio conocido', listed: true },
  ]);
});

test('sin metadatos solo considera candidatos con sufijo -free', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/unknown-price', 'opencode/model-free'],
    metadata: {},
    source: 'sufijo',
  });
  assert.deepEqual(candidates.map(({ id, reason }) => ({ id, reason })), [
    { id: 'opencode/model-free', reason: 'sufijo' },
  ]);
});

test('la caché reciente evita consultar la red y conserva varios proveedores', async () => {
  const home = newHome();
  const now = new Date('2026-10-05T12:00:00.000Z');
  let calls = 0;
  try {
    writeCache(home, {
      fetchedAt: '2026-10-05T11:00:00.000Z',
      opencode: { models: { 'grok-code': zeroCost() } },
      providers: {
        opencode: { models: { 'grok-code': zeroCost() } },
        groq: { models: { llama: zeroCost() } },
        invalid: { models: null },
      },
    });
    const stored = JSON.parse(readFileSync(path.join(home, 'models-dev.json'), 'utf8'));
    assert.deepEqual(Object.keys(stored), ['fetchedAt', 'opencode', 'providers']);
    assert.deepEqual(Object.keys(readCache(home).providers), ['opencode', 'groq']);

    const result = await loadFreeMetadata({
      home,
      now,
      fetchFn: async () => { calls += 1; throw new Error('no debe consultar'); },
    });
    assert.equal(calls, 0);
    assert.equal(result.source, 'caché');
    assert.ok(result.models['grok-code']);
    assert.ok(result.providers.groq.llama);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('si la red falla usa la caché caducada', async () => {
  const home = newHome();
  const now = new Date('2026-10-05T12:00:00.000Z');
  try {
    writeCache(home, {
      fetchedAt: '2026-10-03T11:59:59.000Z',
      ...fixture({ 'big-pickle': zeroCost() }),
    });
    const result = await loadFreeMetadata({
      home,
      now,
      fetchFn: async () => { throw new Error('sin red'); },
    });
    assert.equal(result.source, 'caché caducada');
    assert.ok(result.models['big-pickle']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('sin red ni caché degrada al sufijo y no lanza errores', async () => {
  const home = newHome();
  try {
    const result = await loadFreeMetadata({
      home,
      fetchFn: async () => { throw new Error('sin red'); },
    });
    assert.deepEqual(result, { models: {}, source: 'sufijo', providers: {} });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('una caché corrupta se ignora', async () => {
  const home = newHome();
  try {
    writeFileSync(path.join(home, 'models-dev.json'), '{ roto', 'utf8');
    assert.equal(readCache(home), null);
    const result = await loadFreeMetadata({ home, fetchFn: async () => { throw new Error('sin red'); } });
    assert.deepEqual(result, { models: {}, source: 'sufijo', providers: {} });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descarga datos válidos y explica respuestas sin proveedor opencode', async () => {
  const data = fixture({ 'grok-code': zeroCost() });
  assert.deepEqual(await fetchModelsDev({ fetchFn: async () => response(data) }), data);
  await assert.rejects(
    fetchModelsDev({ fetchFn: async () => response({ another: {} }) }),
    /proveedor opencode válido/,
  );
  await assert.rejects(
    fetchModelsDev({ fetchFn: async () => ({ ok: true, json: async () => { throw new Error('parse'); } }) }),
    /JSON válido/,
  );
});

test('lee cachés antiguas que solo contienen opencode', async () => {
  const home = newHome();
  const fetchedAt = '2026-10-05T11:00:00.000Z';
  const opencode = { models: { 'grok-code': zeroCost() } };
  try {
    writeFileSync(path.join(home, 'models-dev.json'), JSON.stringify({ fetchedAt, opencode }), 'utf8');
    assert.deepEqual(readCache(home), { fetchedAt, opencode, providers: { opencode } });
    const result = await loadFreeMetadata({ home, now: new Date('2026-10-05T12:00:00.000Z') });
    assert.deepEqual(result, { models: opencode.models, source: 'caché', providers: { opencode: opencode.models } });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('carga y guarda proveedores con modelos válidos desde models.dev', async () => {
  const home = newHome();
  const data = {
    opencode: { models: { zen: zeroCost() } },
    groq: { models: { llama: zeroCost() } },
    invalid: { models: null },
  };
  try {
    const result = await loadFreeMetadata({
      home,
      now: new Date('2026-10-05T12:00:00.000Z'),
      fetchFn: async () => response(data),
    });
    assert.deepEqual(result, {
      models: data.opencode.models,
      source: 'red',
      providers: { opencode: data.opencode.models, groq: data.groq.models },
    });
    assert.deepEqual(Object.keys(readCache(home).providers), ['opencode', 'groq']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('descubre modelos gratuitos conectados con filtros de metadatos y modelos activos', () => {
  const model = (extra = {}) => ({
    cost: { input: 0, output: 0 }, tool_call: true, limit: { context: 64000 }, ...extra,
  });
  const found = discoverProviderModels({
    connected: ['groq', 'google', 'mistral', 'nvidia'],
    providers: {
      groq: {
        newer: model({ name: 'New', release_date: '2026-01-01', reasoning: true }),
        older: model({ name: 'Old', release_date: '2025-01-01' }),
        undated: model(),
        paid: model({ cost: { input: 1, output: 0 } }),
        noTools: model({ tool_call: false }),
        small: model({ limit: { context: 63999 } }),
        retired: model(),
      },
      google: { gemini: model({ release_date: '2025-06-01' }) },
      nvidia: { audioFree: model({ modalities: { output: ['audio'] } }) },
      ignored: { model: model({ release_date: '2027-01-01' }) },
    },
    live: { groq: ['newer', 'older', 'undated', 'paid', 'noTools', 'small'] },
  });
  assert.deepEqual(found.map(({ id }) => id), [
    'groq/newer', 'google/gemini', 'groq/older', 'groq/undated',
  ]);
  assert.deepEqual(found[0], {
    id: 'groq/newer', provider: 'groq', name: 'New', context: 64000, reasoning: true, releaseDate: '2026-01-01',
    freeTier: false, cost: { input: 0, output: 0 },
  });
});

test('incluye modelos de proveedores con nivel gratuito solo cuando se indica', () => {
  const model = (extra = {}) => ({
    cost: { input: 0.1, output: 0.2 }, tool_call: true, limit: { context: 64000 }, ...extra,
  });
  const providers = {
    groq: { llama: model() },
    google: { gemini: model() },
    mistral: { large: model() },
  };
  const options = { providers, connected: ['groq', 'google', 'mistral'] };
  assert.deepEqual(discoverProviderModels(options), []);
  assert.deepEqual(
    discoverProviderModels({ ...options, freeTierProviders: ['groq', 'google', 'mistral'] }).map(({ id, freeTier, cost }) => ({ id, freeTier, cost })),
    [
      { id: 'groq/llama', freeTier: true, cost: { input: 0.1, output: 0.2 } },
      { id: 'google/gemini', freeTier: true, cost: { input: 0.1, output: 0.2 } },
      { id: 'mistral/large', freeTier: true, cost: { input: 0.1, output: 0.2 } },
    ],
  );
});

test('los modelos de nivel gratuito descartan salidas solo de audio, imagen o embeddings', () => {
  const model = (modalities) => ({ tool_call: true, limit: { context: 64000 }, ...(modalities ? { modalities } : {}) });
  const found = discoverProviderModels({
    connected: ['groq'],
    freeTierProviders: ['groq'],
    providers: { groq: {
      audio: model({ input: ['text'], output: ['audio'] }),
      image: model({ input: ['text'], output: ['image'] }),
      embedding: model({ input: ['text'], output: ['embedding'] }),
      text: model({ input: ['text'], output: ['text'] }),
      missing: model(),
    } },
  });
  assert.deepEqual(found.map(({ id }) => id), ['groq/text', 'groq/missing']);
});

test('ordena primero coste cero y después coste de entrada y fecha', () => {
  const model = (cost, release_date) => ({
    cost, release_date, tool_call: true, limit: { context: 64000 },
  });
  const found = discoverProviderModels({
    connected: ['groq', 'google'],
    freeTierProviders: ['groq', 'google'],
    providers: {
      groq: {
        zero: model({ input: 0, output: 0 }, '2024-01-01'),
        expensive: model({ input: 0.2, output: 0.3 }, '2026-01-01'),
        cheapOld: model({ input: 0.1, output: 0.3 }, '2024-01-01'),
      },
      google: { cheapNew: model({ input: 0.1, output: 0.3 }, '2025-01-01') },
    },
  });
  assert.deepEqual(found.map(({ id }) => id), ['groq/zero', 'google/cheapNew', 'groq/cheapOld', 'groq/expensive']);
});

test('ordena los candidatos por fecha de lanzamiento y deja los desconocidos al final', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/older-free', 'opencode/unknown-free', 'opencode/newer-free'],
    metadata: {
      'older-free': zeroCost({ release_date: '2025-01-01' }),
      'newer-free': zeroCost({ release_date: '2026-01-01' }),
    },
    source: 'red',
  });
  assert.deepEqual(candidates.map(({ id }) => id), [
    'opencode/newer-free', 'opencode/older-free', 'opencode/unknown-free',
  ]);
});

test('informa modelos gratuitos que la cuenta no lista', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/listed'],
    metadata: { listed: zeroCost(), 'grok-code': zeroCost() },
    source: 'red',
  });
  assert.deepEqual(candidates.unlisted, ['opencode/grok-code']);
  assert.deepEqual(candidates.map(({ id, reason, listed }) => ({ id, reason, listed })), [
    { id: 'opencode/listed', reason: 'metadatos', listed: true },
    { id: 'opencode/grok-code', reason: 'metadatos, no listado', listed: false },
  ]);
});

test('puede excluir los no listados sin perder la propiedad unlisted', () => {
  const candidates = discoverFreeModels({
    listed: [],
    metadata: { 'grok-code': zeroCost() },
    source: 'red',
    includeUnlisted: false,
  });
  assert.equal(candidates.length, 0);
  assert.deepEqual(candidates.unlisted, ['opencode/grok-code']);
});

test('ordena listados gratuitos, listados desconocidos y no listados en ese orden', () => {
  const candidates = discoverFreeModels({
    listed: ['opencode/unknown-price', 'opencode/listed-old', 'opencode/suffix-free', 'opencode/listed-new'],
    metadata: {
      'listed-old': zeroCost({ release_date: '2024-01-01' }),
      'listed-new': zeroCost({ release_date: '2026-01-01' }),
      'unknown-unlisted': zeroCost({ release_date: '2027-01-01' }),
      'unknown-price-anchor': zeroCost(),
    },
    source: 'red',
  });
  assert.deepEqual(candidates.map(({ id, reason }) => ({ id, reason })), [
    { id: 'opencode/listed-new', reason: 'metadatos' },
    { id: 'opencode/listed-old', reason: 'metadatos' },
    { id: 'opencode/suffix-free', reason: 'sufijo' },
    { id: 'opencode/unknown-price', reason: 'sin precio conocido' },
    { id: 'opencode/unknown-unlisted', reason: 'metadatos, no listado' },
    { id: 'opencode/unknown-price-anchor', reason: 'metadatos, no listado' },
  ]);
});

test('discoverFreeModels ignora los modelos de otros proveedores aunque no tengan precio conocido', () => {
  const metadata = { 'big-pickle': { name: 'Big Pickle', cost: { input: 0, output: 0 } }, 'gpt-5': { cost: { input: 1, output: 2 } } };
  const found = discoverFreeModels({ listed: ['opencode/big-pickle', 'opencode/gpt-5', 'ollama/gpt-oss:120b-cloud', 'ollama/qwen3:8b', 'opencode/modelo-nuevo'], metadata, source: 'red' });
  const ids = found.map((candidate) => candidate.id);
  assert.ok(ids.includes('opencode/big-pickle'));
  assert.ok(ids.includes('opencode/modelo-nuevo'));
  assert.ok(!ids.some((id) => id.startsWith('ollama/')));
  assert.ok(!ids.includes('opencode/gpt-5'));
});

test('discoverProviderModels descarta los modelos que generan imágenes o audio', () => {
  const model = (output) => ({ tool_call: true, limit: { context: 128000 }, cost: { input: 0.1, output: 0.2 }, modalities: { input: ['text'], output } });
  const found = discoverProviderModels({
    providers: { google: { texto: model(['text']), imagen: model(['text', 'image']), voz: model(['audio']) } },
    connected: ['google'],
    freeTierProviders: ['google'],
  });
  assert.deepEqual(found.map(({ id }) => id), ['google/texto']);
});
