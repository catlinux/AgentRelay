import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  buildHardProbe, classifyProbeFailure, rankModels, renderRanking,
} from '../src/model-rank.js';
import { checksFile, loadChecks, saveChecks } from '../src/model-check.js';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-model-rank-test-'));
const approved = (seconds = 1) => ({ status: 'approved', checkedAt: '2026-10-05T00:00:00.000Z', seconds, reason: 'correcto', raw: null });
const failed = (reason = 'falló', seconds = 1, raw = {}) => ({ status: 'failed', checkedAt: '2026-10-05T00:00:00.000Z', seconds, reason, raw });
const candidate = (id, fields = {}) => ({ id, name: id, listed: true, reason: 'metadatos', context: null, reasoning: false, toolCall: true, ...fields });
const fakeProbes = ({ basic = {}, hard = {}, calls = [] } = {}) => ({
  basic: async ({ id }) => { calls.push(`basic:${id}`); return basic[id] ?? approved(); },
  hard: async ({ id }) => { calls.push(`hard:${id}`); return hard[id] ?? approved(); },
});

test('rankModels ordena por pruebas aprobadas y después por tiempo', async () => {
  const candidates = ['lento', 'rapido', 'parcial', 'fallo'].map((id) => candidate(id));
  const probes = fakeProbes({
    basic: { lento: approved(3), rapido: approved(1), parcial: approved(1), fallo: failed() },
    hard: { lento: approved(2), rapido: approved(0.5), parcial: failed('incorrecto', 0.25) },
  });
  const result = await rankModels({ candidates, executor: {}, adapter: {}, probes });
  assert.deepEqual(result.entries.map(({ id, score, seconds, kind }) => ({ id, score, seconds, kind })), [
    { id: 'rapido', score: 2, seconds: 1.5, kind: 'ok' },
    { id: 'lento', score: 2, seconds: 5, kind: 'ok' },
    { id: 'parcial', score: 1, seconds: 1.25, kind: 'parcial' },
    { id: 'fallo', score: 0, seconds: 1, kind: 'fail' },
  ]);
  assert.equal(result.tested, 4);
  assert.deepEqual(result.skipped, []);
});

test('rankModels no ejecuta la prueba difícil cuando falla la básica', async () => {
  const calls = [];
  const result = await rankModels({
    candidates: [candidate('malo')], executor: {}, adapter: {},
    probes: fakeProbes({ basic: { malo: failed() }, calls }),
  });
  assert.deepEqual(calls, ['basic:malo']);
  assert.equal(result.entries[0].hard, null);
  assert.equal(result.entries[0].score, 0);
});

test('rankModels se detiene tras tres fallos seguidos por cuota y deja el resto sin probar', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const calls = [];
  const result = await rankModels({
    candidates: ids.map((id) => candidate(id)), executor: {}, adapter: {}, stopAfterQuota: 3,
    probes: fakeProbes({ basic: Object.fromEntries(ids.map((id) => [id, failed('cuota', 1, { error: 'insufficient_quota' })])), calls }),
  });
  assert.equal(result.stoppedBy, 'cuota');
  assert.equal(result.tested, 3);
  assert.deepEqual(result.skipped, ['d', 'e']);
  assert.deepEqual(calls, ['basic:a', 'basic:b', 'basic:c']);
});

test('rankModels limita por max y prioriza modelos con toolCall sin alterar el orden estable', async () => {
  const calls = [];
  const candidates = [candidate('uno', { toolCall: false }), candidate('dos'), candidate('tres', { toolCall: false }), candidate('cuatro')];
  const result = await rankModels({ candidates, executor: {}, adapter: {}, max: 2, probes: fakeProbes({ calls }) });
  assert.deepEqual(calls.filter((call) => call.startsWith('basic:')), ['basic:dos', 'basic:cuatro']);
  assert.deepEqual(result.skipped, ['uno', 'tres']);
});

test('rankModels prueba todos los candidatos por defecto', async () => {
  const calls = [];
  const candidates = Array.from({ length: 10 }, (_, index) => candidate(`modelo-${index}`));
  const result = await rankModels({
    candidates, executor: {}, adapter: {}, stopAfterQuota: 0, probes: fakeProbes({ calls }),
  });
  assert.equal(result.tested, 10);
  assert.equal(result.skipped.length, 0);
  assert.equal(calls.filter((call) => call.startsWith('basic:')).length, 10);
});

