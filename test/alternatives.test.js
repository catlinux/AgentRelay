import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alternativesHint } from '../src/alternatives.js';

const lastLine = 'Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>.';

test('propone añadir OpenCode si no está instalado y omite el ejecutor actual', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' },
    config: { routing: { freeOrder: ['opencode:opencode-go/cat-jam-free'] } },
    installed: { opencode: false },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex',
    '- OpenCode gratis: agentrelay executors add opencode',
    lastLine,
  ]);
});

test('sugiere hasta tres entradas de freeOrder no agotadas', () => {
  const hint = alternativesHint({
    current: { type: 'codex', model: 'gpt-6-luna' },
    config: { routing: { freeOrder: [
      'opencode:opencode-go/a-free',
      'opencode:opencode-go/b-free',
      'opencode:opencode-go/c-free',
      'opencode:opencode-go/d-free',
    ] } },
    installed: { opencode: true },
  });

  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- OpenCode gratis: agentrelay use opencode opencode-go/a-free',
    '- OpenCode gratis: agentrelay use opencode opencode-go/b-free',
    '- OpenCode gratis: agentrelay use opencode opencode-go/c-free',
    '- DeepSeek de pago (Flash): agentrelay use opencode opencode-go/deepseek-v4.1-flash (necesita su clave de API)',
    lastLine,
  ]);
});

test('omite el modelo actual y los agotados de freeOrder', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-alt-'));
  try {
    process.env.AGENTRELAY_HOME = path.join(dir, 'home');
    mkdirSync(process.env.AGENTRELAY_HOME, { recursive: true });
    writeFileSync(path.join(process.env.AGENTRELAY_HOME, 'quota.json'), JSON.stringify({
      exhausted: { 'opencode-go/exhausted-free': { until: new Date(Date.now() + 60_000).toISOString() } },
      quotaLog: [],
    }));
    const hint = alternativesHint({
      current: { type: 'codex', model: 'opencode-go/current-free' },
      config: { routing: { freeOrder: [
        'opencode:opencode-go/current-free',
        'opencode:opencode-go/exhausted-free',
        'opencode:opencode-go/remaining-free',
      ] } },
      installed: { opencode: true },
    });
    assert.match(hint, /agentrelay use opencode opencode-go\/remaining-free/);
    assert.doesNotMatch(hint, /opencode-go\/current-free|opencode-go\/exhausted-free/);
  } finally {
    delete process.env.AGENTRELAY_HOME;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no sugiere pago si el ejecutor actual ya es deepseek', () => {
  const hint = alternativesHint({
    current: { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' },
    config: { routing: { freeOrder: [] } },
    installed: { opencode: true },
  });

  assert.doesNotMatch(hint, /deepseek-v4\.1-flash \(necesita/);
});
