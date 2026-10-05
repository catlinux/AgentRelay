import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverFreeModels,
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

test('la caché reciente evita consultar la red y solo conserva opencode', async () => {
  const home = newHome();
  const now = new Date('2026-10-05T12:00:00.000Z');
  let calls = 0;
  try {
    writeCache(home, {
      fetchedAt: '2026-10-05T11:00:00.000Z',
      ...fixture({ 'grok-code': zeroCost() }),
    });
    const stored = JSON.parse(readFileSync(path.join(home, 'models-dev.json'), 'utf8'));
    assert.deepEqual(Object.keys(stored), ['fetchedAt', 'opencode']);
    assert.deepEqual(readCache(home), { fetchedAt: stored.fetchedAt, opencode: stored.opencode });

    const result = await loadFreeMetadata({
      home,
      now,
      fetchFn: async () => { calls += 1; throw new Error('no debe consultar'); },
    });
    assert.equal(calls, 0);
    assert.equal(result.source, 'caché');
    assert.ok(result.models['grok-code']);
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
    assert.deepEqual(result, { models: {}, source: 'sufijo' });
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
    assert.deepEqual(result, { models: {}, source: 'sufijo' });
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
