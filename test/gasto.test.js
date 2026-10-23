import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrarGasto, resumenGasto } from '../src/gasto.js';

function withHome(check) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-gasto-'));
  try { check(home); } finally { rmSync(home, { recursive: true, force: true }); }
}

test('acumula intentos por ruta y separa el día actual del total', () => withHome((home) => {
  const now = new Date(2026, 9, 23, 12);
  const yesterday = new Date(2026, 9, 22, 12);
  registrarGasto('ruta:a', { inputTokens: 2, outputTokens: 3, totalCost: 0.5 }, { home, now });
  registrarGasto('ruta:a', { inputTokens: 4, outputTokens: 1, totalCost: 0.25 }, { home, now });
  registrarGasto('ruta:a', { inputTokens: 8, totalCost: 1 }, { home, now: yesterday });
  registrarGasto('ruta:b', { inputTokens: 99 }, { home, now });
  assert.deepEqual(resumenGasto('ruta:a', { home, now }), {
    hoy: { intentos: 2, inputTokens: 6, outputTokens: 4, coste: 0.75 },
    total: { intentos: 3, inputTokens: 14, outputTokens: 4, coste: 1.75 },
  });
}));

test('tolera archivo corrupto e ignora coste no numérico', () => withHome((home) => {
  writeFileSync(path.join(home, 'gasto.json'), '{ roto', 'utf8');
  const now = new Date(2026, 9, 23);
  registrarGasto('ruta:a', { inputTokens: 5, totalCost: '1.20' }, { home, now });
  assert.deepEqual(resumenGasto('ruta:a', { home, now }).hoy, {
    intentos: 1, inputTokens: 5, outputTokens: 0, coste: 0,
  });
}));

test('conserva como máximo los últimos 90 días', () => withHome((home) => {
  const now = new Date(2026, 9, 23);
  registrarGasto('ruta:a', {}, { home, now });
  const file = path.join(home, 'gasto.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.porDia['2026-07-25'] = { vieja: { intentos: 2 } };
  writeFileSync(file, JSON.stringify(data), 'utf8');
  registrarGasto('ruta:a', {}, { home, now });
  const pruned = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(Object.keys(pruned.porDia).length, 1);
  assert.ok(pruned.porDia['2026-10-23']);
}));
