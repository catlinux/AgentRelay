import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import {
  buildArgs, BUNDLED_CLINE, commandParts, describeTool, extractAgentReport, parseOutput, toActivity,
} from '../src/executors/cline.js';
import { appendEvent, formatEvent, readEvents } from '../src/events.js';
import { decideReview, decideSelfReview, resolvePolicy, shouldRunSelfReviewPass } from '../src/policy.js';
import { quoteWindowsArg, runShell } from '../src/proc.js';
import { normalizeTask } from '../src/task.js';
import { scopeViolations } from '../src/validate.js';

// Salida real de Cline CLI 3.0.66 (recortada).
const CLINE_OUTPUT = [
  '{"ts":"2026-09-30T16:40:43.786Z","type":"hook_event","hookEventName":"agent_start","agentId":"a","taskId":"t","parentAgentId":null}',
  '{"ts":"2026-09-30T16:40:45.752Z","type":"agent_event","event":{"type":"content_start","contentType":"reasoning","reasoning":"The","redacted":false}}',
  '{"ts":"2026-09-30T16:40:47.399Z","type":"hook_event","hookEventName":"tool_call","agentId":"a","taskId":"t","parentAgentId":null}',
  '{"ts":"2026-09-30T16:40:50.545Z","type":"agent_event","event":{"type":"done","reason":"completed","text":"DONE","iterations":3,"usage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"totalCost":0.002883615}}}',
  '{"ts":"2026-09-30T16:40:50.781Z","type":"run_result","finishReason":"completed","iterations":3,"usage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"cacheWriteTokens":0,"totalCost":0.002883615},"aggregateUsage":{"inputTokens":17339,"outputTokens":244,"cacheReadTokens":11520,"cacheWriteTokens":0,"totalCost":0.002883615},"durationMs":6763,"text":"DONE","model":{"id":"deepseek-v4-pro","provider":"deepseek"}}',
].join('\n');

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

test('cline: usa la copia instalada con AgentRelay cuando existe', () => {
  const expected = existsSync(BUNDLED_CLINE) ? [BUNDLED_CLINE] : ['cline'];
  assert.deepEqual(commandParts('cline'), expected);
  assert.deepEqual(commandParts(['node', 'x.js']), ['node', 'x.js']);
  assert.deepEqual(commandParts('/opt/cline'), ['/opt/cline']);
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
    assert.equal(loadConfig({ cwd: dir }).config.executor.model, 'deepseek-v4-pro');
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ level: 2, validation: { commands: ['npm test'] } }));
    writeFileSync(path.join(dir, 'agentrelay.config.local.json'), JSON.stringify({ executor: { command: ['node', 'cline.js'] } }));
    const { config, sources } = loadConfig({ cwd: dir, overrides: { level: '4' } });
    assert.equal(sources.length, 2);
    assert.equal(config.level, 4);
    assert.deepEqual(config.validation.commands, ['npm test']);
    assert.deepEqual(config.executor.command, ['node', 'cline.js']);
    assert.equal(config.executor.provider, 'deepseek');
    assert.throws(() => loadConfig({ cwd: dir, overrides: { level: 9 } }), /1-5/);
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

test('events: formatEvent da formato a los tipos de evento', () => {
  const t0 = Date.parse('2026-09-30T10:00:00.000Z');
  assert.equal(
    formatEvent({ type: 'run_start', ts: '2026-09-30T10:00:05.000Z', runId: 'r1', title: 'T', level: 3, levelName: 'equilibrado', selfReview: 'inline' }, t0),
    '[00:05] Ejecución r1 · nivel 3 (equilibrado) · self-review: inline — T',
  );
  assert.equal(formatEvent({ type: 'activity', kind: 'iteration', n: 1, ts: '2026-09-30T10:00:06.000Z' }, t0), null);
  assert.equal(formatEvent({ type: 'activity', kind: 'thinking', text: 'pensando', ts: '2026-09-30T10:00:06.000Z' }, t0), '[00:06]   piensa: pensando');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'editor', detail: './hello.txt' }, t0), '  edita: ./hello.txt');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'read_files', detail: 'a, b' }, t0), '  lee: a, b');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'run_commands', detail: 'npm test' }, t0), '  ejecuta: npm test');
  assert.equal(formatEvent({ type: 'activity', kind: 'tool', tool: 'write_to_file', detail: 'x' }, t0), '  write_to_file: x');
  assert.equal(formatEvent({ type: 'activity', kind: 'usage', inputTokens: 5463, outputTokens: 140, cost: 0.0024 }, t0), '  tokens 5463/140 · 0.0024 USD');
  assert.equal(formatEvent({ type: 'activity', kind: 'error', message: 'boom' }, t0), '  error: boom');
  assert.equal(formatEvent({ type: 'attempt_end', attempt: 1, ok: true, durationMs: 5000, agentStatus: 'done' }, t0), '✔ Intento 1 completado en 5 s (done)');
  assert.equal(formatEvent({ type: 'attempt_end', attempt: 1, ok: false, error: 'falló' }, t0), '✖ Intento 1 fallido: falló');
  assert.equal(formatEvent({ type: 'validation', command: 'npm test', passed: true, exitCode: 0, timedOut: false }, t0), '  validación `npm test`: correcta');
  assert.equal(formatEvent({ type: 'validation', command: 'npm test', passed: false, exitCode: 1, timedOut: false }, t0), '  validación `npm test`: FALLA (código 1)');
  assert.equal(formatEvent({ type: 'validation', command: 'npm test', passed: false, exitCode: null, timedOut: true }, t0), '  validación `npm test`: TIEMPO AGOTADO');
  assert.equal(formatEvent({ type: 'check_start' }, t0), '  validando…');
  assert.equal(formatEvent({ type: 'check', changedFiles: 2, passed: true, scopeViolations: ['LICENSE'], headMoved: false }, t0), '  2 archivo(s) modificado(s) · validación correcta · archivos protegidos: LICENSE');
  assert.equal(formatEvent({ type: 'retry', n: 1, max: 3 }, t0), '↻ Corrección automática 1/3');
  assert.equal(formatEvent({ type: 'self_review_start' }, t0), '▶ Self-review del ejecutor');
  assert.equal(formatEvent({ type: 'self_review_skipped', reason: 'redundante' }, t0), '  self-review separada omitida: redundante');
  assert.equal(formatEvent({ type: 'status', status: 'accepted', reasons: ['a', 'b'] }, t0), '■ Estado: accepted (a; b)');
  assert.equal(formatEvent({ type: 'review', decision: 'fix', feedback: 'F' }, t0), 'Revisión del orquestador: fix — F');
  assert.equal(formatEvent({ type: 'review', decision: 'accept' }, t0), 'Revisión del orquestador: accept');
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
