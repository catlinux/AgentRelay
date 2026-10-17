import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authStatus, buildArgs, checkSession, parseOutput, readQuota, toActivity } from '../src/executors/gemini.js';
import { parseRateLimits } from '../src/executors/codex.js';
import { classifyExecutorError, parseQuotaReset } from '../src/executors/common.js';
import { collectQuotas, formatReset, renderQuotas } from '../src/cuota.js';
import { GEMINI_FREE_QUOTA, routeEntries } from '../src/router.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const config = (routing = {}) => ({ ...DEFAULT_CONFIG, executor: { ...DEFAULT_CONFIG.executor }, routing: { ...DEFAULT_CONFIG.routing, ...routing } });

test('gemini: argumentos del modo no interactivo; "auto" no fija modelo', () => {
  assert.deepEqual(buildArgs({ model: 'auto' }, 'lee x'), ['-p', 'lee x', '-o', 'stream-json', '--approval-mode', 'yolo', '--skip-trust']);
  assert.deepEqual(buildArgs({ model: 'gemini-2.5-pro' }, 'lee x').slice(-2), ['-m', 'gemini-2.5-pro']);
});

test('gemini: parseOutput junta el texto del asistente, herramientas, tokens y errores', () => {
  const lines = [
    { type: 'init', model: 'gemini-2.5-pro' },
    { type: 'message', role: 'user', content: 'no cuenta' },
    { type: 'message', role: 'assistant', content: 'Hecho. ', delta: true },
    { type: 'tool_use', tool_name: 'write_file', parameters: { file_path: '/r/a.js' } },
    { type: 'message', role: 'assistant', content: '{"status":"done"}', delta: true },
    { type: 'result', status: 'success', stats: { input_tokens: 10, output_tokens: 5, cached: 2 } },
  ].map((e) => JSON.stringify(e)).join('\n');
  const parsed = parseOutput(lines);
  assert.equal(parsed.text, 'Hecho. {"status":"done"}');
  assert.equal(parsed.toolCalls, 1);
  assert.equal(parsed.model, 'gemini-2.5-pro');
  assert.deepEqual(parsed.usage, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 });
  const failed = parseOutput(JSON.stringify({ type: 'result', status: 'error', error: { message: 'Quota exceeded' } }));
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.errors, ['Quota exceeded']);
  assert.deepEqual(toActivity({ type: 'tool_use', tool_name: 'run_shell_command', parameters: { command: 'npm test' } }, '/r'), { kind: 'tool', tool: 'command', detail: 'npm test' });
});

test('gemini: el error de cuota se clasifica como cuota y se lee cuándo se renueva', () => {
  const text = 'You have exhausted your capacity on this model. Your quota will reset after 2h17m3s.';
  assert.equal(classifyExecutorError(text), 'quota');
  const now = new Date('2026-10-17T10:00:00Z');
  assert.equal(parseQuotaReset(text, now).toISOString(), '2026-10-17T12:17:03.000Z');
  assert.equal(classifyExecutorError('Error authenticating: FatalAuthenticationError: Manual authorization is required but the current session is non-interactive'), 'credentials');
});

