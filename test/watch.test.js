import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchRuns } from '../src/watch.js';

const T0 = '2026-09-30T10:00:00.000Z';

function makeRun(root, id) {
  const dir = path.join(root, '.agentrelay', 'runs', id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function eventsPath(root, id) {
  return path.join(root, '.agentrelay', 'runs', id, 'events.ndjson');
}

/** Espera (con margen) a que se cumpla una condición. */
async function waitFor(fn, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('watch: con id muestra eventos y termina tras un estado final', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-watch-'));
  try {
    makeRun(dir, 'r1');
    writeFileSync(eventsPath(dir, 'r1'), `{"type":"status","status":"running","ts":"${T0}"}\n`);

    const lines = [];
    const promise = watchRuns({ root: dir, id: 'r1', write: (l) => lines.push(l), intervalMs: 20 });

    await waitFor(() => lines.some((l) => l.includes('Estado: running')));

    appendFileSync(eventsPath(dir, 'r1'), '{"type":"activity","kind":"thinking","text":"pensando","ts":"2026-09-30T10:00:02.000Z"}\n');
    await waitFor(() => lines.some((l) => l.includes('piensa: pensando')));

    appendFileSync(eventsPath(dir, 'r1'), '{"type":"status","status":"awaiting_review","ts":"2026-09-30T10:00:05.000Z"}\n');
    await promise; // termina sola tras awaiting_review

    assert.ok(lines.some((l) => l.includes('Estado: running')));
    assert.ok(lines.some((l) => l.includes('piensa: pensando')));
    assert.ok(lines.some((l) => l.includes('Estado: awaiting_review')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch: sin id sigue la última y cambia a las nuevas', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-watch-'));
  try {
    const lines = [];
    const ac = new AbortController();
    const promise = watchRuns({ root: dir, write: (l) => lines.push(l), intervalMs: 20, signal: ac.signal });

    await waitFor(() => lines.includes('Esperando ejecuciones…'));

    makeRun(dir, 'run-01');
    writeFileSync(path.join(dir, '.agentrelay', 'runs', 'run-01', 'state.json'), '{"id":"run-01","status":"running"}\n');
    writeFileSync(eventsPath(dir, 'run-01'), `{"type":"status","status":"running","ts":"${T0}"}\n`);
    await waitFor(() => lines.includes('── Ejecución run-01 ──') && lines.some((l) => l.includes('Estado: running')));

    makeRun(dir, 'run-02');
    writeFileSync(path.join(dir, '.agentrelay', 'runs', 'run-02', 'state.json'), '{"id":"run-02","status":"accepted"}\n');
    writeFileSync(eventsPath(dir, 'run-02'), `{"type":"status","status":"accepted","ts":"${T0}"}\n`);
    await waitFor(() => lines.includes('── Ejecución run-02 ──') && lines.some((l) => l.includes('Estado: accepted')));

    ac.abort();
    await promise;

    assert.equal(lines[0], 'Esperando ejecuciones…');
    const i1 = lines.indexOf('── Ejecución run-01 ──');
    const i2 = lines.indexOf('── Ejecución run-02 ──');
    assert.ok(i1 > 0);
    assert.ok(i2 > i1);
    assert.equal(lines[i1 - 1], '');
    assert.equal(lines[i2 - 1], '');
    assert.ok(lines.some((l) => l.includes('Estado: running')));
    assert.ok(lines.some((l) => l.includes('Estado: accepted')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch: procesa una línea partida en dos trozos una sola vez', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-watch-'));
  try {
    makeRun(dir, 'r1');
    writeFileSync(
      eventsPath(dir, 'r1'),
      `{"type":"status","status":"running","ts":"${T0}"}\n{"type":"activity","kind":"thinking","text":"trozo`,
    );

    const lines = [];
    const ac = new AbortController();
    const promise = watchRuns({ root: dir, id: 'r1', write: (l) => lines.push(l), intervalMs: 20, signal: ac.signal });

    await waitFor(() => lines.some((l) => l.includes('Estado: running')));

    appendFileSync(eventsPath(dir, 'r1'), ' uno","ts":"2026-09-30T10:00:02.000Z"}\n');
    await waitFor(() => lines.some((l) => l.includes('piensa: trozo uno')));

    await sleep(60);
    assert.equal(lines.filter((l) => l.includes('piensa: trozo uno')).length, 1);

    ac.abort();
    await promise;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch: no corrompe un carácter UTF-8 partido entre dos lecturas', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-watch-'));
  try {
    makeRun(dir, 'r1');
    const line = Buffer.from('{"type":"activity","kind":"thinking","text":"añadiendo…","ts":"2026-09-30T10:00:02.000Z"}\n');
    const cut = line.indexOf(Buffer.from('…')) + 1; // a mitad de los 3 bytes de "…"
    writeFileSync(eventsPath(dir, 'r1'), `{"type":"status","status":"running","ts":"${T0}"}\n`);
    appendFileSync(eventsPath(dir, 'r1'), line.subarray(0, cut));

    const lines = [];
    const ac = new AbortController();
    const promise = watchRuns({ root: dir, id: 'r1', write: (l) => lines.push(l), intervalMs: 20, signal: ac.signal });
    await waitFor(() => lines.some((l) => l.includes('Estado: running')));
    await sleep(60);
    appendFileSync(eventsPath(dir, 'r1'), line.subarray(cut));
    await waitFor(() => lines.some((l) => l.includes('piensa:')));

    assert.ok(lines.some((l) => l.includes('piensa: añadiendo…')));
    ac.abort();
    await promise;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('watch: ignora una línea JSON inválida', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-watch-'));
  try {
    makeRun(dir, 'r1');
    writeFileSync(
      eventsPath(dir, 'r1'),
      `{"type":"status","status":"running","ts":"${T0}"}\nesto no es json\n{"type":"status","status":"awaiting_review","ts":"2026-09-30T10:00:05.000Z"}\n`,
    );

    const lines = [];
    await watchRuns({ root: dir, id: 'r1', write: (l) => lines.push(l), intervalMs: 20 });

    assert.ok(lines.some((l) => l.includes('Estado: running')));
    assert.ok(lines.some((l) => l.includes('Estado: awaiting_review')));
    assert.equal(lines.filter((l) => l.includes('json')).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
