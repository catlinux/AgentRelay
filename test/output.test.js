import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOutput } from '../src/output.js';
import { FAKE_CLINE, git, makeRepo, fakePlan, baseTask } from './helpers.js';
import { GLOBAL_BLOCK, PROJECT_BLOCK } from '../src/instructions.js';
import { commandsSourceDir, commandsTargetDir, listCommands, MANAGED_MARK } from '../src/claude-commands.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
function streams() {
  const out = { value: '', write(text) { this.value += text; } };
  const err = { value: '', write(text) { this.value += text; } };
  return { out, err };
}
function cli(args, cwd, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

test('createOutput enruta info, detalle, resultado, avisos y errores', () => {
  for (const [quiet, verbose] of [[false, false], [true, false], [false, true]]) {
    const { out, err } = streams();
    const output = createOutput({ quiet, verbose, stdout: out, stderr: err });
    output.info('info'); output.detail('detalle'); output.result('resultado'); output.warn('cuidado'); output.error('error');
    assert.equal(out.value, `${quiet ? '' : 'info\n'}${verbose ? 'detalle\n' : ''}resultado\n`);
    assert.equal(err.value, '[aviso] cuidado\nerror\n');
  }
});

test('createOutput rechaza quiet y verbose simultáneos', () => {
  assert.throws(() => createOutput({ quiet: true, verbose: true }), /--quiet y --verbose no se pueden usar a la vez/);
});

test('CLI conserva alias de versión y rechaza modos incompatibles', () => {
  const long = cli(['--version'], process.cwd());
  const short = cli(['-V'], process.cwd());
  assert.equal(long.status, 0); assert.equal(short.status, 0); assert.equal(long.stdout, short.stdout);
  const conflict = cli(['-q', '-v', 'doctor'], process.cwd());
  assert.equal(conflict.status, 1); assert.match(conflict.stderr, /--quiet y --verbose no se pueden usar a la vez/);
  const helpDefault = cli(['--help'], process.cwd());
  assert.match(helpDefault.stdout, /--no-commands/);
  assert.match(helpDefault.stdout, /--browser/);
  assert.match(helpDefault.stdout, /Opciones de usage:/);
  assert.match(helpDefault.stdout, /-h, --help/);
  assert.match(helpDefault.stdout, /-V, --version/);
  const helpFlagged = cli(['--help', '-q'], process.cwd());
  assert.equal(helpDefault.stdout, helpFlagged.stdout);
  const versionDefault = cli(['--version'], process.cwd());
  const versionFlagged = cli(['--version', '-q'], process.cwd());
  assert.equal(versionDefault.stdout, versionFlagged.stdout);
});

test('run quieto imprime id y estado, verbose añade comando y rutas', () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'cline', command: [process.execPath, FAKE_CLINE], provider: 'fake', model: 'fake-model' }, validation: { commands: [] } }));
    writeFileSync(path.join(repo.dir, 'task.json'), JSON.stringify(baseTask()));
    git(repo.dir, 'add', '-A'); git(repo.dir, 'commit', '-q', '-m', 'fixture');
    fakePlan(repo, [{ status: 'completed', write: { 'hello.txt': 'hi' } }]);
    const quiet = cli(['run', 'task.json', '-q'], repo.dir, { FAKE_CLINE_LOG: repo.logFile });
    assert.equal(quiet.status, 2, quiet.stderr);
    const [summary, reportPath] = quiet.stdout.trim().split(/\r?\n/);
    assert.match(summary, /^[\w-]+  \w+$/); assert.match(reportPath, /report\.md$/); assert.equal(quiet.stdout.includes('# AgentRelay'), false);
    fakePlan(repo, [{ status: 'completed', write: { 'hello.txt': 'hi' } }]);
    const verbose = cli(['run', 'task.json', '-v'], repo.dir, { FAKE_CLINE_LOG: repo.logFile });
    assert.equal(verbose.status, 2, verbose.stderr);
    assert.match(verbose.stdout, /Ejecutor:/); assert.match(verbose.stdout, /Archivos del intento/);
  } finally { repo.cleanup(); }
});

test('doctor quieto omite información sana y deja visibles problemas', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-output-doctor-'));
  try {
    git(dir, 'init', '-q');
    const claude = path.join(dir, 'claude');
    mkdirSync(claude, { recursive: true });
    writeFileSync(path.join(dir, 'CLAUDE.md'), `${PROJECT_BLOCK}\n`);
    writeFileSync(path.join(claude, 'CLAUDE.md'), `${GLOBAL_BLOCK}\n`);
    for (const command of listCommands(commandsSourceDir())) {
      const target = path.join(commandsTargetDir(claude), command.name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, command.content);
    }
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'cline', command: [process.execPath, FAKE_CLINE] } }));
    const healthy = cli(['--cwd', dir, 'doctor', '-q', '--claude-dir', claude], dir, { AGENTRELAY_HOME: path.join(dir, 'home') });
    assert.equal(healthy.status, 0); assert.equal(healthy.stdout, '');
    const verbose = cli(['--cwd', dir, 'doctor', '-v', '--claude-dir', path.join(dir, 'claude')], dir, { AGENTRELAY_HOME: path.join(dir, 'home') });
    assert.equal(verbose.status, 0); assert.match(verbose.stdout, /Archivos de configuración:/); assert.match(verbose.stdout, /        /);
    const broken = cli(['--cwd', dir, 'doctor', '-q', '--config', 'missing.json', '--claude-dir', path.join(dir, 'claude')], dir, { AGENTRELAY_HOME: path.join(dir, 'home') });
    assert.equal(broken.status, 1); assert.match(broken.stdout, /\[fallo\]/); assert.doesNotMatch(broken.stdout, /\[ok\]/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
