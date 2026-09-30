#!/usr/bin/env node
// Simulador de Cline CLI para los tests: reproduce el formato NDJSON real
// (--json) sin llamar a ningún modelo.
//
// FAKE_CLINE_PLAN: JSON { "<fase>": acción | [acción, acción, ...] }
//   acción: { write: { ruta: contenido }, report: {...} | null, text, finishReason, exitCode }
// FAKE_CLINE_LOG: archivo donde se registra cada llamada (una línea JSON).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
// `node --test` también ejecuta este archivo (sin argumentos): no hay nada que hacer.
if (!args.length) process.exit(0);
if (args.includes('--version')) {
  console.log('0.0.0-fake');
  process.exit(0);
}

const instruction = args[args.length - 1];
const promptFile = /Read the file (\S+) in the working directory/.exec(instruction)?.[1];
const prompt = readFileSync(path.resolve(process.cwd(), promptFile), 'utf8');
const phase = /^AgentRelay-Phase: (\S+)/m.exec(prompt)[1];

const logFile = process.env.FAKE_CLINE_LOG;
const previous = logFile && existsSync(logFile)
  ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.phase === phase).length
  : 0;
if (logFile) appendFileSync(logFile, `${JSON.stringify({ phase, args, promptFile })}\n`);

const plan = JSON.parse(process.env.FAKE_CLINE_PLAN || '{}');
const steps = plan[phase];
const action = (Array.isArray(steps) ? steps[Math.min(previous, steps.length - 1)] : steps) || {};

for (const [file, content] of Object.entries(action.write || {})) {
  const target = path.resolve(process.cwd(), file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const report = action.report === null ? null : {
  status: 'done', summary: `fake ${phase}`, filesChanged: Object.keys(action.write || {}),
  checks: [], issues: [], questions: [], needsEscalation: false, ...(action.report || {}),
};
const text = action.text ?? (report ? `Done.\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`` : 'Done.');
const finishReason = action.finishReason || 'completed';
const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0.001 };
const emit = (event) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));

emit({ type: 'hook_event', hookEventName: 'agent_start', agentId: 'agent_fake', taskId: 'conv_fake', parentAgentId: null });
emit({ type: 'agent_event', event: { type: 'iteration_start', iteration: 1 } });
emit({ type: 'hook_event', hookEventName: 'tool_call', agentId: 'agent_fake', taskId: 'conv_fake', parentAgentId: null });
emit({ type: 'agent_event', event: { type: 'done', reason: finishReason, text, iterations: 1, usage } });
emit({
  type: 'run_result', finishReason, iterations: 1, usage, aggregateUsage: usage, durationMs: 5, text,
  model: { id: 'fake-model', provider: 'fake' },
});
process.exit(action.exitCode ?? 0);