test('classifyProbeFailure distingue cuota, credenciales y tiempo agotado', () => {
  assert.equal(classifyProbeFailure({ error: 'insufficient_quota' }, { status: 'failed' }), 'quota');
  assert.equal(classifyProbeFailure({ rawError: '401 unauthorized' }, { status: 'failed' }), 'credentials');
  assert.equal(classifyProbeFailure({ timedOut: true }, { status: 'failed' }), 'timeout');
  assert.equal(classifyProbeFailure({}, { status: 'failed', reason: 'Se agotó el tiempo máximo' }), 'timeout');
  assert.equal(classifyProbeFailure({}, { status: 'approved' }), null);
});

test('classifyProbeFailure detecta modelos no disponibles después de cuota y credenciales', () => {
  for (const error of [
    'model not found',
    'ProviderModelNotFoundError: provider/model',
    'unknown model provider/model',
    'Model provider/model is not available',
    'model provider/model not supported',
    'provider/model does not exist',
    'no such model provider/model',
  ]) {
    assert.equal(classifyProbeFailure({ rawError: error }, { status: 'failed' }), 'unavailable', error);
  }
  assert.equal(classifyProbeFailure({ error: 'model not found; insufficient_quota' }, { status: 'failed' }), 'quota');
  assert.equal(classifyProbeFailure({ error: 'unknown model; 401 unauthorized' }, { status: 'failed' }), 'credentials');
  assert.equal(classifyProbeFailure({ error: 'model not available', timedOut: true }, { status: 'failed', reason: 'timeout' }), 'unavailable');
});

test('unavailable no cuenta para cuota ni reinicia la racha', async () => {
  const ids = ['cuota-1', 'inexistente', 'cuota-2', 'sin-probar'];
  const result = await rankModels({
    candidates: ids.map((id) => candidate(id)), executor: {}, adapter: {}, stopAfterQuota: 2,
    probes: fakeProbes({ basic: {
      'cuota-1': failed('cuota', 1, { error: 'insufficient_quota' }),
      inexistente: failed('no existe', 1, { rawError: 'model not found' }),
      'cuota-2': failed('cuota', 1, { error: 'insufficient_quota' }),
    } }),
  });
  assert.equal(result.stoppedBy, 'cuota');
  assert.equal(result.tested, 3);
  assert.deepEqual(result.skipped, ['sin-probar']);
  assert.equal(result.entries.find(({ id }) => id === 'inexistente').kind, 'unavailable');
});

