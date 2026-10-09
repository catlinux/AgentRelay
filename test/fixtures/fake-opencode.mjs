// Simulador de OpenCode CLI para los tests: reproduce el formato JSON real
// (opencode run --auto --format json) sin llamar a ningún modelo.
//
// FAKE_OPENCODE_DELAY: milisegundos que duerme antes de salir (para el timeout).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
// `node --test` también ejecuta este archivo (sin argumentos): no hay nada que hacer.
if (!args.length) process.exit(0);
if (args.includes('--version')) {
  process.stdout.write('opencode v2.0.21\n');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'list') {
  const output = process.env.FAKE_OPENCODE_AUTH_OUTPUT
    ?? (process.env.FAKE_OPENCODE_STORED === '1' ? 'OpenCode Console  Personal  stored\n' : 'No authenticated integrations\n');
  const stream = process.env.FAKE_OPENCODE_AUTH_STREAM === 'stderr' ? process.stderr : process.stdout;
  stream.write(output);
  process.exit(Number(process.env.FAKE_OPENCODE_AUTH_CODE ?? 0));
}
if (args[0] === 'auth' && args[1] === 'login') {
  process.stdout.write('OpenCode login assistant completed\n');
  process.exit(0);
}
if (args[0] === 'models') {
  const models = process.env.FAKE_OPENCODE_MODELS?.split(',').map((model) => model.trim()).filter(Boolean)
    ?? ['opencode/nemotron-3-ultra-free', 'opencode/gpt-oss-120b-free'];
  process.stdout.write(`${models.join('\n')}\n`);
  process.exit(0);
}

if (args[0] !== 'run') process.exit(0);

if (process.env.FAKE_OPENCODE_PLAN !== undefined) {
  const instruction = args[args.length - 1];
  const promptFile = /Read the file (\S+) in the working directory/.exec(instruction)?.[1];
  const prompt = readFileSync(path.resolve(process.cwd(), promptFile), 'utf8');
  const phase = /^AgentRelay-Phase: (\S+)/m.exec(prompt)[1];
  const modelIndex = args.indexOf('-m');
  const model = modelIndex < 0 ? null : args[modelIndex + 1];
  const plan = JSON.parse(process.env.FAKE_OPENCODE_PLAN || '{}');
  const modelSteps = plan.byModel?.[model]?.[phase];
  const logFile = process.env.FAKE_OPENCODE_LOG;
  const previous = logFile && existsSync(logFile)
    ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((call) => call.phase === phase && (modelSteps === undefined || call.model === model)).length
    : 0;
  if (logFile) appendFileSync(logFile, `${JSON.stringify({ phase, model, args, promptFile })}\n`);

  const steps = modelSteps ?? plan[phase];
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
  const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  emit({ type: 'step_start', part: { type: 'step-start' } });
  for (const [file, content] of Object.entries(action.write || {})) {
    emit({
      type: 'tool_use',
      part: {
        type: 'tool', tool: 'write',
        state: { status: 'completed', input: { path: file, content }, output: `Created file successfully: ${file}`, title: 'write' },
      },
    });
  }
  emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'tool-calls', cost: 0, tokens: { input: 1000, output: 100, reasoning: 0, cache: { read: 0, write: 0 } } } });
  emit({ type: 'text', part: { type: 'text', text } });

  if (action.error) {
    process.stderr.write(`${action.error}\n`);
    emit({ type: 'error', error: { name: 'UnknownError', data: { message: action.error } } });
  }
  if (process.env.FAKE_OPENCODE_DELAY) await sleep(Number(process.env.FAKE_OPENCODE_DELAY));
  process.exitCode = action.exitCode ?? (action.error ? 1 : 0);
} else {
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
emit({ type: 'step_start', part: { type: 'step-start' } });
emit({
  type: 'tool_use',
  part: {
    type: 'tool', tool: 'write',
    state: { status: 'completed', input: { path: 'hola.txt', content: 'hola' }, output: 'Created file successfully: hola.txt', title: 'write' },
  },
});
emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'tool-calls', cost: 0, tokens: { input: 8002, output: 38, reasoning: 36, cache: { read: 0, write: 0 } } } });
emit({ type: 'text', part: { type: 'text', text: 'Done.\n```json\n{"status":"done","summary":"ok","filesChanged":["hola.txt"]}\n```' } });

if (process.env.FAKE_OPENCODE_DELAY) await sleep(Number(process.env.FAKE_OPENCODE_DELAY));
process.exit(0);
}
