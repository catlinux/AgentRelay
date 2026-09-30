import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpenBrowser } from '../src/platform.js';

test('canOpenBrowser reconoce Windows, macOS y Linux con entorno gráfico', () => {
  assert.deepEqual(canOpenBrowser({ platform: 'win32', env: {} }), { ok: true, reason: null });
  assert.deepEqual(canOpenBrowser({ platform: 'darwin', env: {} }), { ok: true, reason: null });
  assert.deepEqual(canOpenBrowser({ platform: 'linux', env: { DISPLAY: ':0' } }), { ok: true, reason: null });
  assert.deepEqual(canOpenBrowser({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } }), { ok: true, reason: null });
});

test('canOpenBrowser detecta SSH, falta de entorno gráfico y WSL', () => {
  assert.deepEqual(canOpenBrowser({ platform: 'darwin', env: { SSH_TTY: '/dev/pts/1' } }), { ok: false, reason: 'sesión SSH' });
  assert.deepEqual(canOpenBrowser({ platform: 'linux', env: {} }), { ok: false, reason: 'sin entorno gráfico' });
  assert.deepEqual(canOpenBrowser({ platform: 'linux', env: { SSH_CONNECTION: 'host 1 2 3', DISPLAY: ':0' } }), { ok: false, reason: 'sesión SSH' });
  assert.deepEqual(canOpenBrowser({ platform: 'linux', env: { WSL_DISTRO_NAME: 'Ubuntu' } }), { ok: true, reason: null });
});
