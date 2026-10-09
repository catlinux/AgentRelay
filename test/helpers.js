// Utilidades compartidas por los tests.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, merge } from '../src/config.js';

export const FAKE_CODEX = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
export const FAKE_OPENCODE = fileURLToPath(new URL('./fixtures/fake-opencode.mjs', import.meta.url));

// Los procesos hijos de los tests deben poder abrir repositorios temporales
// creados por otra identidad (como sucede en runners de CI).
const parsedGitConfigCount = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? '0', 10);
const gitConfigCount = Number.isFinite(parsedGitConfigCount) ? parsedGitConfigCount : 0;
process.env.GIT_CONFIG_COUNT = String(gitConfigCount + 1);
process.env[`GIT_CONFIG_KEY_${gitConfigCount}`] = 'safe.directory';
process.env[`GIT_CONFIG_VALUE_${gitConfigCount}`] = '*';

export function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, '\n');
}

export function git(cwd, ...args) {
  return execFileSync('git', ['-c', `safe.directory=${cwd}`, ...args], { cwd, encoding: 'utf8' });
}

/** Repositorio temporal con un commit inicial y un script de validación. */
export function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-test-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'core.autocrlf', 'false');
  writeFileSync(
    path.join(dir, 'check.js'),
    "const fs = require('fs');\n"
    + "const ok = fs.existsSync('hello.txt') && fs.readFileSync('hello.txt', 'utf8').trim() === 'hi';\n"
    + "if (!ok) { console.error('hello.txt debe contener hi'); process.exit(1); }\n",
  );
  writeFileSync(path.join(dir, 'package.json'), '{ "type": "commonjs" }\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const logFile = path.join(dir, '..', `${path.basename(dir)}.calls.log`);
  return {
    dir,
    logFile,
    calls: () => {
      try {
        return normalizeLineEndings(readFileSync(logFile, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      rmSync(logFile, { force: true });
    },
  };
}

export function testConfig(overrides = {}) {
  return merge(merge({}, DEFAULT_CONFIG), merge({
    executor: { type: 'opencode', command: [process.execPath, FAKE_OPENCODE], provider: null, model: 'fake-model', timeoutSeconds: 60 },
    validation: { commands: [], timeoutSeconds: 60 },
  }, overrides));
}

/** Define el comportamiento del OpenCode simulado para el siguiente test. */
export function fakePlan(repo, plan) {
  process.env.FAKE_OPENCODE_PLAN = JSON.stringify(plan);
  process.env.FAKE_OPENCODE_LOG = repo.logFile;
  process.env.FAKE_OPENCODE_MODELS = [...new Set([
    'opencode/nemotron-3-ultra-free', 'opencode/gpt-oss-120b-free', 'fake-model',
    ...Object.keys(plan.byModel || {}),
  ])].join(',');
  process.env.FAKE_OPENCODE_STORED = '1';
}

export function baseTask(overrides = {}) {
  return {
    title: 'Crear hello.txt',
    objective: 'Crea hello.txt con el texto hi',
    context: '',
    type: 'feature',
    complexity: 'normal',
    selfReview: null,
    constraints: [],
    files: ['hello.txt'],
    acceptanceCriteria: ['hello.txt contiene hi'],
    validation: ['node check.js'],
    doNotModify: [],
    ...overrides,
  };
}
