import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PRICES, estimateCost, loadPrices, localWindows, nextChange, tariffAt } from '../src/pricing.js';
import { main, showDeepSeekNotice } from '../src/cli.js';
import { createOutput } from '../src/output.js';

test('tarifas DeepSeek y siguientes cambios UTC', () => {
  for (const [hour, period] of [[0, 'offpeak'], [1, 'peak'], [3, 'peak'], [4, 'offpeak'], [5, 'offpeak'], [6, 'peak'], [9, 'peak'], [10, 'offpeak'], [23, 'offpeak']]) assert.equal(tariffAt(new Date(`2026-10-01T${String(hour).padStart(2, '0')}:00:00Z`)).period, period);
  assert.equal(tariffAt(new Date('2026-10-03T02:00:00Z')).period, 'offpeak');
  assert.equal(tariffAt(new Date('2026-10-04T07:00:00Z')).period, 'offpeak');
  assert.equal(nextChange(new Date('2026-10-02T10:30:00Z')).toISOString(), '2026-10-05T01:00:00.000Z');
  assert.equal(nextChange(new Date('2026-10-01T00:30:00Z')).toISOString(), '2026-10-01T01:00:00.000Z');
});

test('ventanas locales convierten instantes en varios husos', () => {
  const date = new Date('2026-10-01T12:00:00Z');
  assert.equal(localWindows(date, 'Europe/Madrid'), '03:00-06:00 y 08:00-12:00');
  assert.equal(localWindows(date, 'America/New_York'), '21:00-00:00 y 02:00-06:00');
  assert.equal(localWindows(date, 'UTC'), '01:00-04:00 y 06:00-10:00');
});

test('estimateCost separa caché, entrada y salida; alias y desconocidos', () => {
  const usage = { inputTokens: 1_000_000, cacheReadTokens: 200_000, outputTokens: 100_000 };
  assert.equal(estimateCost(usage, 'deepseek-flash', 'offpeak', DEFAULT_PRICES), 0.1806);
  assert.equal(estimateCost(usage, 'deepseek-flash', 'peak', DEFAULT_PRICES), 0.3612);
  assert.equal(estimateCost(usage, 'deepseek-v4-flash', 'peak', DEFAULT_PRICES), estimateCost(usage, 'deepseek-flash', 'peak', DEFAULT_PRICES));
  assert.equal(estimateCost({}, 'nope', 'peak', DEFAULT_PRICES), null);
  assert.equal(estimateCost(null, 'deepseek-flash', 'peak', DEFAULT_PRICES), null);
});

test('loadPrices combina overrides parciales y describe JSON/números inválidos', () => {
  const home = path.join(os.tmpdir(), `agentrelay-pricing-${process.pid}-${Date.now()}`); mkdirSync(home, { recursive: true });
  const file = path.join(home, 'pricing.json');
  try {
    writeFileSync(file, JSON.stringify({ 'deepseek-v4-pro': { output: { peak: 7 } } }));
    assert.equal(loadPrices(home)['deepseek-v4-pro'].output.peak, 7);
    assert.equal(loadPrices(home)['deepseek-v4-pro'].output.offpeak, 1.98);
    writeFileSync(file, '{'); assert.throws(() => loadPrices(home), /pricing\.json.*JSON/);
    writeFileSync(file, JSON.stringify({ 'deepseek-v4-pro': { output: { peak: -1 } } })); assert.throws(() => loadPrices(home), /pricing\.json.*números/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('pricing imprime precios oficiales y estructura JSON', async () => {
  const writes = [], original = process.stdout.write;
  try {
    process.stdout.write = (chunk, encoding, callback) => { writes.push(typeof chunk === 'string' ? chunk : chunk.toString(encoding || 'utf8')); if (typeof encoding === 'function') encoding(); if (callback) callback(); return true; };
    const runtime = { clock: () => new Date('2026-10-01T00:30:00Z'), timeZone: 'Europe/Madrid' };
    assert.equal(await main(['pricing'], runtime), 0);
    assert.match(writes.join(''), /0,003 \/ 0,006/);
    assert.match(writes.join(''), /USD por millón de tokens\nModelo/);
    assert.match(writes.join(''), /hoy a las 03:00/);
    assert.match(writes.join(''), /festivos chinos/);
    writes.length = 0;
    assert.equal(await main(['pricing', '--json'], runtime), 0);
    const data = JSON.parse(writes.at(-1));
    assert.equal(data.prices['deepseek-v4-pro'].input_miss.peak, 1.32);
    assert.equal(data.source.checkedAt, '2026-10-01');
    assert.ok(data.overrideFile.endsWith('pricing.json'));
    assert.equal(data.current.localChangesAt, 'hoy a las 03:00');
    writes.length = 0;
    const tomorrowRuntime = { clock: () => new Date('2026-10-01T10:30:00Z'), timeZone: 'Europe/Madrid' };
    assert.equal(await main(['pricing', '--json'], tomorrowRuntime), 0);
    assert.equal(JSON.parse(writes.at(-1)).current.localChangesAt, 'mañana a las 03:00');
  } finally { process.stdout.write = original; }
});

test('aviso de inicio usa tarifa UTC inyectable, respeta quiet y omite Codex', () => {
  const out = { value: '', write(text) { this.value += text; } };
  const output = createOutput({ stdout: out });
  const runtime = { clock: () => new Date('2026-10-01T02:00:00Z'), timeZone: 'UTC', output };
  showDeepSeekNotice('deepseek-v4-pro', {}, runtime);
  assert.match(out.value, /Tarifa DeepSeek ahora: punta/);
  assert.match(out.value, /hasta las 04:00 \(hora local\)/);
  assert.match(out.value, /01:00-04:00 y 06:00-10:00/);
  out.value = '';
  showDeepSeekNotice('deepseek-v4-pro', { quiet: true }, { ...runtime, output: createOutput({ quiet: true, stdout: out }) });
  showDeepSeekNotice('gpt-6-luna', {}, runtime);
  assert.equal(out.value, '');
});
