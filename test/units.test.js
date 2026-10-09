import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_FILE, LOCAL_CONFIG_FILE, loadConfig } from '../src/config.js';
import {
  authStatus as codexAuthStatus, buildArgs as codexBuildArgs, findCodex, login as codexLogin, parseOutput as codexParseOutput, toActivity as codexToActivity,
} from '../src/executors/codex.js';
import {
  buildArgs as opencodeBuildArgs, parseOutput as opencodeParseOutput, run as opencodeRun, toActivity as opencodeToActivity,
} from '../src/executors/opencode.js';
import { extractAgentReport } from '../src/executors/common.js';
import { appendEvent, describeCommand, formatEvent, readEvents, supportsLinks, useColor } from '../src/events.js';
import { decideReview, decideSelfReview, resolvePolicy, shouldRunSelfReviewPass } from '../src/policy.js';
import { quoteWindowsArg, runShell } from '../src/proc.js';
import { relativize } from '../src/executors/common.js';
import { FAKE_CODEX, FAKE_OPENCODE } from './helpers.js';
import { loadTask, normalizeTask } from '../src/task.js';
import { scopeViolations } from '../src/validate.js';

// Salida real de Codex CLI 0.155 (`codex exec --json`).
const CODEX_OUTPUT = [
  '{"type":"thread.started","thread_id":"01a0f42b-1e85-7773-8614-73c5f12db173"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Voy a crear b.txt."}}',
  '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"powershell.exe -Command \\"Set-Content b.txt adios\\"","status":"in_progress"}}',
  '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"powershell.exe -Command \\"Set-Content b.txt adios\\"","exit_code":0,"status":"completed"}}',
  '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\\"status\\":\\"done\\",\\"summary\\":\\"Creado b.txt.\\",\\"filesChanged\\":[\\"b.txt\\"]}"}}',
  '{"type":"turn.completed","usage":{"input_tokens":27706,"cached_input_tokens":13056,"output_tokens":246,"reasoning_output_tokens":62}}',
].join('\n');

// Salida real de OpenCode CLI (`opencode run --auto --format json`, recortada).
const OPENCODE_OUTPUT = [
  '{"type":"step_start","part":{"type":"step-start"}}',
  '{"type":"tool_use","part":{"type":"tool","tool":"write","state":{"status":"completed","input":{"path":"hola.txt","content":"hola"},"output":"Created file successfully: hola.txt","title":"write"}}}',
  '{"type":"step_finish","part":{"type":"step-finish","reason":"tool-calls","cost":0,"tokens":{"input":8002,"output":38,"reasoning":36,"cache":{"read":0,"write":0}}}}',
  '{"type":"text","part":{"type":"text","text":"Done.\\n```json\\n{\\"status\\":\\"done\\",\\"summary\\":\\"ok\\",\\"filesChanged\\":[\\"hola.txt\\"]}\\n```"}}',
].join('\n');

test('codex: interpreta el JSONL real', () => {
  const parsed = codexParseOutput(CODEX_OUTPUT);
  assert.equal(parsed.finishReason, 'completed');
  assert.deepEqual(parsed.usage, { inputTokens: 27706, outputTokens: 246, cacheReadTokens: 13056 });
  assert.equal(parsed.toolCalls, 1);
  assert.equal(parsed.threadId, '01a0f42b-1e85-7773-8614-73c5f12db173');
  assert.equal(parsed.model, null);
  const report = extractAgentReport(parsed.text);
  assert.equal(report.status, 'done');
  assert.deepEqual(report.filesChanged, ['b.txt']);
});

test('codex: recoge los errores (turn.failed, error suelto y líneas no válidas)', () => {
  const failed = codexParseOutput([
    '{"type":"turn.started"}',
    '{"type":"turn.failed","error":{"message":"límite de uso alcanzado"}}',
    'texto suelto',
    '{roto',
  ].join('\n'));
  assert.equal(failed.finishReason, 'failed');
  assert.deepEqual(failed.errors, ['límite de uso alcanzado']);
  assert.equal(failed.usage, null);

  const errors = codexParseOutput(
    '{"type":"error","message":"boom"}\n{"type":"item.completed","item":{"id":"i","type":"error","message":"ups"}}',
  );
  assert.deepEqual(errors.errors, ['boom', 'ups']);
});

