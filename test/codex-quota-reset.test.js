import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseQuotaReset } from '../src/executors/common.js';
import { apiProfileDir, run } from '../src/executors/codex.js';
import { lastQuotaEvent, logQuotaEvent, markExhausted } from '../src/free-ranking.js';
import { loadChecks } from '../src/model-check.js';
import { FAKE_CODEX } from './helpers.js';

const ENV_KEYS = ['AGENTRELAY_HOME', 'CODEX_HOME', 'FAKE_CODEX_LOG', 'FAKE_CODEX_QUOTA_UNLESS_HOME', 'FAKE_CODEX_QUOTA_MESSAGE'];
const QUOTA_ID = 'codex:chatgpt';

function makeContext({ profile = true, quota = true, message } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-codex-quota-reset-'));
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
  else process.env.FAKE_CODEX_QUOTA_UNLESS_HOME = process.env.CODEX_HOME;
  if (message === undefined) delete process.env.FAKE_CODEX_QUOTA_MESSAGE;
  else process.env.FAKE_CODEX_QUOTA_MESSAGE = message;
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

test('parseQuotaReset lee JSON, duraciones, horas locales y fechas futuras', () => {
  const now = new Date(2026, 9, 5, 10, 0, 0);
  const expected = (milliseconds) => new Date(now.getTime() + milliseconds);
  for (const [text, milliseconds] of [
    ['{"resets_in_seconds": 90}', 90_000],
    [`{"resets_at": ${Math.floor((now.getTime() + 120_000) / 1000)}}`, 120_000],
    [`{"resets_at": ${now.getTime() + 180_000}}`, 180_000],
    ['try again in 2 hours 15 minutes', (2 * 60 + 15) * 60_000],
    ['try again in 45 minutes', 45 * 60_000],
    ['try again in 3 days', 3 * 24 * 60 * 60_000],
    ['try again in 1 hour and 5 minutes', 65 * 60_000],
    ['try again in 30 seconds', 30_000],
    ['try again in 2 hrs 10 mins', 130 * 60_000],
    ['try again in 1d 2h 3m 4s', (((24 + 2) * 60 + 3) * 60 + 4) * 1000],
  ]) assert.equal(parseQuotaReset(text, now)?.getTime(), expected(milliseconds).getTime(), text);

  assert.equal(parseQuotaReset('try again at 3:45 PM', now)?.getTime(), new Date(2026, 9, 5, 15, 45).getTime());
  assert.equal(parseQuotaReset('try again at 10:00', now)?.getTime(), new Date(2026, 9, 6, 10, 0).getTime());
  assert.equal(parseQuotaReset('try again on 2026-10-07T10:00:00Z', now)?.toISOString(), '2026-10-07T10:00:00.000Z');
  assert.equal(parseQuotaReset('try again in 0 seconds', now), null);
  assert.equal(parseQuotaReset('try again in 9 days', now), null);
  assert.equal(parseQuotaReset('quota exhausted', now), null);
});

test('codex: registra la hora de reset conocida y cambia a la API', async () => {
  const context = makeContext({ message: 'Usage limit reached; {"resets_in_seconds": 120}' });
  try {
    const before = Date.now();
    const activity = [];
    const result = await run({ ...context, onActivity: (event) => activity.push(event) });
    const after = Date.now();
    const checks = loadChecks(context.home);
    const exhausted = checks.exhausted[QUOTA_ID];
    const reset = Date.parse(exhausted.until);
    assert.equal(result.ok, true);
    assert.equal(result.billing, 'api');
    assert.equal(result.fellBackFromQuota, true);
    assert.equal(result.quotaResetAt, exhausted.until);
    assert.equal(exhausted.resetKnown, true);
    assert.ok(reset >= before + 179_000 && reset <= after + 181_000);
    assert.deepEqual(lastQuotaEvent(checks, QUOTA_ID), {
      at: exhausted.at, id: QUOTA_ID, event: 'agotada', until: exhausted.until,
      resetKnown: true, reason: 'cuota gratuita de ChatGPT agotada',
    });
    assert.match(activity.find((event) => event.kind === 'thinking')?.text, /se vuelve a probar a las \d{2}:\d{2}/);
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME, apiProfileDir()]);
  } finally { context.cleanup(); }
});

test('codex: sin hora conocida programa el siguiente intento a diez minutos', async () => {
  const context = makeContext({ message: "You've hit your usage limit." });
  try {
    const before = Date.now();
    const result = await run(context);
    const checks = loadChecks(context.home);
    const exhausted = checks.exhausted[QUOTA_ID];
    const reset = Date.parse(exhausted.until);
    assert.equal(result.ok, true);
    assert.equal(exhausted.resetKnown, false);
    assert.ok(reset >= before + 599_000 && reset <= Date.now() + 601_000);
    assert.equal(lastQuotaEvent(checks, QUOTA_ID).resetKnown, false);
  } finally { context.cleanup(); }
});

test('codex: marca vigente va directamente a la API y expone quotaResetAt', async () => {
  const context = makeContext();
  try {
    const until = new Date(Date.now() + 60 * 60_000);
    markExhausted(QUOTA_ID, { home: context.home, until, resetKnown: true });
    const result = await run(context);
    assert.equal(result.ok, true);
    assert.equal(result.billing, 'api');
    assert.equal(result.quotaResetAt, until.toISOString());
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [apiProfileDir()]);
  } finally { context.cleanup(); }
});

test('codex: al volver la cuota gratuita limpia la marca y registra restablecida', async () => {
  const context = makeContext({ quota: false });
  try {
    const expired = new Date(Date.now() - 60_000);
    markExhausted(QUOTA_ID, { home: context.home, until: expired, resetKnown: false });
    logQuotaEvent(context.home, { id: QUOTA_ID, event: 'agotada', until: expired, resetKnown: false });
    const result = await run(context);
    const checks = loadChecks(context.home);
    assert.equal(result.ok, true);
    assert.equal(result.billing, 'chatgpt');
    assert.equal(checks.exhausted?.[QUOTA_ID], undefined);
    assert.equal(lastQuotaEvent(checks, QUOTA_ID).event, 'restablecida');
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME]);
  } finally { context.cleanup(); }
});

test('codex: si la cuota sigue agotada tras el reintento se vuelve a marcar y usar API', async () => {
  const context = makeContext({ message: 'Usage limit reached; retry later.' });
  try {
    const expired = new Date(Date.now() - 60_000);
    markExhausted(QUOTA_ID, { home: context.home, until: expired, resetKnown: false });
    logQuotaEvent(context.home, { id: QUOTA_ID, event: 'agotada', until: expired, resetKnown: false });
    const result = await run(context);
    const checks = loadChecks(context.home);
    assert.equal(result.ok, true);
    assert.equal(result.billing, 'api');
    assert.equal(lastQuotaEvent(checks, QUOTA_ID).event, 'agotada');
    assert.equal(checks.exhausted[QUOTA_ID].resetKnown, false);
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME, apiProfileDir()]);
  } finally { context.cleanup(); }
});

test('codex: sin perfil API no registra la cuota ni hace un segundo intento', async () => {
  const context = makeContext({ profile: false });
  try {
    const result = await run(context);
    assert.equal(result.ok, false);
    assert.equal(result.billing, 'chatgpt');
    assert.equal(existsSync(path.join(context.home, 'model-checks.json')), false);
    assert.deepEqual(context.calls().map(({ CODEX_HOME }) => CODEX_HOME), [process.env.CODEX_HOME]);
  } finally { context.cleanup(); }
});
