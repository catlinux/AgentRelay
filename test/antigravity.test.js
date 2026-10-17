import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRateLimits } from '../src/executors/codex.js';
import { classifyExecutorError, parseQuotaReset } from '../src/executors/common.js';
import { collectQuotas, formatReset, renderQuotas } from '../src/cuota.js';
import { routeEntries } from '../src/router.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const config = (routing = {}) => ({ ...DEFAULT_CONFIG, executor: { ...DEFAULT_CONFIG.executor }, routing: { ...DEFAULT_CONFIG.routing, ...routing } });

test('errores de Google: cuota agotada con hora de renovación y sesión no válida', () => {
  const text = 'You have exhausted your capacity on this model. Your quota will reset after 2h17m3s.';
  assert.equal(classifyExecutorError(text), 'quota');
  const now = new Date('2026-10-17T10:00:00Z');
  assert.equal(parseQuotaReset(text, now).toISOString(), '2026-10-17T12:17:03.000Z');
  assert.equal(classifyExecutorError('Error authenticating: FatalAuthenticationError: Manual authorization is required but the current session is non-interactive'), 'credentials');
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
    config: config({ freeOrder: ['antigravity:auto'] }),
    now,
    readers: {
      luna: async () => ({ ok: true, plan: 'free', windows: [
        { usedPercent: 30, windowMinutes: 300, resetAt: new Date(2026, 9, 17, 14, 5).toISOString() },
        { usedPercent: 100, windowMinutes: 10080, resetAt: new Date(2026, 9, 20, 9, 0).toISOString() },
      ] }),
    },
  });
  const text = renderQuotas(quotas, now);
  assert.match(text, /✔ 5 h: queda 70 %, se renueva hoy 14:05/);
  assert.match(text, /✖ semanal: queda 0 %, se renueva mar 20\/10 09:00/);
  assert.match(text, /Antigravity · cuenta de Google \(cupo de Gemini\)[^\n]*\/usage\n  ✔ sin agotar según AgentRelay/);
  assert.equal(formatReset('no es fecha', now), null);
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

test('antigravity: se busca agy donde lo deja su instalador en cada sistema y el aviso de instalación es el de ese sistema', async () => {
  const { commandParts, installCommand, installedPaths } = await import('../src/executors/antigravity.js');
  const winPaths = installedPaths({ home: 'C:\\Users\\yo', platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\yo\\AppData\\Local' } });
  assert.ok(winPaths[0].endsWith(path.join('Antigravity', 'agy.exe')));
  const local = winPaths[0];
  assert.deepEqual(commandParts('agy', { platform: 'win32', home: 'C:\\Users\\yo', env: { PATH: '', LOCALAPPDATA: 'C:\\Users\\yo\\AppData\\Local' }, exists: (file) => file === local }), [local]);
  assert.deepEqual(commandParts('agy', { platform: 'linux', home: '/home/yo', env: { PATH: '/usr/bin' }, exists: () => false }), ['agy']);
  assert.match(installCommand('win32'), /irm https:\/\/antigravity\.google\/cli\/install\.ps1 \| iex/);
  assert.match(installCommand('linux'), /curl -fsSL https:\/\/antigravity\.google\/cli\/install\.sh \| bash/);
});
