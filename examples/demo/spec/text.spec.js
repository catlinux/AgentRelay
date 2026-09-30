import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capitalize } from '../src/text.js';

test('capitalize', () => {
  assert.equal(capitalize('hola'), 'Hola');
});
