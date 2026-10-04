import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectReport, fetchDeepSeekBalance, renderReport, writeReport } from '../src/executors-report.js';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-report-'));
const now = new Date('2026-10-04T12:00:00Z');

test('fetchDeepSeekBalance no consulta sin clave, formatea monedas y oculta errores', async () => {
  assert.match((await fetchDeepSeekBalance({ env: {} })).text, /define la variable/);
  let request;
  const fetchFn = async (...args) => { request = args; return { ok: true, json: async () => ({ is_available: true, balance_infos: [
    { currency: 'USD', total_balance: '10', granted_balance: '2', topped_up_balance: '8' },
    { currency: 'CNY', total_balance: '20', granted_balance: '3', topped_up_balance: '17' },
  ] }) }; };
  const result = await fetchDeepSeekBalance({ env: { DEEPSEEK_API_KEY: 'clave-de-prueba' }, fetchFn });
  assert.equal(request[0], 'https://api.deepseek.com/user/balance');
  assert.equal(request[1].headers.Authorization, 'Bearer clave-de-prueba');
  assert.match(result.text, /10 USD.*20 CNY/);
  for (const fail of [async () => ({ ok: false, status: 401 }), async () => { throw new Error('caída clave-de-prueba'); }, async () => ({ ok: true, json: async () => { throw new Error('JSON'); } })]) {
    const failure = await fetchDeepSeekBalance({ env: { DEEPSEEK_API_KEY: 'clave-de-prueba' }, fetchFn: fail });
    assert.equal(failure.ok, false);
    assert.doesNotMatch(failure.text, /clave-de-prueba/);
  }
});

test('renderReport ordena saldos primero y presenta modelos y revisiones diarias', async () => {
  const checks = { lastRun: '2026-10-04', models: {
    'a-free': { status: 'approved', checkedAt: '2026-10-04T10:00:00Z', seconds: 12 },
    'b-free': { status: 'failed', checkedAt: '2026-10-04T11:00:00Z', seconds: 3, reason: 'falló' },
    'c-free': { status: 'approved', checkedAt: '2026-10-03T11:00:00Z', seconds: 4 },
  } };
  const data = await collectReport({ current: { type: 'codex', model: 'demo', thinking: 'high' }, now,
    isInstalled: async () => true, authStatuses: { codex: { ok: true, message: 'conectado' } }, checks,
    listModels: async (type) => { if (type === 'cline') throw new Error('lista rota'); return type === 'opencode' ? ['a-free', 'b-free', 'c-free'].map((id) => ({ id })) : [{ id: 'demo', efforts: ['low', 'high'] }]; },
    balances: { deepseek: { ok: true, text: '10 USD' } } });
  const text = renderReport(data);
  assert.ok(text.indexOf('## Saldos') < text.indexOf('## Ejecutor en uso'));
  assert.match(text, /OpenAI: no consultable por API;.*https:\/\/platform\.openai\.com/);
  assert.match(text, /✔ probado \(2026-10-04, 12 s\)/);
  assert.match(text, /✘ no pasó la prueba: falló/);
  assert.match(text, /c-free — ✔ probado \(2026-10-03, 4 s\)/);
  assert.doesNotMatch(text.split('### Probados hoy')[1], /c-free/);
  assert.match(text, /Probados hoy[\s\S]*a-free[\s\S]*b-free/);
  assert.match(text, /no se pudo leer la lista: lista rota/);
});

test('writeReport crea el destino y reemplaza el informe completo', async () => {
  const root = temp();
  try {
    const deps = { current: { type: 'codex', model: 'primero' }, now, home: path.join(root, 'home'), balances: { deepseek: { text: 'saldo' } }, checks: { models: {} }, isInstalled: async () => true, listModels: async () => [] };
    const first = await writeReport({ root, ...deps });
    assert.match(readFileSync(first.path, 'utf8'), /primero/);
    await writeReport({ root, ...deps, current: { type: 'codex', model: 'segundo' } });
    const finalText = readFileSync(first.path, 'utf8');
    assert.match(finalText, /segundo/);
    assert.doesNotMatch(finalText, /primero/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
