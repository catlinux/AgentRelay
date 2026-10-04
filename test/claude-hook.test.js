import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookCommand, hookStatus, installHook, removeHook } from '../src/claude-hook.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function tempDir() { return mkdtempSync(path.join(os.tmpdir(), 'agentrelay-hook-')); }
function settings(dir) { return path.join(dir, 'settings.json'); }

test('hookCommand selects the platform command', () => {
  assert.equal(hookCommand('win32'), 'agentrelay.cmd hook');
  assert.equal(hookCommand('linux'), 'agentrelay hook');
});

test('installHook preserves settings, uses CRLF and is idempotent', () => {
  const dir = tempDir();
  try {
    const original = { theme: 'dark', hooks: { PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'other' }] }], PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'keep' }] }] } };
    writeFileSync(settings(dir), JSON.stringify(original, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    assert.deepEqual(installHook(dir), { action: 'added' });
    assert.equal(hookStatus(dir), 'current');
    const text = readFileSync(settings(dir), 'utf8');
    assert.match(text, /\r\n/);
    assert.equal(text.replace(/\r\n/g, '').includes('\n'), false);
    const parsed = JSON.parse(text);
    assert.equal(parsed.theme, original.theme);
    assert.deepEqual(parsed.hooks.PostToolUse, original.hooks.PostToolUse);
    assert.deepEqual(parsed.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
    assert.equal(parsed.hooks.PreToolUse.filter((entry) => entry.matcher === 'Edit|Write|MultiEdit').length, 1);
    assert.deepEqual(installHook(dir), { action: 'unchanged' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('installHook creates settings and invalid JSON is never changed', () => {
  const dir = tempDir();
  try {
    assert.deepEqual(installHook(dir), { action: 'created' });
    assert.equal(hookStatus(dir), 'current');
    writeFileSync(settings(dir), '{ broken');
    assert.equal(hookStatus(dir), 'invalid');
    assert.equal(installHook(dir).action, 'skipped');
    assert.deepEqual(removeHook(dir), { removed: false });
    assert.equal(readFileSync(settings(dir), 'utf8'), '{ broken');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('removeHook removes only its own entry and empty containers', () => {
  const dir = tempDir();
  try {
    const settingsValue = { unrelated: true, hooks: { PreToolUse: [{ matcher: 'Read', hooks: [] }, { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: hookCommand() }] }], PostToolUse: [{ matcher: '*', hooks: [] }] } };
    writeFileSync(settings(dir), JSON.stringify(settingsValue));
    assert.deepEqual(removeHook(dir), { removed: true });
    const result = JSON.parse(readFileSync(settings(dir), 'utf8'));
    assert.equal(result.unrelated, true);
    assert.deepEqual(result.hooks.PreToolUse, [settingsValue.hooks.PreToolUse[0]]);
    const onlyHook = tempDir();
    try {
      writeFileSync(settings(onlyHook), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: hookCommand() }] }] } }));
      assert.deepEqual(removeHook(onlyHook), { removed: true });
      assert.deepEqual(JSON.parse(readFileSync(settings(onlyHook), 'utf8')), {});
    } finally { rmSync(onlyHook, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup installs, skips, and uninstalls the hook using --claude-dir', () => {
  const dir = tempDir();
  try {
    const run = (...args) => spawnSync(process.execPath, [BIN, ...args, '--claude-dir', dir], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENTRELAY_HOME: path.join(dir, 'home') } });
    let result = run('setup', '--yes', '--no-commands');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(hookStatus(dir), 'current');
    assert.match(result.stdout, /Hook de Claude Code: recordará delegar al editar código/);
    result = run('setup', '--uninstall', '--yes', '--no-commands');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(settings(dir)), true);
    assert.equal(hookStatus(dir), 'missing');

    result = run('setup', '--yes', '--no-commands', '--no-hook');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(hookStatus(dir), 'missing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
