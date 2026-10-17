import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alternativesHint } from '../src/alternatives.js';

function conHogar(t, quota = null) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-alt-'));
  const previous = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = path.join(dir, 'home');
  mkdirSync(process.env.AGENTRELAY_HOME, { recursive: true });
  if (quota) writeFileSync(path.join(process.env.AGENTRELAY_HOME, 'quota.json'), JSON.stringify(quota));
  t.after(() => {
    if (previous === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  return process.env.AGENTRELAY_HOME;
}

test('con Luna agotada propone Antigravity (Gemini y Claude) y DeepSeek, con comandos que funcionan', (t) => {
  conHogar(t);
  const hint = alternativesHint({ current: { type: 'codex', model: 'gpt-6-luna' }, config: {}, installed: { antigravity: true } });
  assert.deepEqual(hint.split('\n'), [
    'Alternativas (no se cambia nada solo; elige una):',
    '- Antigravity con Gemini (cuota semanal gratuita): agentrelay use antigravity',
    '- Antigravity con Claude Sonnet (otro cupo semanal gratuito): agentrelay use antigravity claude-sonnet-4-6',
    '- DeepSeek de pago (Flash): agentrelay use deepseek-flash-go (necesita la suscripción de OpenCode Go)',
    'Con el enrutado automático (agentrelay set routing auto) este cambio se hace solo.',
  ]);
});

test('sin Antigravity instalado explica cómo instalarlo; con varias cuentas de Luna propone cambiar de cuenta', (t) => {
  const home = conHogar(t);
  mkdirSync(path.join(home, 'cuentas', 'luna', 'cuenta-2'), { recursive: true });
  const hint = alternativesHint({ current: { type: 'codex', model: 'gpt-6-luna' }, config: {}, installed: { antigravity: false } });
  assert.match(hint, /Otra cuenta de ChatGPT para Luna: agentrelay cuenta/);
  assert.match(hint, /install\.sh \| bash y conéctalo con agentrelay login antigravity/);
  assert.doesNotMatch(hint, /agentrelay use antigravity/);
});

test('con el cupo de Gemini agotado propone solo Claude; desde Antigravity propone volver a Luna', (t) => {
  conHogar(t, { exhausted: { 'antigravity:gemini': { until: new Date(Date.now() + 60_000).toISOString() } }, quotaLog: [] });
  const hint = alternativesHint({ current: { type: 'antigravity', model: 'auto' }, config: {}, installed: { antigravity: true } });
  assert.match(hint, /Luna \(cuenta de ChatGPT, cuota gratuita\): agentrelay use codex/);
  assert.match(hint, /agentrelay use antigravity claude-sonnet-4-6/);
  assert.doesNotMatch(hint, /Antigravity con Gemini/);
});

test('no sugiere pago si el ejecutor actual ya es DeepSeek', (t) => {
  conHogar(t);
  const hint = alternativesHint({ current: { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' }, config: {}, installed: { antigravity: true } });
  assert.doesNotMatch(hint, /DeepSeek de pago/);
});
