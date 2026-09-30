import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_FILE, LOCAL_CONFIG_FILE, loadConfig } from '../src/config.js';
import {
  buildArgs, commandParts, describeTool, extractAgentReport, findBundledCline, parseOutput, toActivity,
} from '../src/executors/cline.js';
import {
  authStatus as codexAuthStatus, buildArgs as codexBuildArgs, findCodex, login as codexLogin, parseOutput as codexParseOutput, toActivity as codexToActivity,
} from '../src/executors/codex.js';
import { appendEvent, describeCommand, formatEvent, readEvents, useColor } from '../src/events.js';
import { decideReview, decideSelfReview, resolvePolicy, shouldRunSelfReviewPass } from '../src/policy.js';
import { quoteWindowsArg, runShell } from '../src/proc.js';
import { relativize } from '../src/executors/common.js';
import { FAKE_CODEX } from './helpers.js';
import { loadTask, normalizeTask } from '../src/task.js';
import { scopeViolations } from '../src/validate.js';

// Salida real de Cline CLI 3.0.66 (recortada).
const CLINE_OUTPUT = [
  '{"ts":"2026-09-30T16:40:43.786Z","type":"hook_event","hookEventName":"agent_start","agentId":"a","taskId":"t","parentAgentId":null}',
  '{"ts":"2026-09-30T16:40:45.752Z","type":"agent_event","event":{"type":"content_start","contentType":"reasoning","reasoning":"The","redacted":false}}',
  '{"ts":"2026-09-30T16:40:47.399Z","type":"hook_event","hookEventName":"tool_call","agentId":"a","taskId":"t","parentAgentId":null}',
  '{"ts":"2026-09-30T16:40:50.545Z","type":"agent_event","event":{"type":"done","reason":"completed","text":"DONE","iterations":3,"usage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"totalCost":0.002883615}}}',
  '{"ts":"2026-09-30T16:40:50.781Z","type":"run_result","finishReason":"completed","iterations":3,"usage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"cacheWriteTokens":0,"totalCost":0.002883615},"aggregateUsage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"cacheWriteTokens":0,"totalCost":0.002883615},"durationMs":6763,"text":"DONE","model":{"id":"deepseek-v4-pro","provider":"deepseek"}}',
].join('\n');

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
    ['exec', '--json', '--ephemeral', '-s', 'workspace-write', '--output-schema', 'run/codex-report.schema.json', 'instr'],
  );
  assert.deepEqual(
    codexBuildArgs({ provider: 'openai', model: 'gpt-6-luna', thinking: 'high', extraArgs: ['--skip-git-repo-check'] }, 'instr', 's.json'),
    ['exec', '--json', '--ephemeral', '-s', 'workspace-write', '--output-schema', 's.json', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=high', '--skip-git-repo-check', 'instr'],
  );
  // Sin modelo, sin thinking y sin extraArgs: solo el esquema y la instrucción.
  const args = codexBuildArgs({}, 'hola', 's.json');
  assert.deepEqual(args.slice(-2), ['s.json', 'hola']);
  assert.equal(args.includes('-m'), false);
  assert.equal(args.includes('-c'), false);
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

test('cline: interpreta el NDJSON real', () => {
  const parsed = parseOutput(CLINE_OUTPUT);
  assert.equal(parsed.finishReason, 'completed');
  assert.equal(parsed.text, 'DONE');
  assert.equal(parsed.iterations, 3);
  assert.equal(parsed.toolCalls, 1);
  assert.equal(parsed.usage.totalCost, 0.002883615);
  assert.deepEqual(parsed.model, { provider: 'deepseek', id: 'deepseek-v4-pro' });
});

test('cline: recoge los errores (también los que llegan por stderr)', () => {
  const parsed = parseOutput('texto\n{"ts":"x","type":"error","message":"JSON output mode requires a prompt"}');
  assert.equal(parsed.finishReason, null);
  assert.deepEqual(parsed.errors, ['JSON output mode requires a prompt']);
});

test('cline: extrae el informe estructurado del texto final', () => {
  const text = 'Hecho.\n```json\n{"status":"done","summary":"ok","filesChanged":"a.js","issues":[]}\n```';
  const report = extractAgentReport(text);
  assert.equal(report.status, 'done');
  assert.deepEqual(report.filesChanged, ['a.js']);
  assert.equal(report.needsEscalation, false);
  assert.equal(extractAgentReport('sin informe'), null);
  assert.equal(extractAgentReport('```json\n{roto\n```'), null);
  // Usa el último bloque válido.
  const two = '```json\n{"status":"partial"}\n```\n```json\n{"status":"done"}\n```';
  assert.equal(extractAgentReport(two).status, 'done');
});

test('cline: argumentos de línea de comandos', () => {
  const args = buildArgs({ provider: 'deepseek', model: 'deepseek-v4-pro', thinking: 'high', timeoutSeconds: 60, extraArgs: ['-v'] }, 'instr');
  assert.deepEqual(args, ['--json', '--auto-approve', 'true', '-P', 'deepseek', '-m', 'deepseek-v4-pro', '--thinking', 'high', '-t', '60', '-v', 'instr']);
});

test('cline: localiza la copia instalada aunque falte el enlace de .bin', () => {
  const root = path.join('base');
  const link = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cline.cmd' : 'cline');
  const launcher = path.join(root, 'node_modules', 'cline', 'bin', 'cline');
  assert.deepEqual(findBundledCline(root, (p) => p === link || p === launcher), [link]);
  // Caso de Linux con npm 10: sin enlace, se ejecuta el lanzador con el propio Node.
  assert.deepEqual(findBundledCline(root, (p) => p === launcher), [process.execPath, launcher]);
  assert.equal(findBundledCline(root, () => false), null);
});

test('cline: commandParts respeta los valores explícitos', () => {
  assert.deepEqual(commandParts(['node', 'x.js']), ['node', 'x.js']);
  assert.deepEqual(commandParts('/opt/cline'), ['/opt/cline']);
  const parts = commandParts('cline');
  assert.ok(parts.length >= 1 && parts.every((p) => typeof p === 'string'));
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
  const res = await runShell('node -e "setTimeout(() => {}, 30000)"', { timeoutMs: 500 });
  assert.equal(res.timedOut, true);
  assert.ok(Date.now() - started < 15000);
});

test('policy: self-review según nivel y complejidad', () => {
  const task = (complexity, selfReview = null) => ({ complexity, selfReview });
  assert.equal(decideSelfReview(resolvePolicy({ level: 1 }), task('normal')), 'none');
  assert.equal(decideSelfReview(resolvePolicy({ level: 1 }), task('complex')), 'inline');
  assert.equal(decideSelfReview(resolvePolicy({ level: 3 }), task('trivial')), 'none');
  assert.equal(decideSelfReview(resolvePolicy({ level: 3 }), task('normal')), 'inline');
  assert.equal(decideSelfReview(resolvePolicy({ level: 3 }), task('complex')), 'pass');
  assert.equal(decideSelfReview(resolvePolicy({ level: 5 }), task('normal')), 'pass');
  assert.equal(decideSelfReview(resolvePolicy({ level: 5 }), task('normal', 'none')), 'none');
  const custom = resolvePolicy({ level: 3, policy: { maxRetries: 5, selfReview: { normal: 'pass' } } });
  assert.equal(custom.maxRetries, 5);
  assert.equal(decideSelfReview(custom, task('normal')), 'pass');
  assert.equal(decideSelfReview(custom, task('complex')), 'pass');
});

test('policy: pasada separada de self-review', () => {
  const l3 = resolvePolicy({ level: 3 });
  const l4 = resolvePolicy({ level: 4 });
  const small = { changedFiles: 1, validationCount: 1, checkPassed: true };
  assert.equal(shouldRunSelfReviewPass(l3, 'inline', small).run, false);
  assert.equal(shouldRunSelfReviewPass(l3, 'pass', small).run, false);
  assert.equal(shouldRunSelfReviewPass(l4, 'pass', small).run, true);
  assert.equal(shouldRunSelfReviewPass(l3, 'pass', { ...small, validationCount: 0 }).run, true);
  assert.equal(shouldRunSelfReviewPass(l4, 'pass', { ...small, changedFiles: 0 }).run, false);
});

test('policy: cuándo revisa el orquestador', () => {
  const task = { complexity: 'normal' };
  const clean = { headMoved: false, agentReport: { issues: [], questions: [] }, validationCount: 1, changedFiles: 1 };
  assert.equal(decideReview(resolvePolicy({ level: 1 }), task, clean).required, false);
  assert.equal(decideReview(resolvePolicy({ level: 2 }), task, clean).required, false);
  assert.equal(decideReview(resolvePolicy({ level: 3 }), task, clean).required, true);
  assert.equal(decideReview(resolvePolicy({ level: 2 }), task, { ...clean, validationCount: 0 }).required, true);
  assert.equal(decideReview(resolvePolicy({ level: 2 }), { complexity: 'complex' }, clean).required, true);
  assert.equal(decideReview(resolvePolicy({ level: 1 }), task, { ...clean, validationCount: 0 }).required, false);
  assert.equal(decideReview(resolvePolicy({ level: 1 }), task, { ...clean, headMoved: true }).required, true);
  assert.equal(decideReview(resolvePolicy({ level: 1 }), task, { ...clean, changedFiles: 0 }).required, true);
});

test('config: valores por defecto, archivo, archivo local y opciones', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-config-'));
  try {
    const home = path.join(dir, 'home');
    assert.equal(loadConfig({ cwd: dir, home }).config.executor.model, 'gpt-6-luna');
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ level: 2, validation: { commands: ['npm test'] } }));
    writeFileSync(path.join(dir, 'agentrelay.config.local.json'), JSON.stringify({ executor: { command: ['node', 'cline.js'] } }));
    const { config, sources } = loadConfig({ cwd: dir, home, overrides: { level: '4' } });
    assert.equal(sources.length, 2);
    assert.equal(config.level, 4);
    assert.deepEqual(config.validation.commands, ['npm test']);
    assert.deepEqual(config.executor.command, ['node', 'cline.js']);
    assert.equal(config.executor.provider, null);
    assert.throws(() => loadConfig({ cwd: dir, home, overrides: { level: 9 } }), /1-5/);
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

    writeFileSync(path.join(dir, LOCAL_CONFIG_FILE), JSON.stringify({ executor: { type: 'cline' } }));
    const cline = loadConfig({ cwd: dir, home }).config;
    assert.equal(cline.executor.type, 'cline');
    assert.equal(cline.executor.command, 'cline');
    assert.equal(cline.executor.provider, 'deepseek');
    assert.equal(cline.executor.model, 'deepseek-v4-pro');

    // Codex usa la sesión de ChatGPT y el modelo Luna.
    writeFileSync(path.join(dir, LOCAL_CONFIG_FILE), JSON.stringify({ executor: { type: 'codex' } }));
    const codex = loadConfig({ cwd: dir, home }).config;
    assert.equal(codex.executor.type, 'codex');
    assert.equal(codex.executor.command, 'codex');
    assert.equal(codex.executor.provider, null);
    assert.equal(codex.executor.model, 'gpt-6-luna');
    assert.equal(codex.level, 3);

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
    assert.throws(() => loadConfig({ cwd: dir, home: path.join(dir, 'home') }), /Ejecutor no soportado: foo \(disponibles: cline, codex\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('config y tarea: aceptan archivos JSON con BOM', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-bom-'));
  try {
    const configFile = path.join(dir, 'c.json');
    const taskFile = path.join(dir, 't.json');
    writeFileSync(configFile, '﻿{"level":2}');
    writeFileSync(taskFile, '﻿{"objective":"x"}');
    assert.equal(loadConfig({ cwd: dir, configPath: configFile, home: path.join(dir, 'home') }).config.level, 2);
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

test('cline: describeTool describe herramientas y relativiza rutas bajo cwd', () => {
  const cwd = 'C:\\repo';
  assert.equal(describeTool('read_files', { files: [{ path: 'C:\\repo\\src\\text.js' }] }, cwd), './src/text.js');
  assert.equal(describeTool('editor', { path: 'C:\\repo\\src\\text.js', old_text: 'a', new_text: 'b' }, cwd), './src/text.js');
  assert.equal(describeTool('run_commands', { commands: ["cd 'C:\\repo'; npm test"] }, cwd), "cd '.'; npm test");
  assert.equal(describeTool('other', { a: 1 }, cwd), '{"a":1}');
  // También con separadores "/".
  assert.equal(describeTool('editor', { path: '/repo/src/text.js' }, '/repo'), './src/text.js');
});

test('cline: toActivity convierte líneas NDJSON en actividades', () => {
  const cwd = 'C:\\repo';
  assert.deepEqual(
    toActivity({ type: 'agent_event', event: { type: 'iteration_start', iteration: 1 } }, cwd),
    { kind: 'iteration', n: 1 },
  );
  assert.deepEqual(
    toActivity({ type: 'agent_event', event: { type: 'content_end', contentType: 'reasoning', reasoning: 'Let me read the file first to understand the task.' } }, cwd),
    { kind: 'thinking', text: 'Let me read the file first to understand the task.' },
  );
  assert.deepEqual(
    toActivity({ type: 'agent_event', event: { type: 'content_start', contentType: 'tool', toolCallId: 'call_1', toolName: 'read_files', input: { files: [{ path: 'C:\\repo\\src\\text.js' }] } } }, cwd),
    { kind: 'tool', tool: 'read_files', detail: './src/text.js' },
  );
  assert.deepEqual(
    toActivity({ type: 'agent_event', event: { type: 'usage', inputTokens: 5463, outputTokens: 140, cost: 0.0024, totalInputTokens: 5463, totalOutputTokens: 140, totalCost: 0.0024 } }, cwd),
    { kind: 'usage', inputTokens: 5463, outputTokens: 140, cost: 0.0024 },
  );
  assert.deepEqual(toActivity({ type: 'error', message: 'boom' }, cwd), { kind: 'error', message: 'boom' });
  assert.equal(toActivity({ type: 'agent_event', event: { type: 'done' } }, cwd), null);
  assert.equal(toActivity({ type: 'run_result' }, cwd), null);
});

test('cline: toActivity lee usage dentro de agent_event (formato real)', () => {
  const line = '{"type":"agent_event","event":{"type":"usage","inputTokens":5463,"outputTokens":140,"cost":0.0024,"totalInputTokens":5463,"totalOutputTokens":140,"totalCost":0.0024}}';
  assert.deepEqual(
    toActivity(JSON.parse(line), 'C:\\repo'),
    { kind: 'usage', inputTokens: 5463, outputTokens: 140, cost: 0.0024 },
  );
  // El usage de primer nivel ya no se reconoce.
  assert.equal(toActivity({ type: 'usage', totalInputTokens: 1, totalOutputTokens: 2, totalCost: 0.1 }, 'C:\\repo'), null);
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
  assert.equal(formatEvent({ type: 'run_start', ts, runId: 'r1', title: 'T', level: 3, levelName: 'equilibrado' }, t0), `${prefix}▶ Ejecución r1 · nivel 3 (equilibrado)\n  T`);
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
