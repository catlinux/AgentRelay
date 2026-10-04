import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternativesHint } from '../src/alternatives.js';

const lastLine = 'Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>.';

test('propone añadir OpenCode si no está instalado y omite el ejecutor actual', () => {
  const hint = alternativesHint({
    current: { type: 'cline', model: 'deepseek-v4-flash' },
    checks: { models: {} },
    installed: { opencode: false, cline: false },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex',
    '- OpenCode gratis: agentrelay executors add opencode',
    lastLine,
  ]);
});

test('incluye hasta tres modelos gratuitos aprobados, más recientes primero', () => {
  const hint = alternativesHint({
    current: { type: 'codex', model: 'gpt-6-luna' },
    checks: { models: {
      'vendor/old-free': { status: 'approved', checkedAt: '2026-01-01T00:00:00Z' },
      'vendor/newest-free': { status: 'approved', checkedAt: '2026-03-01T00:00:00Z' },
      'vendor/middle-free': { status: 'approved', checkedAt: '2026-02-01T00:00:00Z' },
      'vendor/fourth-free': { status: 'approved', checkedAt: '2026-02-15T00:00:00Z' },
      'vendor/failed-free': { status: 'failed', checkedAt: '2026-04-01T00:00:00Z' },
      'vendor/paid': { status: 'approved', checkedAt: '2026-05-01T00:00:00Z' },
    } },
    installed: { opencode: true, cline: true },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- OpenCode gratis, probado: agentrelay use opencode vendor/newest-free',
    '- OpenCode gratis, probado: agentrelay use opencode vendor/fourth-free',
    '- OpenCode gratis, probado: agentrelay use opencode vendor/middle-free',
    '- DeepSeek de pago (Flash): agentrelay use cline deepseek-v4-flash (necesita su clave de API)',
    lastLine,
  ]);
});

test('sin modelos aprobados ofrece probar modelos nuevos y omite OpenCode actual', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'vendor/model-free' },
    checks: { models: { 'vendor/model-free': { status: 'failed', checkedAt: '2026-03-01T00:00:00Z' } } },
    installed: { opencode: true, cline: true },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex',
    '- DeepSeek de pago (Flash): agentrelay use cline deepseek-v4-flash (necesita su clave de API)',
    lastLine,
  ]);
});
