import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') {
  if (process.env.CODEX_HOME && existsSync(path.join(process.env.CODEX_HOME, 'auth.json'))) {
    process.stdout.write('Logged in using an API key\n');
    process.exit(0);
  }
  if (process.env.FAKE_CODEX_LOGGED_IN === '1' || (process.env.FAKE_CODEX_SESSION_FILE && existsSync(process.env.FAKE_CODEX_SESSION_FILE))) {
    process.stdout.write('Logged in using ChatGPT\n');
    process.exit(0);
  }
  process.stderr.write('Not logged in\n');
  process.exit(1);
}
if (args[0] === 'login' && args[1] === '--with-api-key') {
  for await (const _chunk of process.stdin) { /* consume the API key without storing or logging it */ }
  if (process.env.FAKE_CODEX_LOG) appendFileSync(process.env.FAKE_CODEX_LOG, `${JSON.stringify(args)}\n`);
  mkdirSync(process.env.CODEX_HOME, { recursive: true });
  writeFileSync(path.join(process.env.CODEX_HOME, 'auth.json'), JSON.stringify({ fake: true }));
  process.stdout.write('Logged in using an API key\n');
  process.exit(0);
}
if (args[0] === 'login') {
  appendFileSync(process.env.FAKE_CODEX_LOG, `${JSON.stringify(args)}\n`);
  if (process.env.FAKE_CODEX_SESSION_FILE) writeFileSync(process.env.FAKE_CODEX_SESSION_FILE, 'session');
  process.exit(Number(process.env.FAKE_CODEX_LOGIN_EXIT || 0));
}
if (args[0] === '--version') {
  process.stdout.write('fake-codex 1.0\n');
  process.exit(0);
}
if (process.env.FAKE_CODEX_QUOTA_UNLESS_HOME) {
  appendFileSync(process.env.FAKE_CODEX_LOG, `${JSON.stringify({ CODEX_HOME: process.env.CODEX_HOME || null })}\n`);
  if (path.resolve(process.env.CODEX_HOME || '') !== path.resolve(process.env.FAKE_CODEX_QUOTA_UNLESS_HOME)) {
    const message = process.env.FAKE_CODEX_QUOTA_MESSAGE || "You've hit your usage limit. Try again in 3 hours.";
    process.stdout.write(`${JSON.stringify({ type: 'turn.failed', error: { message } })}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fake-thread' })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{}' } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } })}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fake-thread' })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{}' } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } })}\n`);
}
process.exit(0);
