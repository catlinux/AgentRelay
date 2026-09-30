import { appendFileSync, existsSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') {
  if (process.env.FAKE_CODEX_LOGGED_IN === '1' || (process.env.FAKE_CODEX_SESSION_FILE && existsSync(process.env.FAKE_CODEX_SESSION_FILE))) {
    process.stdout.write('Logged in using ChatGPT\n');
    process.exit(0);
  }
  process.stderr.write('Not logged in\n');
  process.exit(1);
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
process.exit(0);
