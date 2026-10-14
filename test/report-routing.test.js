import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent } from '../src/events.js';
import { renderReport } from '../src/report.js';

function state(route) {
  return {
    id: 'run-1', status: 'accepted', task: { title: 'Tarea', type: 'implement', complexity: 'baja', objective: 'Hacerla', acceptanceCriteria: [] },
    policy: { review: 'manual', maxRetries: 2 }, retriesUsed: 0,
    selfReview: { mode: 'off' }, config: { executor: { type: 'codex', provider: 'openai', model: 'gpt' } },
    attempts: [{ n: 1, kind: 'implement', route: route ? 'codex:gpt-6-luna' : undefined, paid: route ? true : false, ok: true, durationMs: 1000, report: { status: 'done', needsEscalation: false, summary: 'OK', checks: [], issues: [], questions: [] } }],
    usage: { inputTokens: 1, outputTokens: 2, estimatedCost: 0 }, lastCheck: null,
    ...(route ? { route } : {}),
  };
}

test('formatEvent muestra cambios de ruta en amarillo, incluido el aviso de privacidad', () => {
  const line = formatEvent({ type: 'route_switch', from: 'codex:gpt-6-luna', to: 'opencode:groq/modelo', reason: 'cuota agotada', paid: true, trainsOnData: true }, 0, { color: true });
  assert.equal(line, '\u001b[33m⇄ Cambio de ejecutor: codex:gpt-6-luna → opencode:groq/modelo (cuota agotada) · de pago · aviso: puede usar tus prompts para entrenar\u001b[0m');
});

test('renderReport conserva el formato normal cuando no hay ruta', () => {
  const report = renderReport(state(null));
  assert.match(report, /- Ejecutor: codex · openai\/gpt/);
  assert.doesNotMatch(report, /## Enrutado/);
  assert.ok(report.includes('| 1 | implement |'));
});

test('renderReport incluye cambios, entradas descartadas y uso de pago al enrutar', () => {
  const route = {
    first: 'codex:gpt-6-luna', current: { key: 'opencode:groq/modelo' },
    switches: [{ at: '2026-10-09T19:00:00.000Z', from: 'codex:gpt-6-luna', to: 'opencode:groq/modelo', reason: 'cuota agotada', paid: true, trainsOnData: true }],
    skipped: [{ key: 'opencode:fake/modelo', reason: 'no disponible' }, { key: 'opencode:fake/modelo', reason: 'duplicada' }],
  };
  const report = renderReport(state(route));
  assert.match(report, /Ejecutor: enrutado automático · empezó con codex:gpt-6-luna · ahora opencode:groq\/modelo/);
  assert.match(report, /## Enrutado[\s\S]*\d{2}:\d{2} codex:gpt-6-luna → opencode:groq\/modelo \(cuota agotada\) · de pago · aviso: puede usar tus prompts para entrenar/);
  assert.equal((report.match(/opencode:fake\/modelo: /g) ?? []).length, 1);
  assert.match(report, /\*\*Se ha usado un ejecutor de pago en esta ejecución\.\*\*/);
  assert.ok(report.includes('| 1 | implement · codex:gpt-6-luna |'));
});

test('el informe lista los reintentos con pausa de una entrada del enrutado', () => {
  const route = {
    first: 'opencode:fake/free-a', current: { key: 'opencode:fake/free-b' }, switches: [], skipped: [],
    retries: [{ at: '2026-10-15T10:00:00.000Z', entry: 'opencode:fake/free-a', failures: 1, of: 2, pauseSeconds: 5, reason: 'quota' }],
  };
  assert.match(renderReport(state(route)), /Reintentos con pausa:\n- \d{2}:\d{2} opencode:fake\/free-a: fallo 1\/2 \(cuota o límite\), se reintentó tras 5 s/);
});
