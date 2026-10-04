import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-model-rank-cli-'));
  const home = path.join(root, 'home');
  const executors = path.join(root, 'executors');
  const emptyPath = path.join(root, 'empty-path');
  mkdirSync(home);
  mkdirSync(executors);
  mkdirSync(emptyPath);
  return { root, home, env: {
    ...process.env,
    AGENTRELAY_HOME: home,
    AGENTRELAY_EXECUTORS_DIR: executors,
    AGENTRELAY_NO_MIGRATE: '1',
    PATH: emptyPath,
  } };
}

function cli(context, args) {
  return spawnSync(process.execPath, [BIN, '--cwd', context.root, 'executors', 'rank', ...args], {
    cwd: context.root,
    encoding: 'utf8',
    env: context.env,
  });
}

function saveRanking(home) {
  const good = (id, score) => ({
    id, name: id, source: 'metadatos', context: 128000, reasoning: true,
    basic: { status: 'approved', seconds: 1, reason: 'correcto' },
    hard: { status: score === 2 ? 'approved' : 'failed', seconds: 2, reason: 'correcto' },
    score, seconds: 3, kind: score === 2 ? 'ok' : 'parcial',
  });
  writeFileSync(path.join(home, 'model-checks.json'), `${JSON.stringify({
    lastRun: null,
    models: {},
    ranking: { at: '2026-10-05T10:00:00.000Z', stoppedBy: null, entries: [good('opencode/mejor-free', 2), good('opencode/otro-free', 1)] },
  })}\n`);
}

test('executors rank sin OpenCode instalado explica cómo instalarlo y devuelve 1', () => {
  const context = setup();
  try {
    const result = cli(context, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OpenCode no está instalado/);
    assert.match(result.stderr, /agentrelay executors add opencode/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank --background sin OpenCode sale en silencio con 0', () => {
  const context = setup();
  try {
    const result = cli(context, ['--background']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank --show sin ranquing guardado informa y devuelve 0', () => {
  const context = setup();
  try {
    const result = cli(context, ['--show']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Aún no hay ranquing/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank --show presenta la tabla y el mejor modelo guardado', () => {
  const context = setup();
  try {
    saveRanking(context.home);
    const result = cli(context, ['--show']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Último ranquing guardado \(/);
    assert.match(result.stdout, /Modelo/);
    assert.match(result.stdout, /Mejor: opencode\/mejor-free/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank rechaza --max 0', () => {
  const context = setup();
  try {
    const result = cli(context, ['--max', '0']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--max debe ser un entero mayor o igual que 1/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank --show --json imprime JSON válido', () => {
  const context = setup();
  try {
    saveRanking(context.home);
    const result = cli(context, ['--show', '--json']);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).entries[0].id, 'opencode/mejor-free');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});
