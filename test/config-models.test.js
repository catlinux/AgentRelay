import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc } from '../src/config.js';
import { applyModelsBlock, MODELS_END, MODELS_START, removeModelsBlock, renderModelsBlock } from '../src/config-models.js';

const entries = [
  { executor: 'codex', title: 'Codex (OpenAI)', current: true, models: [{ id: 'gpt-6-luna', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }] },
  { executor: 'cline', title: 'Cline', current: false, models: [] },
  { executor: 'opencode', title: 'OpenCode', current: false, models: [], error: 'comando no disponible' },
];

test('renderiza ejecutores, esfuerzos, estado actual, lista vacía y error', () => {
  const block = renderModelsBlock(entries, { now: new Date('2026-10-02T12:00:00Z') });
  assert.ok(block.startsWith(MODELS_START));
  assert.ok(block.endsWith(MODELS_END));
  assert.match(block, /Actualizado: 2026-10-02/);
  assert.match(block, /Codex \(OpenAI\).*— en uso/);
  assert.match(block, /esfuerzos: bajo, medio\*, alto/);
  assert.match(block, /sin lista de modelos disponible/);
  assert.match(block, /no se pudo leer: comando no disponible/);
  assert.ok(block.split('\n').slice(1, -1).every((line) => line.startsWith('  // ')));
});

test('inserta al final del objeto raíz, parsea, es idempotente y retirar restaura el texto', () => {
  const original = '{\n  "executor": { "type": "codex" }\n}\n';
  const block = renderModelsBlock(entries, { now: '2026-10-02' });
  const inserted = applyModelsBlock(original, block);
  assert.deepEqual(parseJsonc(inserted), { executor: { type: 'codex' } });
  assert.equal(applyModelsBlock(inserted, block), inserted);
  assert.equal(removeModelsBlock(inserted), original);
});

test('reemplaza el bloque existente y conserva las demás líneas', () => {
  const original = `{\n  "x": 1,\n${MODELS_START}\n  // obsoleto\n${MODELS_END}\n  "y": 2\n}`;
  const block = renderModelsBlock([], { now: '2026-10-02' });
  const updated = applyModelsBlock(original, block);
  assert.ok(updated.includes('  "x": 1,\n'));
  assert.ok(updated.includes('  "y": 2\n}'));
  assert.ok(!updated.includes('obsoleto'));
  assert.deepEqual(parseJsonc(updated), { x: 1, y: 2 });
  assert.equal(removeModelsBlock(updated), '{\n  "x": 1,\n  "y": 2\n}');
});

test('conserva CRLF y todas las líneas ajenas al bloque', () => {
  const original = '{\r\n  "x": "a } b",\r\n  "nested": {\r\n    "value": true\r\n  }\r\n}\r\n';
  const block = renderModelsBlock(entries, { now: '2026-10-02' });
  const inserted = applyModelsBlock(original, block);
  assert.ok(!/(^|[^\r])\n/.test(inserted));
  assert.ok(inserted.includes('  "x": "a } b",\r\n'));
  assert.ok(inserted.includes('    "value": true\r\n  }\r\n'));
  assert.deepEqual(parseJsonc(inserted), { x: 'a } b', nested: { value: true } });
  assert.equal(removeModelsBlock(inserted), original);
});