test('gemini: readQuota consulta la API con el token guardado y no reescribe las credenciales', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-gemini-'));
  try {
    const now = new Date('2026-10-17T10:00:00Z');
    writeFileSync(path.join(dir, 'oauth_creds.json'), JSON.stringify({ access_token: 'tok', refresh_token: 'r', expiry_date: now.getTime() + 3600_000 }));
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, auth: options.headers.Authorization, body: JSON.parse(options.body) });
      if (url.endsWith(':loadCodeAssist')) return { ok: true, json: async () => ({ cloudaicompanionProject: 'proj-1', currentTier: { id: 'free-tier' } }) };
      return { ok: true, json: async () => ({ buckets: [
        { modelId: 'gemini-2.5-pro', remainingFraction: 0.25, remainingAmount: '250', resetTime: '2026-10-18T07:00:00Z' },
        { modelId: 'gemini-2.5-flash', remainingFraction: 1, resetTime: '2026-10-18T07:00:00Z' },
      ] }) };
    };
    const quota = await readQuota({ dir, env: {}, fetchImpl, now, client: null });
    assert.equal(quota.ok, true);
    assert.equal(quota.tier, 'free-tier');
    assert.deepEqual(quota.models[0], { model: 'gemini-2.5-pro', remainingPercent: 25, remaining: 250, limit: 1000, resetAt: '2026-10-18T07:00:00Z' });
    assert.equal(quota.models[1].remaining, null);
    assert.equal(calls[1].body.project, 'proj-1');
    assert.ok(calls.every((call) => call.auth === 'Bearer tok'));
    const expired = path.join(dir, 'caducado');
    mkdirSync(expired);
    writeFileSync(path.join(expired, 'oauth_creds.json'), JSON.stringify({ access_token: 'old', refresh_token: 'r', expiry_date: 1 }));
    const noClient = await readQuota({ dir: expired, env: {}, fetchImpl, now, client: null });
    assert.equal(noClient.ok, false);
    assert.match(noClient.message, /no se encuentra Gemini CLI/);
    const none = await readQuota({ dir: path.join(dir, 'nada'), env: {}, fetchImpl, now });
    assert.match(none.message, /sin sesión de Google/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('codex: parseRateLimits traduce la ventana de 5 h y la semanal', () => {
  const parsed = parseRateLimits({ rateLimits: {
    planType: 'free',
    primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: 1792240000 },
    secondary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1792600000 },
  } });
  assert.equal(parsed.plan, 'free');
  assert.deepEqual(parsed.windows[0], { usedPercent: 40, windowMinutes: 300, resetAt: new Date(1792240000 * 1000).toISOString() });
  assert.equal(parsed.windows[1].usedPercent, 100);
});

test('enrutado: Gemini va detrás de Luna con la cuota de la cuenta de Google', () => {
  const entries = routeEntries({ config: config({ freeOrder: ['gemini:auto', 'opencode:opencode-go/x-free'] }) });
  assert.deepEqual(entries.map((e) => e.key).slice(0, 3), ['codex:gpt-6-luna', 'gemini:auto', 'opencode:opencode-go/x-free']);
  assert.equal(entries[1].quotaId, GEMINI_FREE_QUOTA);
  assert.equal(entries[1].paid, false);
});

test('cuota: muestra lo que queda y cuándo se renueva de cada IA gratuita', async (t) => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-cuota-'));
  const previous = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  });
  const now = new Date(2026, 9, 17, 10, 0);
  const quotas = await collectQuotas({
    config: config({ freeOrder: ['gemini:auto'] }),
    now,
    readers: {
      luna: async () => ({ ok: true, plan: 'free', windows: [
        { usedPercent: 30, windowMinutes: 300, resetAt: new Date(2026, 9, 17, 14, 5).toISOString() },
        { usedPercent: 100, windowMinutes: 10080, resetAt: new Date(2026, 9, 20, 9, 0).toISOString() },
      ] }),
      geminiInstalled: async () => true,
      gemini: async () => ({ ok: true, tier: null, models: [{ model: 'gemini-2.5-pro', remainingPercent: 90, remaining: 900, limit: 1000, resetAt: new Date(2026, 9, 18, 9, 0).toISOString() }] }),
    },
  });
  const text = renderQuotas(quotas, now);
  assert.match(text, /✔ 5 h: queda 70 %, se renueva hoy 14:05/);
  assert.match(text, /✖ semanal: queda 0 %, se renueva mar 20\/10 09:00/);
  assert.match(text, /✔ gemini-2\.5-pro: queda 90 % \(900 de 1000\), se renueva mañana 09:00/);
  assert.equal(formatReset('no es fecha', now), null);
});

