import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandNames, renderCommandHelp, renderHelpIndex } from '../src/help.js';

const bin = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const cliSource = readFileSync(new URL('../src/cli.js', import.meta.url), 'utf8');

function run(args, cwd) {
  const home = path.join(cwd, 'agentrelay-home');
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENTRELAY_HOME: home,
      AGENTRELAY_NO_MIGRATE: '1',
      AGENTRELAY_NO_STATE: '1',
    },
  });
}

test('hay ayuda para cada comando listado en la ayuda general', () => {
  const help = cliSource.match(/const HELP = `([\s\S]*?)`;/)?.[1];
  assert.ok(help, 'no se encontró la constante HELP');
  const listed = [...help.matchAll(/^\s+agentrelay\s+([a-z][a-z0-9-]*)\b/gm)].map((match) => match[1]);
  assert.deepEqual([...new Set(listed)].sort(), [...commandNames()].sort());

  for (const name of commandNames()) {
    const rendered = renderCommandHelp(name);
    assert.ok(rendered, `falta ayuda para ${name}`);
    assert.match(rendered, /Uso:/);
    assert.match(rendered, /Ejemplos:/);
  }
});

test('renderHelpIndex lista comandos y explica cómo abrir la ayuda detallada', () => {
  const rendered = renderHelpIndex();
  for (const name of commandNames()) assert.match(rendered, new RegExp(`agentrelay ${name}\\s`));
  assert.match(rendered, /Ayuda de un comando: agentrelay help <comando>/);
});

test('agentrelay help funciona fuera de un repositorio git', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-help-'));
  try {
    for (const args of [['help'], ['--help']]) {
      const result = run(args, cwd);
      assert.equal(result.status, 0, result.stderr);
      if (args[0] === 'help') assert.match(result.stdout, /Ayuda detallada de cada comando: agentrelay help <comando>/);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout.includes(`${String.fromCharCode(27)}[`), false);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('help por comando imprime detalles para help <comando> y --help', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-help-'));
  try {
    for (const args of [['help', 'use'], ['run', '--help'], ['help', 'doctor'], ['doctor', '-h']]) {
      const result = run(args, cwd);
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stdout, /Descripción:/);
      assert.match(result.stdout, /Uso:/);
      assert.match(result.stdout, /Opciones:/);
      assert.match(result.stdout, /Ejemplos:/);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout.includes(`${String.fromCharCode(27)}[`), false);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('help informa de comandos desconocidos por stderr y termina con código 1', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-help-'));
  try {
    const result = run(['help', 'xyz'], cwd);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Comando desconocido: xyz\. Comandos: /);
    for (const name of commandNames()) assert.ok(result.stderr.includes(name));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