test('codex: argumentos de línea de comandos', () => {
  assert.deepEqual(
    codexBuildArgs({ provider: null, model: null, thinking: null, extraArgs: [] }, 'instr', 'run/codex-report.schema.json'),
    ['exec', '--json', '--ephemeral', '-s', 'workspace-write', '--output-schema', 'run/codex-report.schema.json', '-c', 'sandbox_workspace_write.network_access=true', 'instr'],
  );
  assert.deepEqual(
    codexBuildArgs({ provider: 'openai', model: 'gpt-6-luna', thinking: 'high', extraArgs: ['--skip-git-repo-check'] }, 'instr', 's.json'),
    ['exec', '--json', '--ephemeral', '-s', 'workspace-write', '--output-schema', 's.json', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=high', '-c', 'sandbox_workspace_write.network_access=true', '--skip-git-repo-check', 'instr'],
  );
  // Sin modelo, sin thinking y sin extraArgs: solo el esquema, la red y la instrucción.
  const args = codexBuildArgs({}, 'hola', 's.json');
  assert.deepEqual(args.slice(-4), ['s.json', '-c', 'sandbox_workspace_write.network_access=true', 'hola']);
  assert.equal(args.includes('-m'), false);
  assert.equal(args.includes('model_reasoning_effort=high'), false);
  // La red se permite por defecto y solo se omite con network: false.
  assert.equal(args.includes('sandbox_workspace_write.network_access=true'), true);
  assert.equal(codexBuildArgs({ network: false }, 'i', 's.json').includes('-c'), false);
  // El proveedor se ignora: Codex usa la sesión de ChatGPT.
  assert.equal(codexBuildArgs({ provider: 'deepseek' }, 'i', 's.json').includes('-P'), false);

  // Los argumentos que genera AgentRelay deben sobrevivir al quoting de cmd.exe
  // (Windows rechaza las comillas dobles en los argumentos): por eso el valor de
  // `-c` va sin comillas y Codex lo usa como cadena literal.
  for (const arg of codexBuildArgs({ model: 'gpt-6-luna', thinking: 'xhigh' }, 'i', 's.json')) {
    assert.doesNotThrow(() => quoteWindowsArg(arg));
  }
});

test('codex: toActivity convierte los eventos JSONL en actividades', () => {
  const cwd = 'C:\\repo';
  assert.deepEqual(
    codexToActivity({ type: 'item.started', item: { id: 'i', type: 'command_execution', command: 'powershell.exe -Command "Set-Content C:\\repo\\b.txt adios"' } }, cwd),
    { kind: 'tool', tool: 'command', detail: 'powershell.exe -Command "Set-Content ./b.txt adios"' },
  );
  assert.deepEqual(
    codexToActivity({ type: 'item.completed', item: { id: 'i', type: 'file_change', changes: [{ path: 'C:\\repo\\a.txt', kind: 'add' }, { path: 'C:\\repo\\b.txt', kind: 'update' }] } }, cwd),
    { kind: 'tool', tool: 'edit', detail: './a.txt, ./b.txt' },
  );
  assert.deepEqual(
    codexToActivity({ type: 'item.completed', item: { id: 'i', type: 'reasoning', text: 'Voy a crear b.txt.\n\nDespués lo reviso.' } }, cwd),
    { kind: 'thinking', text: 'Voy a crear b.txt.' },
  );
  assert.deepEqual(
    codexToActivity({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7, reasoning_output_tokens: 2 } }, cwd),
    { kind: 'usage', inputTokens: 100, outputTokens: 7 },
  );
  assert.deepEqual(codexToActivity({ type: 'turn.failed', error: { message: 'boom' } }, cwd), { kind: 'error', message: 'boom' });
  assert.deepEqual(codexToActivity({ type: 'error', message: 'boom' }, cwd), { kind: 'error', message: 'boom' });
  assert.equal(codexToActivity({ type: 'turn.started' }, cwd), null);
  assert.equal(codexToActivity({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text: 'hola' } }, cwd), null);
  assert.equal(codexToActivity({ type: 'item.started', item: { id: 'i', type: 'reasoning' } }, cwd), null);
});

