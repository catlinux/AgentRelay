import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandNames } from '../src/help.js';
import { RETIRED_COMMANDS, commandsSourceDir, commandsStatus, commandsTargetDir, installCommands, listCommands, MANAGED_MARK, removeCommands, legacyCommandsDir, removeLegacyCommands } from '../src/claude-commands.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

test('listCommands lee los comandos reales y su metadato', () => {
  assert.match(commandsSourceDir(), /claude-commands[\\/]ar[\\/]?$/);
  const commands = listCommands();
  assert.deepEqual(commands.map(({ name }) => name), ['check.md', 'config.md', 'doctor.md', 'executors.md', 'help.md', 'init.md', 'list.md', 'login.md', 'providers.md', 'rank.md', 'recover.md', 'review.md', 'run.md', 'set.md', 'setup.md', 'show.md', 'start.md', 'status.md', 'unset.md', 'update.md', 'use.md']);
  for (const { content } of commands) {
    const frontmatter = content.split('---')[1];
    assert.ok(content.includes(MANAGED_MARK));
    assert.match(frontmatter, /description:/);
    assert.match(frontmatter, /model: haiku/);
  }
  const status = commands.find(({ name }) => name === 'status.md').content;
  assert.ok(status.includes('agentrelay status $ARGUMENTS'));
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
    assert.equal(result.removed.length, commands.length);
    assert.equal(readFileSync(path.join(legacy, 'propio.md'), 'utf8'), 'archivo propio');
    assert.equal(readFileSync(path.join(legacy, 'otro.md'), 'utf8'), `otro ${MANAGED_MARK}`);
    assert.ok(existsSync(legacy));
    rmSync(path.join(legacy, 'propio.md'));
    rmSync(path.join(legacy, 'otro.md'));
    assert.deepEqual(removeLegacyCommands(dir).removed, []);
    assert.equal(existsSync(legacy), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install, status, normalización CRLF, protección de archivos propios y remove', () => {
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
    assert.equal(first.created.length, original.length);
    assert.equal(readdirSync(commandsTargetDir(claude)).length, original.length);
    assert.equal(installCommands(claude, source).unchanged.length, original.length);
    assert.equal(commandsStatus(claude, source).status, 'current');

    const target = path.join(commandsTargetDir(claude), 'status.md');
    writeFileSync(target, readFileSync(target, 'utf8').replace('Resultado:', 'Resultado anterior:'));
    assert.equal(commandsStatus(claude, source).status, 'outdated');
    assert.equal(installCommands(claude, source).updated.length, 1);

    writeFileSync(target, readFileSync(target, 'utf8').replace(/\n/g, '\r\n'));
    assert.equal(commandsStatus(claude, source).status, 'current');

    const ownFile = path.join(commandsTargetDir(claude), 'use.md');
    writeFileSync(ownFile, 'archivo propio\r\n');
    const skipped = installCommands(claude, source);
    assert.deepEqual(skipped.skipped, ['use.md']);
    assert.equal(readFileSync(ownFile, 'utf8'), 'archivo propio\r\n');
    assert.equal(commandsStatus(claude, source).details.find(({ name }) => name === 'use.md').state, 'foreign');

    writeFileSync(path.join(commandsTargetDir(claude), 'nota.txt'), 'mía');
    const removed = removeCommands(claude, source);
    assert.equal(removed.removed.length, original.length - 1);
    assert.deepEqual(removed.kept, ['use.md']);
    assert.ok(existsSync(commandsTargetDir(claude)));
    assert.equal(readFileSync(ownFile, 'utf8'), 'archivo propio\r\n');
    rmSync(path.join(commandsTargetDir(claude), 'nota.txt'));
    rmSync(ownFile);
    writeFileSync(path.join(commandsTargetDir(claude), 'status.md'), original.find(({ name }) => name === 'status.md').content);
    assert.equal(removeCommands(claude, source).removed.length, 1);
    assert.equal(existsSync(commandsTargetDir(claude)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('los comandos retirados se borran del equipo solo si llevan la marca de AgentRelay', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-retired-'));
  try {
    const target = commandsTargetDir(dir);
    mkdirSync(target, { recursive: true });
    assert.deepEqual(RETIRED_COMMANDS.slice(0, 5), ['modelo.md', 'esfuerzo.md', 'ejecutor.md', 'nivel.md', 'triaje.md']);
    assert.ok(RETIRED_COMMANDS.includes('estado.md') && RETIRED_COMMANDS.includes('usar.md') && RETIRED_COMMANDS.includes('ranquing.md'));
    writeFileSync(path.join(target, 'modelo.md'), `viejo ${MANAGED_MARK}`);
    writeFileSync(path.join(target, 'nivel.md'), `viejo ${MANAGED_MARK}`);
    writeFileSync(path.join(target, 'triaje.md'), 'comando propio del usuario');
    const result = installCommands(dir);
    assert.deepEqual(result.retired.sort(), ['modelo.md', 'nivel.md']);
    assert.equal(existsSync(path.join(target, 'modelo.md')), false);
    assert.equal(readFileSync(path.join(target, 'triaje.md'), 'utf8'), 'comando propio del usuario');
    assert.deepEqual(installCommands(dir).retired, []);
    const removed = removeCommands(dir);
    assert.deepEqual(removed.removed.sort(), listCommands().map(({ name }) => name));
    assert.ok(existsSync(path.join(target, 'triaje.md')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cada comando del terminal tiene su /ar:<comando> con el mismo nombre (salvo watch y hook) y no sobra ninguno', () => {
  const expected = commandNames().filter((name) => !['watch', 'hook'].includes(name)).map((name) => `${name}.md`).sort();
  assert.deepEqual(listCommands().map(({ name }) => name), expected);
});
