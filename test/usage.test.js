import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeRepo } from './helpers.js';
import { aggregateUsage, formatDuration, renderUsage } from '../src/usage.js';
import { main } from '../src/cli.js';

function save(repo, id, overrides = {}) {
  const dir = path.join(repo.dir, '.agentrelay', 'runs', id);
  mkdirSync(dir, { recursive: true });
  const state = {
    id, status: 'accepted', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
    config: { executor: { type: 'codex', model: 'fallback' } }, retriesUsed: 0,
    attempts: [{ n: 1, durationMs: 65000, model: { id: 'gpt-6-luna' }, usage: { inputTokens: 1200, outputTokens: 200, cacheReadTokens: 300 } }],
    ...overrides,
  };
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
}

test('usage agrupa executor/modelo, suma consumo y aplica filtros', () => {
  const repo = makeRepo();
  try {
    save(repo, 'one', { retriesUsed: 1, attempts: [{ n: 1, durationMs: 65000, model: { id: 'gpt-6-luna' }, usage: { inputTokens: 1200, outputTokens: 200, cacheReadTokens: 300, totalCost: 0 } }] });
    save(repo, 'two', { status: 'escalated', config: { executor: { type: 'cline', model: 'x' } }, attempts: [{ durationMs: 1000, model: { id: 'deepseek-v4-pro' }, usage: { inputTokens: 5, outputTokens: 6, cacheReadTokens: 7, totalCost: 0.125 } }] });
    save(repo, 'z-three', { attempts: [{ n: 1, durationMs: 20, model: { id: 'other-model' }, usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, totalCost: 0.2 } }] });
    const result = aggregateUsage(repo.dir, { now: Date.parse('2026-10-02T10:00:00Z') });
    assert.equal(result.groups.length, 3);
    assert.equal(result.groups[0].inputTokens, 1200);
    assert.equal(result.groups[0].estimatedCost, null);
    assert.ok(result.groups[1].estimatedCost > 0);
    assert.equal(result.groups[1].estimatedCostSource, 'agentrelay');
    assert.equal(result.groups[2].estimatedCostSource, 'executor');
    assert.equal(result.totals.estimatedCostSource, 'mixed');
    assert.equal(result.totals.retries, 1);
    assert.equal(result.totals.escalatedRejected, 1);
    assert.equal(aggregateUsage(repo.dir, { executor: 'codex' }).totals.executions, 2);
    assert.equal(aggregateUsage(repo.dir, { since: '24h', now: Date.parse('2026-10-02T10:00:01Z') }).totals.executions, 0);
    assert.equal(aggregateUsage(repo.dir, { since: '2026-10-01' }).totals.executions, 3);
    assert.match(renderUsage(result), /USD \(estimado por AgentRelay\)/);
    assert.equal(result.groups[0].estimatedCostSource, null);
    const table = renderUsage(result).split('\n');
    assert.ok(table[1].indexOf('gpt-6-luna') < table[1].indexOf('1,2 mil'));
    assert.ok(!table[1].includes(' | '));
    assert.equal(JSON.parse(JSON.stringify(result)).groups[0].estimatedCost, null);
  } finally { repo.cleanup(); }
});

test('usage cuenta estados ilegibles y ejecuciones obsoletas, y formatea duraciÃ³n', () => {
  const repo = makeRepo();
  try {
    save(repo, 'old', { status: 'running', updatedAt: '2026-09-30T00:00:00Z' });
    const bad = path.join(repo.dir, '.agentrelay', 'runs', 'bad');
    mkdirSync(bad, { recursive: true }); writeFileSync(path.join(bad, 'state.json'), '{');
    const result = aggregateUsage(repo.dir, { now: Date.parse('2026-10-01T10:00:00Z') });
    assert.equal(result.unreadable, 1); assert.equal(result.stale, 1);
    assert.match(renderUsage(result), /1 ejecución.*interrumpida/);
    assert.equal(formatDuration(3900000), '1 h 05 min');
    assert.equal(formatDuration(723000), '12 min 03 s');
  } finally { repo.cleanup(); }
});

test('usage vacÃ­o y CLI JSON', async (t) => {
  const repo = makeRepo();
  const writes = [];
  const oldWrite = process.stdout.write;
  try {
    process.stdout.write = (chunk, encoding, callback) => { writes.push(typeof chunk === 'string' ? chunk : chunk.toString(encoding || 'utf8')); if (typeof encoding === 'function') encoding(); if (callback) callback(); return true; };
    t.mock.method(process, 'cwd', () => repo.dir);
    assert.match(renderUsage(aggregateUsage(repo.dir)), /Sin ejecuciones/);
    save(repo, 'cli', { attempts: [{ n: 1, durationMs: 10, model: { id: 'gpt-6-luna' }, usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, totalCost: 0 } }] });
    assert.equal(await main(['usage', '--cwd', repo.dir, '--executor', 'codex', '--json']), 0);
    const parsed = JSON.parse(writes.at(-1));
    assert.equal(parsed.groups[0].executor, 'codex');
    assert.ok(parsed.totals);
    assert.equal(parsed.groups[0].estimatedCost, null);
  } finally { process.stdout.write = oldWrite; repo.cleanup(); }
});
