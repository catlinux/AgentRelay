import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandsSourceDir, commandsStatus, commandsTargetDir, installCommands, listCommands, MANAGED_MARK, removeCommands, legacyCommandsDir, removeLegacyCommands } from '../src/claude-commands.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

test('listCommands lee los seis comandos reales y su metadato', () => {
  assert.match(commandsSourceDir(), /claude-commands[\\/]ar[\\/]?$/);
  const commands = listCommands();
  assert.deepEqual(commands.map(({ name }) => name), ['ejecutor.md', 'esfuerzo.md', 'estado.md', 'modelo.md', 'nivel.md', 'triaje.md']);
  for (const { content } of commands) {
    const frontmatter = content.split('---')[1];
    assert.ok(content.includes(MANAGED_MARK));
    assert.match(frontmatter, /description:/);
    assert.match(frontmatter, /model: haiku/);
  }
  const status = commands.find(({ name }) => name === 'estado.md').content;
  assert.match(status, /agentrelay doctor -q 2>&1 \| grep -vE/);
  assert.match(status, /agentrelay \(setup\|init\|login\)/);
});

test('removeLegacyCommands retira solo comandos gestionados conocidos', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-legacy-'));
  const legacy = legacyCommandsDir(dir);
  mkdirSync(legacy, { recursive: true });
  try {
    const commands = listCommands();
    for (const { name, content } of commands) writeFileSync(path.join(legacy, name), content);
    writeFileSync(path.join(legacy, 'propio.md'), 'archivo propio');
    writeFileSync(path.join(legacy, 'otro.md'), `otro ${MANAGED_MARK}`);
    const result = removeLegacyCommands(dir);
    assert.equal(result.removed.length, 6);
    assert.equal(readFileSync(path.join(legacy, 'propio.md'), 'utf8'), 'archivo propio');
    assert.equal(readFileSync(path.join(legacy, 'otro.md'), 'utf8'), `otro ${MANAGED_MARK}`);
    assert.ok(existsSync(legacy));
    rmSync(path.join(legacy, 'propio.md'));
    rmSync(path.join(legacy, 'otro.md'));
    assert.deepEqual(removeLegacyCommands(dir).removed, []);
    assert.equal(existsSync(legacy), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install, estado, normalización CRLF, protección de archivos propios y remove', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-commands-'));
  const source = path.join(dir, 'source');
  const emptySource = path.join(dir, 'empty');
  const claude = path.join(dir, 'claude');
  mkdirSync(source);
  mkdirSync(emptySource);
  const original = listCommands();
  for (const command of original) writeFileSync(path.join(source, command.name), command.content);
  try {
    assert.deepEqual(listCommands(source).map(({ name }) => name), original.map(({ name }) => name));
    assert.throws(() => listCommands(emptySource), /No se encontraron comandos \.md/);
    assert.equal(commandsStatus(claude, source).status, 'missing');
    const first = installCommands(claude, source);
    assert.equal(first.created.length, 6);
    assert.equal(readdirSync(commandsTargetDir(claude)).length, 6);
    assert.equal(installCommands(claude, source).unchanged.length, 6);
    assert.equal(commandsStatus(claude, source).status, 'current');

    const target = path.join(commandsTargetDir(claude), 'estado.md');
    writeFileSync(target, readFileSync(target, 'utf8').replace('Estado de AgentRelay:', 'Estado anterior:'));
    assert.equal(commandsStatus(claude, source).status, 'outdated');
    assert.equal(installCommands(claude, source).updated.length, 1);

    writeFileSync(target, readFileSync(target, 'utf8').replace(/\n/g, '\r\n'));
    assert.equal(commandsStatus(claude, source).status, 'current');

    const ownFile = path.join(commandsTargetDir(claude), 'modelo.md');
    writeFileSync(ownFile, 'archivo propio\r\n');
    const skipped = installCommands(claude, source);
    assert.deepEqual(skipped.skipped, ['modelo.md']);
    assert.equal(readFileSync(ownFile, 'utf8'), 'archivo propio\r\n');
    assert.equal(commandsStatus(claude, source).details.find(({ name }) => name === 'modelo.md').state, 'foreign');

    writeFileSync(path.join(commandsTargetDir(claude), 'nota.txt'), 'mía');
    const removed = removeCommands(claude, source);
    assert.equal(removed.removed.length, 5);
    assert.deepEqual(removed.kept, ['modelo.md']);
    assert.ok(existsSync(commandsTargetDir(claude)));
    assert.equal(readFileSync(ownFile, 'utf8'), 'archivo propio\r\n');
    rmSync(path.join(commandsTargetDir(claude), 'nota.txt'));
    rmSync(ownFile);
    writeFileSync(path.join(commandsTargetDir(claude), 'estado.md'), original.find(({ name }) => name === 'estado.md').content);
    assert.equal(removeCommands(claude, source).removed.length, 1);
    assert.equal(existsSync(commandsTargetDir(claude)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
