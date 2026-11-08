import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cuentaGuardada, integracionDe, listarCredenciales, prepararCuenta, quotaIdCredencial, rotarCuenta,
} from '../src/cuentas-opencode.js';
import { isAvailable, markQuotaExhausted } from '../src/quota-state.js';

const NOW = new Date('2026-01-01T00:00:00Z');
const INTEGRACION = 'opencode-go';
const executor = { type: 'opencode', command: ['opencode-falso'], model: `${INTEGRACION}/deepseek-v4-flash` };

function hogar(t) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-cuentas-opencode-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

const credencial = (id, label) => ({ type: 'credential', id, label, method: 'key' });

function fakeRun(connections) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    if (args.includes('switch')) return { code: 0, stdout: '', stderr: '' };
    return { code: 0, stdout: JSON.stringify([{ id: INTEGRACION, name: 'OpenCode Go', connections }]), stderr: '' };
  };
  run.calls = calls;
  return run;
}

function guardar(home, id) {
  writeFileSync(path.join(home, 'cuentas.json'), `${JSON.stringify({ [`opencode:${INTEGRACION}`]: id }, null, 2)}\n`, 'utf8');
}

test('cuentas de OpenCode: integración del modelo y quotaId de cada credencial', () => {
  assert.equal(integracionDe('opencode-go/x'), 'opencode-go');
  assert.equal(integracionDe('opencode-go/deepseek-v4-flash'), 'opencode-go');
  assert.equal(integracionDe('x'), null);
  assert.equal(integracionDe(''), null);
  assert.equal(quotaIdCredencial('opencode-go', 'cred_0001'), 'opencode:opencode-go@cred_0001');
});

test('cuentas de OpenCode: lista las credenciales de la integración en orden de alta por id', async () => {
  const run = fakeRun([
    credencial('cred_0003', 'Tercera'),
    credencial('cred_0001', 'Primera'),
    credencial('cred_0002', 'Segunda'),
    { type: 'oauth', id: 'otra' },
  ]);
  const lista = await listarCredenciales(executor, INTEGRACION, { run });
  assert.deepEqual(lista.map((c) => c.id), ['cred_0001', 'cred_0002', 'cred_0003']);
  assert.deepEqual(lista.map((c) => c.label), ['Primera', 'Segunda', 'Tercera']);
});

test('cuentas de OpenCode: con una sola credencial no prepara nada ni llama a auth switch', async (t) => {
  const home = hogar(t);
  const run = fakeRun([credencial('cred_0001', 'Única')]);
  assert.equal(await prepararCuenta(executor, { home, run, now: NOW }), null);
  assert.equal(run.calls.filter(({ args }) => args.includes('switch')).length, 0);
  assert.equal(run.calls.filter(({ args }) => args.includes('list')).length, 1);
});

test('cuentas de OpenCode: prepara la guardada si tiene cuota, aunque no sea la primera', async (t) => {
  const home = hogar(t);
  guardar(home, 'cred_0002');
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda')]);
  const preparada = await prepararCuenta(executor, { home, run, now: NOW });
  assert.deepEqual(preparada, { integracion: INTEGRACION, id: 'cred_0002', label: 'Segunda', total: 2 });
  const cambio = run.calls.find(({ args }) => args.includes('switch'));
  assert.deepEqual(cambio.args, ['auth', 'switch', INTEGRACION, 'cred_0002']);
  assert.equal(cuentaGuardada(INTEGRACION, home), 'cred_0002');
});

test('cuentas de OpenCode: salta la guardada agotada y activa la primera con cuota', async (t) => {
  const home = hogar(t);
  guardar(home, 'cred_0001');
  markQuotaExhausted(quotaIdCredencial(INTEGRACION, 'cred_0001'), { home, now: NOW });
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda')]);
  const preparada = await prepararCuenta(executor, { home, run, now: NOW });
  assert.deepEqual(preparada, { integracion: INTEGRACION, id: 'cred_0002', label: 'Segunda', total: 2 });
  assert.equal(cuentaGuardada(INTEGRACION, home), 'cred_0002');
});

test('cuentas de OpenCode: rotar marca la actual como agotada, activa la siguiente y describe el cambio', async (t) => {
  const home = hogar(t);
  guardar(home, 'cred_0001');
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda')]);
  const cambio = await rotarCuenta(executor, 'insufficient_quota', { home, run, now: NOW });
  assert.deepEqual(cambio, { integracion: INTEGRACION, from: 'Primera', to: 'Segunda', total: 2 });
  assert.equal(isAvailable(quotaIdCredencial(INTEGRACION, 'cred_0001'), NOW, { home }), false);
  assert.equal(cuentaGuardada(INTEGRACION, home), 'cred_0002');
});

test('cuentas de OpenCode: rota en círculo hacia la siguiente, no vuelve a la primera aunque tenga cuota', async (t) => {
  const home = hogar(t);
  guardar(home, 'cred_0002');
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda'), credencial('cred_0003', 'Tercera')]);
  assert.equal((await prepararCuenta(executor, { home, run, now: NOW })).id, 'cred_0002');
  assert.equal((await rotarCuenta(executor, 'insufficient_quota', { home, run, now: NOW })).to, 'Tercera');
  assert.equal((await rotarCuenta(executor, 'insufficient_quota', { home, run, now: NOW })).to, 'Primera');
});

test('cuentas de OpenCode: si todas están agotadas, rotar devuelve null', async (t) => {
  const home = hogar(t);
  guardar(home, 'cred_0001');
  for (const id of ['cred_0001', 'cred_0002']) {
    markQuotaExhausted(quotaIdCredencial(INTEGRACION, id), { home, now: NOW });
  }
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda')]);
  assert.equal(await rotarCuenta(executor, 'insufficient_quota', { home, run, now: NOW }), null);
  assert.equal(run.calls.filter(({ args }) => args.includes('switch')).length, 0);
});

test('cuentas de OpenCode: con un ejecutor que no es OpenCode no hace nada', async (t) => {
  const home = hogar(t);
  const run = fakeRun([credencial('cred_0001', 'Primera'), credencial('cred_0002', 'Segunda')]);
  const otro = { type: 'codex', command: ['codex-falso'], model: `${INTEGRACION}/x` };
  assert.equal(await prepararCuenta(otro, { home, run, now: NOW }), null);
  assert.equal(await rotarCuenta(otro, 'insufficient_quota', { home, run, now: NOW }), null);
  assert.equal(run.calls.length, 0);
});