test('codex: localiza el binario en el PATH o en la extensión de VS Code', () => {
  const home = path.join('home', 'u');
  const root = path.join('empty', 'project');

  // 1) El PATH tiene prioridad.
  const pathDir = path.join('usr', 'local', 'bin');
  const fromPath = path.join(pathDir, 'codex');
  assert.deepEqual(
    findCodex({
      env: { PATH: `${path.join('otro', 'dir')}${path.delimiter}${pathDir}` },
      root,
      home,
      platform: 'linux',
      exists: (p) => p === fromPath,
      readdir: () => [],
    }),
    [fromPath],
  );

  // En Windows también vale la variable "Path" y los ejecutables .exe/.cmd.
  const winDir = 'tools';
  const fromCmd = path.join(winDir, 'codex.cmd');
  assert.deepEqual(
    findCodex({ root, env: { Path: winDir }, home, platform: 'win32', exists: (p) => p === fromCmd, readdir: () => [] }),
    [fromCmd],
  );

  // 2) Sin PATH, la copia que trae la extensión (la versión más nueva primero).
  const base = path.join(home, '.vscode', 'extensions');
  const older = 'openai.chatgpt-26.1.0-win32-x64';
  const newer = 'openai.chatgpt-26.917.62051-win32-x64';
  const olderCodex = path.join(base, older, 'bin', 'windows-x86_64', 'codex.exe');
  const newerCodex = path.join(base, newer, 'bin', 'windows-x86_64', 'codex.exe');
  const readdir = (dir) => {
    if (dir === base) return ['otra.extension-1.0.0', older, newer];
    if (dir === path.join(base, newer, 'bin') || dir === path.join(base, older, 'bin')) return ['windows-x86_64'];
    return [];
  };
  assert.deepEqual(
    findCodex({ root, env: {}, home, platform: 'win32', exists: (p) => p === olderCodex || p === newerCodex, readdir }),
    [newerCodex],
  );

  // 3) Nada instalado: null, y no falla aunque los directorios no existan.
  assert.equal(findCodex({ root, env: {}, home, platform: 'linux', exists: () => false, readdir: () => { throw new Error('no existe'); } }), null);
});

test('codex: la copia empaquetada tiene prioridad', () => {
  const root = path.join('project', 'relay');
  const bundled = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  assert.deepEqual(findCodex({ root, env: { PATH: 'somewhere' }, exists: (p) => p === bundled }), [process.execPath, bundled]);
});

test('codex: authStatus y login usan la CLI configurada', async () => {
  const old = { ...process.env };
  const log = path.join(os.tmpdir(), `fake-codex-${process.pid}.log`);
  try {
    process.env.FAKE_CODEX_LOG = log;
    process.env.FAKE_CODEX_LOGGED_IN = '1';
    assert.deepEqual(await codexAuthStatus({ command: [process.execPath, FAKE_CODEX] }), { ok: true, message: 'Logged in using ChatGPT' });
    process.env.FAKE_CODEX_LOGGED_IN = '0';
    const auth = await codexAuthStatus({ command: [process.execPath, FAKE_CODEX] });
    assert.equal(auth.ok, false);
    assert.equal(auth.message.split('https://chatgpt.com').length - 1, 1);
    assert.equal(await codexLogin({ command: [process.execPath, FAKE_CODEX] }, { device: true }), 0);
    assert.equal(readFileSync(log, 'utf8').trim(), '["login","--device-auth"]');
  } finally {
    for (const key of ['FAKE_CODEX_LOG', 'FAKE_CODEX_LOGGED_IN']) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    rmSync(log, { force: true });
  }
});

test('opencode: interpreta el JSON real', () => {
  const parsed = opencodeParseOutput(OPENCODE_OUTPUT);
  assert.equal(parsed.toolCalls, 1);
  assert.deepEqual(parsed.usage, { inputTokens: 8002, outputTokens: 38, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 });
  const report = extractAgentReport(parsed.text);
  assert.equal(report.status, 'done');
  assert.deepEqual(report.filesChanged, ['hola.txt']);
});

test('opencode: argumentos de línea de comandos', () => {
  assert.deepEqual(
    opencodeBuildArgs({ model: 'opencode/nemotron-3-ultra-free', extraArgs: [] }, 'instr'),
    ['run', '--auto', '--format', 'json', '-m', 'opencode/nemotron-3-ultra-free', 'instr'],
  );
  assert.deepEqual(opencodeBuildArgs({}, 'hola'), ['run', '--auto', '--format', 'json', 'hola']);
});

