import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  activarCuenta, borrarCuenta, crearCuenta, cuentaActiva, entornoCuenta, listarCuentas, quotaIdCuenta,
} from '../src/cuentas.js';

function hogar(t) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-cuentas-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test('cuentas: la principal usa las carpetas normales y no cambia el entorno', (t) => {
  const home = hogar(t);
  assert.deepEqual(listarCuentas('luna', home), ['principal']);
  assert.equal(cuentaActiva('luna', home), 'principal');
  assert.deepEqual(entornoCuenta('luna', 'principal', home), {});
  assert.equal(quotaIdCuenta('luna', 'principal'), 'codex:chatgpt');
});

test('cuentas: una cuenta extra tiene carpeta, entorno y cuota propios, y se activa y borra', (t) => {
  const home = hogar(t);
  const dir = crearCuenta('luna', 'trabajo', home);
  assert.deepEqual(listarCuentas('luna', home), ['principal', 'trabajo']);
  assert.deepEqual(entornoCuenta('luna', 'trabajo', home), { CODEX_HOME: dir });
  assert.equal(quotaIdCuenta('luna', 'trabajo'), 'codex:chatgpt@trabajo');
  activarCuenta('luna', 'trabajo', home);
  assert.equal(cuentaActiva('luna', home), 'trabajo');
  borrarCuenta('luna', 'trabajo', home);
  assert.equal(existsSync(dir), false);
  assert.equal(cuentaActiva('luna', home), 'principal');
});

test('cuentas: nombres no válidos, cuentas inexistentes y la principal se rechazan', (t) => {
  const home = hogar(t);
  assert.throws(() => crearCuenta('luna', '../fuera', home), /no válido/);
  assert.throws(() => crearCuenta('luna', 'principal', home), /ya existe/);
  assert.throws(() => activarCuenta('luna', 'nadie', home), /No existe/);
  assert.throws(() => borrarCuenta('luna', 'principal', home), /no se borra/);
  assert.throws(() => listarCuentas('gemini', home), /Servicio desconocido/);
  assert.throws(() => listarCuentas('opencode', home), /Servicio desconocido/);
});
