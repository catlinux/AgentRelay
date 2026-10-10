import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRankCandidates, filterRankCandidates } from '../src/cli.js';
import { mergeRankEntries } from '../src/model-rank.js';

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
  return spawnSync(process.execPath, [BIN, '--cwd', context.root, 'rank', ...args], {
    cwd: context.root,
    encoding: 'utf8',
    env: context.env,
  });
}

function saveRanking(home, at = '2000-01-01T10:00:00.000Z') {
  const good = (id, score) => ({
    id, name: id, source: 'metadatos', context: 128000, reasoning: true,
    basic: { status: 'approved', seconds: 1, reason: 'correcto' },
    hard: { status: score === 2 ? 'approved' : 'failed', seconds: 2, reason: 'correcto' },
    score, seconds: 3, kind: score === 2 ? 'ok' : 'parcial',
  });
  writeFileSync(path.join(home, 'model-checks.json'), `${JSON.stringify({
    lastRun: null,
    models: {},
    ranking: { at, stoppedBy: null, entries: [good('opencode/mejor-free', 2), good('opencode/otro-free', 1)] },
  })}\n`);
}

test('rank --run sin OpenCode instalado explica cómo instalarlo y devuelve 1', () => {
  const context = setup();
  try {
    const result = cli(context, ['--run']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OpenCode no está instalado/);
    assert.match(result.stderr, /agentrelay executors add opencode/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank --run --background sin OpenCode sale en silencio con 0', () => {
  const context = setup();
  try {
    const result = cli(context, ['--run', '--background']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank sin ranquing guardado explica cómo calcularlo y devuelve 0', () => {
  const context = setup();
  try {
    const result = cli(context, []);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Aún no hay ranquing/);
    assert.match(result.stdout, /agentrelay rank --run/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank muestra la tabla guardada y avisa si tiene más de 24 horas', () => {
  const context = setup();
  try {
    saveRanking(context.home);
    const result = cli(context, []);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Último ranquing guardado \(/);
    assert.match(result.stdout, /Modelo/);
    assert.match(result.stdout, /Mejor: opencode\/mejor-free/);
    assert.match(result.stdout, /Tiene más de 24 horas; para recalcularlo: agentrelay rank --run/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank --run rechaza --max 0', () => {
  const context = setup();
  try {
    const result = cli(context, ['--run', '--max', '0']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--max debe ser un entero mayor o igual que 1/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank --provider filtra candidatos por proveedor', () => {
  const candidates = [
    { id: 'opencode/zen-free' },
    { id: 'nvidia/nemotron-free' },
    { id: 'google/gemini-free' },
  ];
  assert.deepEqual(filterRankCandidates(candidates, ['nvidia']).map(({ id }) => id), ['nvidia/nemotron-free']);
  assert.deepEqual(filterRankCandidates(candidates, ['opencode', 'google']).map(({ id }) => id), ['opencode/zen-free', 'google/gemini-free']);
});

test('rank --provider acepta la lista separada por comas o por espacios', () => {
  for (const list of ['nvidia,desconocido', 'nvidia desconocido']) {
    const context = setup();
    try {
      const result = cli(context, ['--run', '--provider', list]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Proveedor desconocido: desconocido./);
    } finally { rmSync(context.root, { recursive: true, force: true }); }
  }
});

test('rank --provider rechaza un proveedor desconocido', () => {
  const context = setup();
  try {
    const result = cli(context, ['--run', '--provider', 'unknown']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Proveedor desconocido: unknown\. Disponibles: opencode, nvidia, google, mistral, openrouter, zai, deepseek\./);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('rank --provider conserva las entradas guardadas de otros proveedores', () => {
  const previous = [
    { id: 'nvidia/anterior', apt: false, tier: null, score: 1, kind: 'parcial', seconds: 5 },
    { id: 'google/conservado', apt: true, tier: 'A', score: 3, kind: 'ok', seconds: 2 },
  ];
  const updated = [
    { id: 'nvidia/nuevo', apt: true, tier: 'B', score: 3, kind: 'ok', seconds: 4 },
  ];
  const merged = mergeRankEntries(previous, updated, ['nvidia']);
  assert.deepEqual(merged.map(({ id }) => id), ['google/conservado', 'nvidia/nuevo']);
  assert.equal(merged[0], previous[1]);
  assert.equal(merged.some(({ id }) => id === 'nvidia/anterior'), false);
});

test('rank convierte los modelos listados de proveedores conectados en candidatos', async () => {
  const adapter = { listModels: async () => [
    { id: 'opencode/zen-free' },
    { id: 'google/gemini-free' },
    { id: 'google/gemini-limited' },
    { id: 'groq/llama-free' },
  ] };
  const metadata = {
    models: {
      'zen-free': { name: 'Zen', cost: { input: 0, output: 0 }, limit: { context: 128000 }, reasoning: true, tool_call: true },
    },
    providers: {
      google: {
        'gemini-free': { name: 'Gemini', cost: { input: 0, output: 0 }, limit: { context: 100000 }, reasoning: true, tool_call: true, release_date: '2026-01-01' },
        'gemini-limited': { name: 'Gemini Limited', cost: { input: 0.1, output: 0.2 }, limit: { context: 100000 }, reasoning: true, tool_call: true, release_date: '2025-01-01' },
      },
      groq: {
        'llama-free': { name: 'Llama', cost: { input: 0, output: 0 }, limit: { context: 100000 }, reasoning: false, tool_call: true },
      },
    },
  };
  const listed = await adapter.listModels({});
  const candidates = discoverRankCandidates({ listed, metadata, source: 'red', connected: ['google'] });
  assert.deepEqual(candidates.map(({ id, free, listed: isListed, reason, name, context, reasoning, toolCall, releaseDate, freeTier, cost }) => ({
    id, free, listed: isListed, reason, name, context, reasoning, toolCall, releaseDate, freeTier, cost,
  })), [
    {
      id: 'opencode/zen-free', free: true, listed: true, reason: 'metadatos', name: 'Zen', context: 128000,
      reasoning: true, toolCall: true, releaseDate: null, freeTier: undefined, cost: undefined,
    },
    {
      id: 'google/gemini-free', free: true, listed: true, reason: 'metadatos', name: 'Gemini', context: 100000,
      reasoning: true, toolCall: true, releaseDate: '2026-01-01', freeTier: true, cost: { input: 0, output: 0 },
    },
    {
      id: 'google/gemini-limited', free: true, listed: true, reason: 'nivel gratuito con límites', name: 'Gemini Limited', context: 100000,
      reasoning: true, toolCall: true, releaseDate: '2025-01-01', freeTier: true, cost: { input: 0.1, output: 0.2 },
    },
  ]);

  const zenOnly = await { listModels: async () => [{ id: 'opencode/zen-free' }] }.listModels({});
  assert.deepEqual(
    discoverRankCandidates({ listed: zenOnly, metadata, source: 'red', connected: ['google'] }).map(({ id }) => id),
    ['opencode/zen-free'],
  );
});

test('rank --json imprime el ranquing guardado como JSON', () => {
  const context = setup();
  try {
    saveRanking(context.home);
    const result = cli(context, ['--json']);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).entries[0].id, 'opencode/mejor-free');
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});

test('executors rank ya no es un comando válido', () => {
  const context = setup();
  try {
    const result = spawnSync(process.execPath, [BIN, '--cwd', context.root, 'executors', 'rank'], {
      cwd: context.root,
      encoding: 'utf8',
      env: context.env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Uso: agentrelay executors \[add <nombre> \| check \[--force\]\]/);
  } finally { rmSync(context.root, { recursive: true, force: true }); }
});