test('opencode: toActivity convierte los eventos JSON en actividades', () => {
  const cwd = 'C:\\repo';
  assert.deepEqual(
    opencodeToActivity({ type: 'tool_use', part: { type: 'tool', tool: 'write', state: { input: { path: 'C:\\repo\\a.txt', content: 'x' } } } }, cwd),
    { kind: 'tool', tool: 'edit', detail: './a.txt' },
  );
  assert.deepEqual(
    opencodeToActivity({ type: 'tool_use', part: { type: 'tool', tool: 'read', state: { input: { path: 'C:\\repo\\b.txt' } } } }, cwd),
    { kind: 'tool', tool: 'read_files', detail: './b.txt' },
  );
  assert.deepEqual(
    opencodeToActivity({ type: 'tool_use', part: { type: 'tool', tool: 'bash', state: { input: { command: 'npm test' } } } }, cwd),
    { kind: 'tool', tool: 'command', detail: 'npm test' },
  );
  assert.deepEqual(
    opencodeToActivity({ type: 'step_finish', part: { type: 'step-finish', reason: 'tool-calls', cost: 0, tokens: { input: 10, output: 2 } } }, cwd),
    { kind: 'usage', inputTokens: 10, outputTokens: 2, cost: 0 },
  );
  assert.deepEqual(opencodeToActivity({ type: 'step_start', part: { type: 'step-start' } }, cwd), { kind: 'iteration' });
  assert.equal(opencodeToActivity({ type: 'text', part: { type: 'text', text: 'ok' } }, cwd), null);
});