test('gemini: una sesión que Google rechaza (invalid_grant) se da por caducada, no por buena', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-gemini-sesion-'));
  try {
    writeFileSync(path.join(dir, 'oauth_creds.json'), JSON.stringify({ access_token: 'old', refresh_token: 'r', expiry_date: 1 }));
    writeFileSync(path.join(dir, 'google_accounts.json'), JSON.stringify({ active: 'yo@example.com' }));
    const rejected = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Bad Request' }) });
    const session = await checkSession({ dir, fetchImpl: rejected, client: { id: 'i', secret: 's' } });
    assert.deepEqual(session, { ok: false, expired: true, email: 'yo@example.com' });
    const status = await authStatus({}, { dir, check: () => session });
    assert.equal(status.ok, false);
    assert.match(status.message, /yo@example\.com\) ha caducado/);
    const offline = await checkSession({ dir, fetchImpl: async () => { throw new Error('fetch failed'); }, client: { id: 'i', secret: 's' } });
    assert.equal(offline.ok, true, 'sin red no se declara caducada');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('antigravity: argumentos, lectura del JSON final y grupo de cuota', async () => {
  const { buildArgs: args, parseOutput: parse, quotaGroup } = await import('../src/executors/antigravity.js');
  assert.deepEqual(args({ model: 'auto', thinking: 'high', timeoutSeconds: 600 }, 'lee x'), [
    '-p', 'lee x', '--output-format', 'json', '--dangerously-skip-permissions', '--disable-slash-commands', '--effort', 'high', '--print-timeout', '600s',
  ]);
  assert.deepEqual(args({ model: 'claude-sonnet' }, 'x').slice(-2), ['--model', 'claude-sonnet']);
  // Salida real de agy 1.4.0 en modo -p --output-format json.
  const real = '{"conversation_id":"f4bf1e6d","status":"SUCCESS","response":"hola\\n","duration_seconds":2.43,"num_turns":1,"usage":{"input_tokens":11756,"output_tokens":37,"thinking_tokens":36,"cache_read_tokens":0,"total_tokens":11793}}';
  const parsed = parse(`aviso previo\n${real}\n`);
  assert.equal(parsed.status, 'SUCCESS');
  assert.equal(parsed.text, 'hola\n');
  assert.deepEqual(parsed.usage, { inputTokens: 11756, outputTokens: 37, cacheReadTokens: 0 });
  assert.equal(parse('').status, null);
  assert.equal(quotaGroup('auto'), 'gemini');
  assert.equal(quotaGroup('Claude Sonnet 4.6'), 'claude');
  assert.equal(quotaGroup('gpt-oss-120b'), 'claude');
});

test('enrutado: Antigravity va detrás de Luna con un cupo por grupo de modelos', () => {
  const entries = routeEntries({ config: config({ freeOrder: ['antigravity:auto', 'antigravity:claude-sonnet'] }) });
  assert.deepEqual(entries.slice(1, 3).map((e) => [e.key, e.quotaId, e.paid]), [
    ['antigravity:auto', 'antigravity:gemini', false],
    ['antigravity:claude-sonnet', 'antigravity:claude', false],
  ]);
});

test('antigravity: mientras trabaja avisa de los archivos nuevos que cambia y, si no, de cuánto lleva', async () => {
  const { watchProgress } = await import('../src/executors/antigravity.js');
  const snapshots = [new Set(['ya.txt']), new Set(['ya.txt', 'a.sql']), new Set(['ya.txt', 'a.sql']), new Set(['ya.txt', 'a.sql'])];
  let clock = 0;
  const events = [];
  const stop = watchProgress('/r', (e) => events.push(e), { intervalMs: 5, quietMs: 1, list: async () => snapshots.shift() ?? new Set(['ya.txt', 'a.sql']), now: () => (clock += 60_000) });
  await new Promise((resolve) => setTimeout(resolve, 60));
  stop();
  assert.deepEqual(events[0], { kind: 'tool', tool: 'edit', detail: 'a.sql' });
  assert.ok(events.slice(1).some((e) => e.kind === 'thinking' && /sigue trabajando \(\d+ min\)/.test(e.text)));
  assert.ok(!events.some((e) => e.detail === 'ya.txt'), 'los cambios que ya había antes no se anuncian');
});

test('antigravity: listModels lee la salida real de agy models', async () => {
  const { listModels } = await import('../src/executors/antigravity.js');
  const stdout = 'gemini-3.8-flash-high     Gemini 3.8 Flash (High)\nclaude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)\ngpt-oss-120b-medium       GPT-OSS 120B (Medium)\n';
  const models = await listModels({ command: 'agy' }, { run: async () => ({ code: 0, stdout }) });
  assert.deepEqual(models.map((m) => m.id), ['gemini-3.8-flash-high', 'claude-sonnet-4-6', 'gpt-oss-120b-medium']);
});

test('antigravity: la comprobación del modelo acepta auto y los ids de agy models, y rechaza otros', async () => {
  const { checkExecutorModel } = await import('../src/executor-check.js');
  const adapter = { listModels: async () => [{ id: 'gemini-3.8-flash-high' }, { id: 'claude-sonnet-4-6' }] };
  assert.equal((await checkExecutorModel({ type: 'antigravity', model: 'auto' }, { adapter })).ok, true);
  assert.equal((await checkExecutorModel({ type: 'antigravity', model: 'claude-sonnet-4-6' }, { adapter })).ok, true);
  assert.equal((await checkExecutorModel({ type: 'antigravity', model: 'claude-sonnet' }, { adapter })).ok, false);
});
