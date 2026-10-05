import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, parseJsonc } from '../src/config.js';
import { configTemplate } from '../src/config-template.js';
import { setConfigValue, unsetConfigValue } from '../src/config-file.js';

const userText = () => configTemplate({ scope: 'user' });
const projectText = () => configTemplate({ scope: 'project' });

test('set inserts a missing option using the block indentation', () => {
  const text = setConfigValue(userText(), 'executor.type', 'opencode');
  assert.match(text, /^ {4}"type": "opencode",$/m);
});

// Diferencia de líneas mínima (LCS): devuelve las líneas retiradas y las
// añadidas. El resto se conserva en el mismo orden.
function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

// Comprueba que las únicas líneas cambiadas son las esperadas (sin importar el
// orden), lo que demuestra que el resto sigue byte a byte.
function assertOnlyChanged(before, after, expectedRemoved, expectedAdded) {
  const { removed, added } = diffLines(before, after);
  assert.deepEqual([...removed].sort(), [...expectedRemoved].sort());
  assert.deepEqual([...added].sort(), [...expectedAdded].sort());
}

test('set descomenta una opción de la plantilla y su bloque, y parsea con el valor', () => {
  const before = userText();
  const after = setConfigValue(before, 'executor.model', 'mi-modelo');
  const parsed = parseJsonc(after);
  assert.equal(parsed.executor.model, 'mi-modelo');
  assert.ok(after.includes('  "executor": {'));
  assert.ok(after.includes('    "model": "mi-modelo",'));
  // Solo cambian la línea de la opción y las del bloque que la contiene.
  assertOnlyChanged(
    before, after,
    ['  // "executor": {', '    // "model": "gpt-6-luna",', '  // },'],
    ['  "executor": {', '    "model": "mi-modelo",', '  },'],
  );
});

test('set sobre una opción ya activa reemplaza solo su valor', () => {
  const first = setConfigValue(userText(), 'executor.thinking', 'low');
  assert.equal(parseJsonc(first).executor.thinking, 'low');
  const second = setConfigValue(first, 'executor.thinking', 'high');
  assert.equal(parseJsonc(second).executor.thinking, 'high');
  assertOnlyChanged(first, second, ['    "thinking": "low",'], ['    "thinking": "high",']);
});

test('set de una clave de profundidad 3 descomenta policy y selfReview', () => {
  const before = projectText();
  const after = setConfigValue(before, 'policy.selfReview.normal', 'pass');
  const parsed = parseJsonc(after);
  assert.deepEqual(parsed.policy, { selfReview: { normal: 'pass' } });
  assert.ok(after.includes('  "policy": {'));
  assert.ok(after.includes('  "selfReview": {'));
  assert.ok(after.includes('    // "trivial": "none",'));
  assert.ok(after.includes('    // "complex": "pass",'));
});

test('set de una clave que no está en la plantilla la inserta en su bloque', () => {
  const before = userText();
  const after = setConfigValue(before, 'executor.newOption', 'valor');
  const parsed = parseJsonc(after);
  assert.equal(parsed.executor.newOption, 'valor');
  // La nueva opción queda dentro del bloque executor.
  const lines = after.split('\n');
  assert.ok(lines.includes('    "newOption": "valor",'));
  assert.ok(lines.indexOf('    "newOption": "valor",') < lines.indexOf('  },'));
  assertOnlyChanged(
    before, after,
    ['  // "executor": {', '  // },'],
    ['  "executor": {', '    "newOption": "valor",', '  },'],
  );
});

test('set de una clave nueva crea el objeto padre que falta', () => {
  const after = setConfigValue(projectText(), 'nuevaSeccion.opcion', true);
  const parsed = parseJsonc(after);
  assert.deepEqual(parsed.nuevaSeccion, { opcion: true });
});

test('set admite listas y null como valores', () => {
  const withArray = setConfigValue(projectText(), 'validation.commands', ['npm test', 'npm run lint']);
  assert.deepEqual(parseJsonc(withArray).validation.commands, ['npm test', 'npm run lint']);
  assert.ok(withArray.includes('  "commands": ["npm test","npm run lint"],'));

  const withNull = setConfigValue(userText(), 'executor.provider', null);
  assert.equal(parseJsonc(withNull).executor.provider, null);
  assert.ok(withNull.includes('  "provider": null,'));
});

test('unset restaura la línea comentada y recompone el bloque', () => {
  const before = userText();
  const after = setConfigValue(before, 'executor.model', 'mi-modelo');
  const restored = unsetConfigValue(after, 'executor.model');
  // El bloque executor vuelve a quedar comentado y el texto es idéntico.
  assert.equal(restored, before);
  assert.deepEqual(parseJsonc(restored), {});
});

test('unset de profundidad 3 recompone policy y selfReview', () => {
  const before = projectText();
  const after = setConfigValue(before, 'policy.selfReview.normal', 'pass');
  const restored = unsetConfigValue(after, 'policy.selfReview.normal');
  assert.equal(restored, before);
  assert.deepEqual(parseJsonc(restored), {});
});

test('unset elimina una opción insertada a mano', () => {
  const before = projectText();
  const after = setConfigValue(before, 'nuevaSeccion.opcion', 7);
  assert.deepEqual(parseJsonc(after).nuevaSeccion, { opcion: 7 });
  assert.equal(unsetConfigValue(after, 'nuevaSeccion.opcion'), before);
});

test('unset sobre una opción ya comentada no cambia el texto', () => {
  const before = userText();
  assert.equal(unsetConfigValue(before, 'executor.model'), before);
});

test('set y unset conservan los saltos de línea CRLF', () => {
  const crlf = userText().replace(/\n/g, '\r\n');
  const after = setConfigValue(crlf, 'executor.model', 'mi-modelo');
  assert.ok(after.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(after), 'no debe quedar ningún salto LF suelto');
  assert.equal(parseJsonc(after).executor.model, 'mi-modelo');
  assert.equal(unsetConfigValue(after, 'executor.model'), crlf);
});

test('setConfigValue añade la coma que falta cuando el JSON se escribió a mano y no cambia el texto de la propiedad anterior', () => {
  const text = ['{', '  "executor": {', '    "type": "codex",', '    "model": "tests"', '  }', '}', ''].join(String.fromCharCode(10));
  const result = setConfigValue(text, 'executor.thinking', 'low');
  assert.match(result, /"model": "tests",/);
  assert.match(result, /"thinking": "low"/);
  assert.doesNotThrow(() => parseJsonc(result, 'x'));
});