test('opencode: run devuelve error si falta el binario', async () => {
  const res = await opencodeRun({
    executor: { command: 'opencode-que-no-existe-xyz', model: null, extraArgs: [], timeoutSeconds: 60 },
    cwd: process.cwd(),
    promptFile: 'run/attempt-1-implement.prompt.md',
  });
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

test('opencode: run termina por tiempo máximo', async () => {
  const old = process.env.FAKE_OPENCODE_DELAY;
  process.env.FAKE_OPENCODE_DELAY = '30000';
  try {
    const res = await opencodeRun({
      executor: { command: [process.execPath, FAKE_OPENCODE], model: null, extraArgs: [], timeoutSeconds: 1 },
      cwd: process.cwd(),
      promptFile: 'run/attempt-1-implement.prompt.md',
    });
    assert.equal(res.timedOut, true);
    assert.equal(res.ok, false);
    assert.match(res.error, /superado el tiempo máximo/);
  } finally {
    if (old === undefined) delete process.env.FAKE_OPENCODE_DELAY; else process.env.FAKE_OPENCODE_DELAY = old;
  }
});

test('proc: quoting seguro para cmd.exe', () => {
  assert.equal(quoteWindowsArg('--json'), '--json');
  assert.equal(quoteWindowsArg('C:\\Program Files\\node.exe'), '"C:\\Program Files\\node.exe"');
  for (const bad of ['a&b', 'a|b', '"a"', '%PATH%', 'a^b', 'a\nb', 'a>b', 'hola!']) {
    assert.throws(() => quoteWindowsArg(bad), /metacaracteres/);
  }
});

test('proc: termina los procesos que superan el tiempo máximo', async () => {
  const started = Date.now();
  const res = await runShell('node -e "setTimeout(() => {}, 3000)"', { timeoutMs: 500 });
  assert.equal(res.timedOut, true);
  // En sandbox puede estar restringido taskkill; el hijo corto evita esperar 30 s.
  assert.ok(Date.now() - started < 15000);
});

test('policy: self-review según complejidad', () => {
  const task = (complexity, selfReview = null) => ({ complexity, selfReview });
  const base = resolvePolicy({});
  assert.equal(decideSelfReview(base, task('trivial')), 'none');
  assert.equal(decideSelfReview(base, task('normal')), 'inline');
  assert.equal(decideSelfReview(base, task('complex')), 'pass');
  assert.equal(decideSelfReview(base, task('normal', 'none')), 'none');
  const custom = resolvePolicy({ policy: { maxRetries: 5, selfReview: { normal: 'pass' } } });
  assert.equal(custom.maxRetries, 5);
  assert.equal(decideSelfReview(custom, task('normal')), 'pass');
  assert.equal(decideSelfReview(custom, task('complex')), 'pass');
  assert.equal(decideSelfReview(custom, task('trivial')), 'none');
});

test('policy: pasada separada de self-review', () => {
  const base = resolvePolicy({});
  const strict = resolvePolicy({ policy: { skipPassMaxFiles: 0 } });
  const small = { changedFiles: 1, validationCount: 1, checkPassed: true };
  assert.equal(shouldRunSelfReviewPass(base, 'inline', small).run, false);
  assert.equal(shouldRunSelfReviewPass(base, 'pass', small).run, false);
  assert.equal(shouldRunSelfReviewPass(strict, 'pass', small).run, true);
  assert.equal(shouldRunSelfReviewPass(base, 'pass', { ...small, validationCount: 0 }).run, true);
  assert.equal(shouldRunSelfReviewPass(strict, 'pass', { ...small, changedFiles: 0 }).run, false);
});

test('policy: cuándo revisa el orquestador', () => {
  const task = { complexity: 'normal' };
  const clean = { headMoved: false, agentReport: { issues: [], questions: [] }, validationCount: 1, changedFiles: 1 };
  const onFailure = resolvePolicy({ policy: { review: 'on-failure' } });
  const selective = resolvePolicy({ policy: { review: 'selective' } });
  assert.equal(decideReview(resolvePolicy({}), task, clean).required, true);
  assert.equal(decideReview(onFailure, task, clean).required, false);
  assert.equal(decideReview(selective, task, clean).required, false);
  assert.equal(decideReview(selective, task, { ...clean, validationCount: 0 }).required, true);
  assert.equal(decideReview(selective, { complexity: 'complex' }, clean).required, true);
  assert.equal(decideReview(onFailure, task, { ...clean, validationCount: 0 }).required, false);
  assert.equal(decideReview(onFailure, task, { ...clean, headMoved: true }).required, true);
  assert.equal(decideReview(onFailure, task, { ...clean, changedFiles: 0 }).required, true);
  assert.equal(decideReview(resolvePolicy({ policy: { review: 'on-failure', requireValidation: true } }), task, { ...clean, validationCount: 0 }).required, true);
});

test('config: valores por defecto, archivo, archivo local y opciones', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-'));
  try {
    const home = path.join(dir, 'home');
    assert.equal(loadConfig({ cwd: dir, home }).config.executor.model, 'gpt-6-luna');
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ validation: { commands: ['npm test'] } }));
    writeFileSync(path.join(dir, 'agentrelay.config.local.json'), JSON.stringify({ executor: { command: ['node', 'custom.js'] } }));
    const { config, sources } = loadConfig({ cwd: dir, home, overrides: { executor: { timeoutSeconds: 77 } } });
    assert.equal(sources.length, 2);
    assert.equal(config.executor.timeoutSeconds, 77);
    assert.deepEqual(config.validation.commands, ['npm test']);
    assert.deepEqual(config.executor.command, ['node', 'custom.js']);
    assert.equal(config.executor.provider, null);
    assert.throws(() => loadConfig({ cwd: dir, home, overrides: { executor: { timeoutSeconds: 0 } } }), /número positivo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('config: los valores por defecto de executor dependen del tipo', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-executor-'));
  try {
    // Sin archivos: Codex es el ejecutor predeterminado.
    const home = path.join(dir, 'home');
    const byDefault = loadConfig({ cwd: dir, home }).config;
    assert.equal(byDefault.executor.type, 'codex');
    assert.equal(byDefault.executor.command, 'codex');
    assert.equal(byDefault.executor.provider, null);
    assert.equal(byDefault.executor.model, 'gpt-6-luna');

    writeFileSync(path.join(dir, LOCAL_CONFIG_FILE), JSON.stringify({ executor: { type: 'opencode' } }));
    const opencode = loadConfig({ cwd: dir, home }).config;
    assert.equal(opencode.executor.type, 'opencode');
    assert.equal(opencode.executor.command, 'opencode');
    assert.equal(opencode.executor.provider, null);
    assert.equal(opencode.executor.model, 'opencode/nemotron-3-ultra-free');

    // Codex usa la sesión de ChatGPT y el modelo Luna.
    writeFileSync(path.join(dir, LOCAL_CONFIG_FILE), JSON.stringify({ executor: { type: 'codex' } }));
    const codex = loadConfig({ cwd: dir, home }).config;
    assert.equal(codex.executor.type, 'codex');
    assert.equal(codex.executor.command, 'codex');
    assert.equal(codex.executor.provider, null);
    assert.equal(codex.executor.model, 'gpt-6-luna');

    // Un valor explícito del usuario siempre gana.
    writeFileSync(path.join(dir, LOCAL_CONFIG_FILE), JSON.stringify({ executor: { type: 'codex', model: 'gpt-6-luna' } }));
    const custom = loadConfig({ cwd: dir, home }).config;
    assert.equal(custom.executor.model, 'gpt-6-luna');
    assert.equal(custom.executor.command, 'codex');
    assert.equal(custom.executor.provider, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('config: rechaza un ejecutor no soportado', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-executor-'));
  try {
    writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ executor: { type: 'foo' } }));
    assert.throws(() => loadConfig({ cwd: dir, home: path.join(dir, 'home') }), /Ejecutor no soportado: foo \(disponibles: codex, opencode\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('config y tarea: aceptan archivos JSON con BOM', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-bom-'));
  try {
    const configFile = path.join(dir, 'c.json');
    const taskFile = path.join(dir, 't.json');
    writeFileSync(configFile, '﻿{"executor":{"timeoutSeconds":2}}');
    writeFileSync(taskFile, '﻿{"objective":"x"}');
    assert.equal(loadConfig({ cwd: dir, configPath: configFile, home: path.join(dir, 'home') }).config.executor.timeoutSeconds, 2);
    assert.equal(loadTask(taskFile).objective, 'x');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('task: normaliza y valida', () => {
  const task = normalizeTask({ objective: 'Arregla el bug\nDetalles', validation: 'npm test', acceptanceCriteria: ['a', ' ', 'b'] });
  assert.equal(task.title, 'Arregla el bug');
  assert.deepEqual(task.validation, ['npm test']);
  assert.deepEqual(task.acceptanceCriteria, ['a', 'b']);
  assert.equal(task.complexity, 'normal');
  assert.throws(() => normalizeTask({}), /objective/);
  assert.throws(() => normalizeTask({ objective: 'x', complexity: 'enorme' }), /complexity/);
  assert.throws(() => normalizeTask({ objective: 'x', selfReview: 'siempre' }), /selfReview/);
});

test('validate: archivos protegidos', () => {
  const files = [{ path: 'src/a.js' }, { path: 'docs/x.md' }, { path: 'LICENSE' }];
  assert.deepEqual(scopeViolations(files, ['LICENSE', 'docs/']), ['docs/x.md', 'LICENSE']);
  assert.deepEqual(scopeViolations(files, ['./src/a.js']), ['src/a.js']);
  assert.deepEqual(scopeViolations(files, []), []);
});

test('events: appendEvent añade ts y readEvents ignora líneas no válidas', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-events-'));
  try {
    mkdirSync(path.join(dir, '.agentrelay', 'runs', 'r1'), { recursive: true });
    const written = appendEvent(dir, 'r1', { type: 'retry', n: 1, max: 2 });
    assert.equal(written.type, 'retry');
    assert.ok(written.ts);
    appendEvent(dir, 'r1', { type: 'status', status: 'accepted', ts: '2026-09-30T10:00:00.000Z' });
    const events = readEvents(dir, 'r1');
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'retry');
    assert.equal(events[1].ts, '2026-09-30T10:00:00.000Z');
    assert.deepEqual(readEvents(dir, 'r2'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('events: resume órdenes y formatea eventos con hora local', () => {
  const t0 = Date.parse('2026-09-30T10:00:00.000Z');
  const ts = '2026-09-30T10:00:05.000Z';
  const localTime = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; };
  const prefix = `${localTime(ts)}  `;
  assert.equal(describeCommand('"C://WINDOWS//System32//WindowsPowerShell//v1.0//powershell.exe" -Command "Get-Content -Raw -LiteralPath \'suma.js\'"'), 'lee suma.js');
  assert.equal(describeCommand('"C://WINDOWS//System32//WindowsPowerShell//v1.0//powershell.exe" -Command \'npm.cmd test\''), 'ejecuta los tests');
  assert.equal(describeCommand('"C://WINDOWS//System32//WindowsPowerShell//v1.0//powershell.exe" -Command \'git diff -- suma.js; git status --short\''), 'revisa el estado de git');
  assert.equal(describeCommand('bash -lc "rg foo src"'), 'busca en el código');
  assert.equal(describeCommand('unknown-command --arg'), null);
  assert.equal(formatEvent({ type: 'run_start', ts, runId: 'r1', title: 'T' }, t0), `${prefix}▶ Ejecución r1\n  T`);
  assert.equal(formatEvent({ type: 'attempt_start', ts, attempt: 1, kind: 'implement', model: 'm' }, t0), `\n${prefix}▶ Intento 1 (implementación) · m`);
  assert.equal(formatEvent({ type: 'activity', kind: 'iteration', n: 1, ts }, t0), null);
  assert.equal(formatEvent({ type: 'activity', kind: 'thinking', text: 'pensando', ts }, t0), `${prefix}  · piensa: pensando`);
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'editor', detail: './hello.txt' }), '  ✎ edita: hello.txt');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'read_files', detail: 'a, b' }), '  · lee: a, b');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'edit', detail: 'src/a.js' }), '  ✎ edita: src/a.js');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'command', detail: '"C://Windows//powershell.exe" -Command \'npm.cmd test\'' }), '  · ejecuta los tests');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'run_commands', detail: 'unknown --long' }), '  · ejecuta: unknown --long');
  assert.equal(formatEvent({ type: 'activity', kind: 'usage', inputTokens: 1234, outputTokens: 1045968, cost: 0.0024 }), '  · tokens: 1,2 mil entrada · 1,0 M salida · 0.0024 USD');
  assert.equal(formatEvent({ type: 'activity', kind: 'error', message: 'boom' }), '  ✖ error: boom');
  assert.equal(formatEvent({ type: 'attempt_end', attempt: 1, ok: true, durationMs: 65000, agentStatus: 'done' }), '✔ Intento 1 completado en 1 min 05 s (done)');
  assert.equal(formatEvent({ type: 'attempt_end', attempt: 1, ok: false, error: 'falló' }), '✖ Intento 1 fallido: falló');
  assert.equal(formatEvent({ type: 'validation', command: 'npm test', passed: true, exitCode: 0 }), '  · validación `npm test`: correcta');
  assert.equal(formatEvent({ type: 'check_start' }), '  · validando…');
  assert.equal(formatEvent({ type: 'check', changedFiles: 2, passed: true, scopeViolations: ['LICENSE'] }), '  · 2 archivo(s) modificado(s) · validación correcta · archivos protegidos: LICENSE');
  assert.equal(formatEvent({ type: 'retry', n: 1, max: 3 }), '↻ Corrección automática 1/3');
  assert.equal(formatEvent({ type: 'self_review_start' }), '▶ Self-review del ejecutor');
  assert.equal(formatEvent({ type: 'self_review_skipped', reason: 'redundante' }), '  · self-review separada omitida: redundante');
  assert.equal(formatEvent({ type: 'status', status: 'awaiting_review', runId: 'r1' }), '■ Listo para tu revisión\n  Siguiente paso: agentrelay review r1 --decision accept|fix|escalate|reject');
  assert.equal(formatEvent({ type: 'status', status: 'accepted', reasons: ['a', 'b'] }), '✔ Aceptada (a; b)');
  assert.equal(formatEvent({ type: 'status', status: 'unknown' }), 'unknown');
  assert.equal(formatEvent({ type: 'review', decision: 'fix', feedback: 'F' }), 'Revisión del orquestador: fix — F');
  const plain = formatEvent({ type: 'attempt_end', ts, attempt: 1, ok: true, durationMs: 65000, agentStatus: 'done' }, t0);
  const colored = formatEvent({ type: 'attempt_end', ts, attempt: 1, ok: true, durationMs: 65000, agentStatus: 'done' }, t0, { color: true });
  assert.match(colored, /\u001b\[/);
  assert.equal(colored.replace(/\u001b\[[0-9;]*m/g, ''), plain);
  assert.doesNotMatch(plain, /\u001b\[/);
  const root = path.resolve('repo root');
  const anchor = (relative) => `\u001b]8;;${pathToFileURL(path.resolve(root, relative)).href}\u001b\\${relative}\u001b]8;;\u001b\\`;
  const read = { type: 'activity', kind: 'tool', tool: 'read_files', detail: 'src/a.js, "docs/my file.md"' };
  const linked = formatEvent(read, 0, { links: { root } });
  assert.equal(linked, `  · lee: ${anchor('src/a.js')}, "${anchor('docs/my file.md')}"`);
  assert.equal(formatEvent(read), '  · lee: src/a.js, "docs/my file.md"');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'edit', detail: 'src/a.js; src/b.js' }, 0, { links: { root } }), `  ✎ edita: ${anchor('src/a.js')}, ${anchor('src/b.js')}`);
  assert.equal(linked.replace(/\u001b\]8;;[^\u001b]*\u001b\\|\u001b\]8;;\u001b\\/g, ''), formatEvent(read));
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'command', detail: 'cat src/a.js' }, 0, { links: { root } }), `  · lee ${anchor('src/a.js')}`);
  const codexRead = { type: 'activity', kind: 'tool', tool: 'command', detail: 'Get-Content -Raw src/a.js' };
  assert.equal(formatEvent(codexRead, 0, { links: { root } }), `  · lee ${anchor('src/a.js')}`);
  const codexReadPlain = formatEvent(codexRead);
  assert.equal(codexReadPlain, '  · lee src/a.js');
  assert.equal(formatEvent(codexRead, 0, { links: { root } }).replace(/\u001b\]8;;[^\u001b]*\u001b\\|\u001b\]8;;\u001b\\/g, ''), codexReadPlain);
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'other', detail: 'src/a.js' }, 0, { links: { root } }), '  · other: src/a.js');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'read_files', detail: 'archivos, ../outside.js, *.js, "quoted name.js"' }, 0, { links: { root } }), `  · lee: archivos, ../outside.js, *.js, "${anchor('quoted name.js')}"`);
  assert.equal(supportsLinks({ isTTY: true }, { TERM_PROGRAM: 'vscode' }), true);
  assert.equal(supportsLinks({ isTTY: true }, { TERM_PROGRAM: 'vscode', TERM: 'dumb' }), false);
  assert.equal(supportsLinks({ isTTY: false }, { TERM_PROGRAM: 'vscode' }), false);
  assert.equal(supportsLinks({ isTTY: true }, { WT_SESSION: '1' }), true);
  assert.equal(supportsLinks({ isTTY: true }, { VTE_VERSION: '4999' }), false);
  assert.equal(supportsLinks({ isTTY: true }, { VTE_VERSION: '5000' }), true);
  assert.equal(supportsLinks({ isTTY: false }, { AGENTRELAY_LINKS: '1' }), true);
  assert.equal(supportsLinks({ isTTY: true }, { TERM_PROGRAM: 'vscode', AGENTRELAY_LINKS: '0' }), false);
  assert.equal(useColor({ isTTY: true }, {}), true);
  assert.equal(useColor({ isTTY: true }, { NO_COLOR: '1' }), false);
  assert.equal(useColor({ isTTY: false }, {}), false);
  assert.equal(useColor({ isTTY: true }, { TERM: 'dumb' }), false);
});

