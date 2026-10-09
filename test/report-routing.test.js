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
    skipped: [{ key: 'cline:modelo', reason: 'no disponible' }, { key: 'cline:modelo', reason: 'duplicada' }],
  };
  const report = renderReport(state(route));
  assert.match(report, /Ejecutor: enrutado automático · empezó con codex:gpt-6-luna · ahora opencode:groq\/modelo/);
  assert.match(report, /## Enrutado[\s\S]*\d{2}:\d{2} codex:gpt-6-luna → opencode:groq\/modelo \(cuota agotada\) · de pago · aviso: puede usar tus prompts para entrenar/);
  assert.equal((report.match(/cline:modelo: /g) ?? []).length, 1);
  assert.match(report, /\*\*Se ha usado un ejecutor de pago en esta ejecución\.\*\*/);
  assert.ok(report.includes('| 1 | implement · codex:gpt-6-luna |'));
});
