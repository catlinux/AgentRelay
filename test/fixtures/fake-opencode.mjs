// Simulador de OpenCode CLI para los tests: reproduce el formato JSON real
// (opencode run --auto --format json) sin llamar a ningún modelo.
//
// FAKE_OPENCODE_DELAY: milisegundos que duerme antes de salir (para el timeout).

import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
// `node --test` también ejecuta este archivo (sin argumentos): no hay nada que hacer.
if (!args.length) process.exit(0);
if (args.includes('--version')) {
  process.stdout.write('opencode v2.0.21\n');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'list') {
  if (process.env.FAKE_OPENCODE_STORED === '1') {
    process.stdout.write('OpenCode Console  Personal  stored\n');
    process.exit(0);
  }
  process.stderr.write('No accounts found\n');
  process.exit(1);
}
if (args[0] === 'models') {
  process.stdout.write('opencode/nemotron-3-ultra-free\nopencode/gpt-oss-120b-free\n');
  process.exit(0);
}

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
