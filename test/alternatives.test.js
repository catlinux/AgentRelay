import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternativesHint } from '../src/alternatives.js';

const lastLine = 'Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>.';

test('propone añadir OpenCode si no está instalado y omite el ejecutor actual', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'deepseek/deepseek-flash' },
    checks: { models: {} },
    installed: { opencode: false },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex',
    '- OpenCode gratis: agentrelay executors add opencode',
    lastLine,
  ]);
});

test('incluye hasta tres modelos según el ranquing guardado', () => {
  const hint = alternativesHint({
    current: { type: 'codex', model: 'gpt-6-luna' },
    checks: { ranking: {
      at: new Date().toISOString(),
      entries: [
        { id: 'vendor/newest-free', score: 2 },
        { id: 'vendor/fourth-free', score: 2 },
        { id: 'vendor/middle-free', score: 1 },
        { id: 'vendor/old-free', score: 1 },
        { id: 'vendor/failed-free', score: 0 },
      ],
    } },
    installed: { opencode: true },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- OpenCode gratis (nº 1 del ranquing): agentrelay use opencode vendor/newest-free',
    '- OpenCode gratis (nº 2 del ranquing): agentrelay use opencode vendor/fourth-free',
    '- OpenCode gratis (nº 3 del ranquing): agentrelay use opencode vendor/middle-free',
    '- DeepSeek de pago (Flash): agentrelay use opencode deepseek/deepseek-flash (necesita su clave de API)',
    lastLine,
  ]);
});

test('el ranquing omite el modelo actual y los agotados conservando su posición', () => {
  const hint = alternativesHint({
    current: { type: 'codex', model: 'vendor/current-free' },
    checks: {
      models: { 'vendor/exhausted-free': { status: 'approved', checkedAt: new Date().toISOString() } },
      exhausted: { 'vendor/exhausted-free': { until: new Date(Date.now() + 60_000).toISOString() } },
      ranking: {
        at: new Date().toISOString(),
        entries: [
          { id: 'vendor/current-free', score: 2 },
          { id: 'vendor/exhausted-free', score: 2 },
          { id: 'vendor/remaining-free', score: 2 },
        ],
      },
    },
    installed: { opencode: true },
  });

  assert.match(hint, /OpenCode gratis \(nº 3 del ranquing\): agentrelay use opencode vendor\/remaining-free/);
  assert.doesNotMatch(hint, /vendor\/current-free|vendor\/exhausted-free/);
});

test('propone otro modelo de OpenCode tras agotar el actual', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'vendor/current-free' },
    checks: { ranking: {
      at: new Date().toISOString(),
      entries: [
        { id: 'vendor/current-free', score: 2 },
        { id: 'vendor/alternative-free', score: 1 },
      ],
    } },
    installed: { opencode: true },
  });

  assert.match(hint, /OpenCode gratis \(nº 2 del ranquing\): agentrelay use opencode vendor\/alternative-free/);
  assert.doesNotMatch(hint, /agentrelay use opencode vendor\/current-free/);
});

test('sin ranquing mantiene las sugerencias de modelos aprobados', () => {
  const hint = alternativesHint({
    current: { type: 'codex', model: 'gpt-6-luna' },
    checks: { models: { 'vendor/approved-free': { status: 'approved', checkedAt: new Date().toISOString() } } },
    installed: { opencode: true },
  });

  assert.match(hint, /OpenCode gratis, probado: agentrelay use opencode vendor\/approved-free/);
});

test('sin modelos aprobados ofrece probar modelos nuevos y omite OpenCode actual', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'vendor/model-free' },
    checks: { models: { 'vendor/model-free': { status: 'failed', checkedAt: '2026-03-01T00:00:00Z' } } },
    installed: { opencode: true },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex',
    '- DeepSeek de pago (Flash): agentrelay use opencode deepseek/deepseek-flash (necesita su clave de API)',
    lastLine,
  ]);
});
