import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyExecutorError } from '../src/executors/common.js';
import { apiProfileDir, hasApiProfile, run } from '../src/executors/codex.js';
import { isExhausted } from '../src/free-ranking.js';
import { loadChecks } from '../src/model-check.js';
import { FAKE_CODEX } from './helpers.js';

const ENV_KEYS = ['AGENTRELAY_HOME', 'CODEX_HOME', 'FAKE_CODEX_LOG', 'FAKE_CODEX_QUOTA_UNLESS_HOME'];

function makeContext({ profile = false, quota = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-codex-api-'));
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const home = path.join(root, 'agentrelay-home');
  const cwd = path.join(root, 'work');
  const log = path.join(root, 'codex.log');
  mkdirSync(cwd);
  writeFileSync(log, '');
  process.env.AGENTRELAY_HOME = home;
  process.env.CODEX_HOME = path.join(root, 'chatgpt-codex');
  process.env.FAKE_CODEX_LOG = log;
  if (quota) process.env.FAKE_CODEX_QUOTA_UNLESS_HOME = path.join(home, 'codex-api');
  else delete process.env.FAKE_CODEX_QUOTA_UNLESS_HOME;
  if (profile) {
    mkdirSync(path.join(home, 'codex-api'), { recursive: true });
    writeFileSync(path.join(home, 'codex-api', 'auth.json'), '');
  }

  return {
    home,
    cwd,
    log,
    executor: { command: [process.execPath, FAKE_CODEX], model: 'gpt-6-luna', timeoutSeconds: 10 },
    promptFile: '.prompt.md',
    calls: () => readFileSync(log, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
    cleanup: () => {
      for (const key of ENV_KEYS) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('codex: reintenta con API al agotar ChatGPT y después usa API directamente durante una hora', async () => {
  const context = makeContext({ profile: true });
  try {
    assert.equal(hasApiProfile(), true);
    assert.equal(apiProfileDir(), path.join(context.home, 'codex-api'));
    const activity = [];
    const first = await run({ ...context, onActivity: (event) => activity.push(event) });
    assert.equal(first.ok, true);
    assert.equal(first.billing, 'api');
    assert.equal(first.fellBackFromQuota, true);
    assert.equal(isExhausted(loadChecks(context.home), 'codex:chatgpt'), true);
    assert.ok(activity.some((event) => event.kind === 'thinking' && event.text === 'Cuota gratuita de ChatGPT agotada: sigo con tu clave de API (de pago).'));
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME, apiProfileDir()]);

    writeFileSync(context.log, '');
    const second = await run(context);
    assert.equal(second.ok, true);
    assert.equal(second.billing, 'api');
    assert.equal(second.fellBackFromQuota, undefined);
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [apiProfileDir()]);
  } finally {
    context.cleanup();
  }
});

test('codex: sin perfil de API devuelve el error de cuota clasificable', async () => {
  const context = makeContext();
  try {
    assert.equal(hasApiProfile(), false);
    const result = await run(context);
    assert.equal(result.ok, false);
    assert.equal(result.billing, 'chatgpt');
    assert.match(result.error, /usage limit/i);
    assert.equal(classifyExecutorError(result.error), 'quota');
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME]);
    assert.equal(existsSync(path.join(context.home, 'model-checks.json')), false);
  } finally {
    context.cleanup();
  }
});

test('codex: apiFallback false conserva el error de cuota aunque exista perfil', async () => {
  const context = makeContext({ profile: true });
  try {
    const result = await run({ ...context, executor: { ...context.executor, apiFallback: false } });
    assert.equal(result.ok, false);
    assert.equal(result.billing, 'chatgpt');
    assert.equal(result.fellBackFromQuota, undefined);
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME]);
    assert.equal(existsSync(path.join(context.home, 'model-checks.json')), false);
  } finally {
    context.cleanup();
  }
});

test('codex: usa la sesión de ChatGPT cuando no se detecta cuota agotada', async () => {
  const context = makeContext({ profile: true, quota: false });
  try {
    const result = await run(context);
    assert.equal(result.ok, true);
    assert.equal(result.billing, 'chatgpt');
    assert.equal(result.fellBackFromQuota, undefined);
    assert.deepEqual(context.calls(), []);
  } finally {
    context.cleanup();
  }
});
