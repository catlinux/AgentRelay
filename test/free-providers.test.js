import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectedProviders, getProvider } from '../src/free-providers.js';

test('connectedProviders detecta una variable de entorno definida', () => {
  assert.deepEqual(connectedProviders({ env: { MISTRAL_API_KEY: 'key' } }).map(({ id }) => id), ['mistral']);
});

test('connectedProviders detecta autenticación de OpenCode', () => {
  assert.deepEqual(connectedProviders({ env: {}, opencodeAuth: ['nvidia'] }).map(({ id }) => id), ['nvidia']);
});

test('connectedProviders omite proveedores sin credenciales', () => {
  assert.deepEqual(connectedProviders({ env: {}, opencodeAuth: [] }), []);
});

test('connectedProviders omite variables vacías o con espacios', () => {
  assert.deepEqual(connectedProviders({ env: { MISTRAL_API_KEY: '  ' } }), []);
});

test('getProvider devuelve null para un proveedor desconocido', () => {
  assert.equal(getProvider('unknown'), null);
});