test('rankModels persiste modelos y ranking conservando registros y campos anteriores', async () => {
  const home = temp();
  const now = new Date('2026-10-05T10:30:00.000Z');
  try {
    saveChecks({ lastRun: '2026-10-04', models: { 'antiguo-free': { status: 'approved', seconds: 2 } }, extra: { keep: true } }, home);
    await rankModels({
      candidates: [candidate('nuevo-free')], executor: {}, adapter: {}, home, now,
      probes: fakeProbes({ basic: { 'nuevo-free': approved(2) }, hard: { 'nuevo-free': failed('falló', 3) } }),
    });
    const checks = loadChecks(home);
    assert.deepEqual(checks.models['antiguo-free'], { status: 'approved', seconds: 2 });
    assert.deepEqual(checks.models['nuevo-free'], {
      status: 'approved', checkedAt: '2026-10-05T00:00:00.000Z', seconds: 2, reason: 'correcto',
    });
    assert.equal(checks.ranking.at, now.toISOString());
    assert.equal(checks.ranking.stoppedBy, null);
    assert.equal(checks.ranking.entries.length, 1);
    const [saved] = checks.ranking.entries;
    assert.deepEqual([saved.id, saved.score, saved.seconds, saved.kind], ['nuevo-free', 1, 5, 'parcial']);
    assert.equal(saved.basic.status, 'approved');
    assert.equal(saved.hard.status, 'failed');
    assert.equal(saved.listed, true);
    assert.equal(saved.source, 'metadatos');
    assert.deepEqual(checks.extra, { keep: true });
    assert.equal(JSON.parse(readFileSync(checksFile(home), 'utf8')).ranking.entries.length, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('renderRanking alinea columnas y añade mejor, detención, sin probar y modelos no listados', () => {
  const output = renderRanking({
    tested: 1,
    stoppedBy: 'cuota',
    skipped: ['otro-free'],
    entries: [{
      id: 'opencode/model-free', name: 'Modelo', source: 'metadatos', context: 128000, reasoning: true,
      basic: { status: 'approved' }, hard: null, score: 1, seconds: 1.26, kind: 'parcial',
    }],
  }, { date: '2026-10-05', total: 2, unlisted: ['opencode/a', 'opencode/b', 'opencode/c', 'opencode/d', 'opencode/e', 'opencode/f'] });
  assert.match(output, /^Ranquing de modelos gratuitos de OpenCode — 2026-10-05/m);
  assert.match(output, /Prueba 1\s+Prueba 2\s+Tiempo\s+Nota/);
  assert.match(output, /✔\s+—\s+1\.3 s\s+contexto 128k, razona, detectado por metadatos/);
  assert.match(output, /Mejor: opencode\/model-free  →  agentrelay use opencode opencode\/model-free/);
  assert.match(output, /Pruebas detenidas: varios modelos seguidos devolvieron límite o cuota agotada; vuelve a intentarlo más tarde\./);
  assert.match(output, /Sin probar: 1 de 2 \(usa --all para probarlos todos\)\./);
  assert.match(output, /Gratuitos según models\.dev que tu cuenta no lista: opencode\/a, opencode\/b, opencode\/c, opencode\/d, opencode\/e, …\./);
});

test('renderRanking muestra notas de unavailable y de fuentes nuevas y omite líneas vacías', () => {
  const output = renderRanking({
    tested: 3,
    skipped: [],
    entries: [
      { id: 'unknown', source: 'sin precio conocido', basic: failed(), hard: null, score: 0, seconds: 1, kind: 'fail' },
      { id: 'unlisted', source: 'metadatos, no listado', listed: false, basic: failed(), hard: null, score: 0, seconds: 1, kind: 'unavailable' },
    ],
  }, { date: '2026-10-05', total: 3, unlisted: [] });
  assert.match(output, /no disponible en tu cuenta/);
  assert.match(output, /precio desconocido/);
  assert.match(output, /no listado en tu cuenta/);
  assert.doesNotMatch(output, /Sin probar:/);
  assert.doesNotMatch(output, /Gratuitos según models\.dev/);
});

test('buildHardProbe acepta una implementación correcta y rechaza una incorrecta', () => {
  const base = temp();
  const correct = `export function analizar(texto) {
  const personas = [];
  for (const [index, original] of texto.split(/\\r?\\n/).entries()) {
    const linea = original.trim();
    if (!linea || linea.startsWith('#')) continue;
    const campos = linea.split(';').map((campo) => campo.trim());
    const edad = Number(campos[1]);
    if (campos.length !== 3 || !/^\\d+$/.test(campos[1]) || !Number.isInteger(edad) || edad < 0) throw new Error('Línea ' + (index + 1));
    personas.push({ nombre: campos[0], edad, ciudad: campos[2] });
  }
  return personas;
}
export function agrupar(personas) {
  const grupos = {};
  for (const persona of personas) (grupos[persona.ciudad] ??= []).push(persona.nombre);
  for (const nombres of Object.values(grupos)) nombres.sort((a, b) => a.localeCompare(b));
  return Object.fromEntries(Object.keys(grupos).sort((a, b) => a.localeCompare(b)).map((ciudad) => [ciudad, grupos[ciudad]]));
}`;
  try {
    const good = buildHardProbe(base);
    writeFileSync(path.join(good.workDir, 'analizar.js'), correct);
    const goodRun = spawnSync(process.execPath, [good.checkFile], { cwd: good.root, encoding: 'utf8' });
    assert.equal(goodRun.status, 0, goodRun.stderr);

    const bad = buildHardProbe(base);
    writeFileSync(path.join(bad.workDir, 'analizar.js'), 'export function analizar() { return []; } export function agrupar() { return {}; }');
    const badRun = spawnSync(process.execPath, [bad.checkFile], { cwd: bad.root, encoding: 'utf8' });
    assert.equal(badRun.status, 1);
    assert.match(badRun.stderr, /analiza una fila/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('classifyProbeFailure reconoce «Model unavailable» de OpenCode, también con colores ANSI', () => {
  const esc = String.fromCharCode(27);
  const raw = { error: 'error desconocido', rawError: esc + '[91m' + esc + '[1mError: ' + esc + '[0mModel unavailable: opencode/glm-5-free' };
  assert.equal(classifyProbeFailure(raw, { status: 'failed', reason: 'El ejecutor no terminó correctamente' }), 'unavailable');
});