test('proc: onStdout recibe los fragmentos de stdout', async () => {
  const chunks = [];
  const res = await runShell('node -e "process.stdout.write(\'hola \'); process.stdout.write(\'mundo\')"', {
    onStdout: (chunk) => chunks.push(chunk),
  });
  assert.equal(res.stdout, 'hola mundo');
  assert.equal(chunks.join(''), 'hola mundo');
  assert.ok(chunks.length >= 1);
});

test('relativize: acorta la ruta aunque el ejecutor informe de la ruta real (enlace simbólico, como /var en macOS)', () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-rel-'));
  try {
    const real = path.join(base, 'real');
    const link = path.join(base, 'enlace');
    mkdirSync(real);
    try {
      symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return; // sin permisos para crear enlaces en este sistema
    }
    const reportedByExecutor = path.join(realpathSync(link), 'hello.txt');
    assert.equal(relativize(reportedByExecutor, link), './hello.txt');
    assert.equal(relativize(path.join(link, 'hello.txt'), link), './hello.txt');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('opencode: el mensaje de error se lee de event.error.message', () => {
  const line = JSON.stringify({ type: 'error', error: { type: 'provider.no-route', message: 'Model unavailable: opencode/x-free' } });
  assert.deepEqual(opencodeParseOutput(line).errors, ['Model unavailable: opencode/x-free']);
  assert.deepEqual(opencodeToActivity({ type: 'error', error: { message: 'boom' } }, '.'), { kind: 'error', message: 'boom' });
  assert.deepEqual(opencodeParseOutput('{"type":"error"}').errors, ['error desconocido']);
});
