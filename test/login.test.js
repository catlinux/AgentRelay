import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_CODEX, makeRepo } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));
const task = {
  title: 'Tarea de prueba', objective: 'Prueba', context: '', type: 'feature', complexity: 'normal',
  files: [], acceptanceCriteria: [], validation: [], doNotModify: [],
};

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-login-'));
  const log = path.join(dir, 'calls.log');
  const session = path.join(dir, 'session');
  writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'codex', command: [process.execPath, FAKE_CODEX] } }));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return { dir, log, session };
}

function cli(dir, args, extra = {}) {
  return spawnSync(process.execPath, [BIN, '--cwd', dir, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FAKE_CODEX_LOG: path.join(dir, 'calls.log'), ...extra },
  });
}

test('login reconoce una sesión existente y no abre Codex', () => {
  const { dir, log } = setup();
  try {
    const res = cli(dir, ['login'], { FAKE_CODEX_LOGGED_IN: '1' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Sesión activa: Logged in using ChatGPT/);
    assert.equal(res.stdout.includes('Se abrirá'), false);
    assert.equal(requireCalls(log), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('login conecta y doctor informa del estado de sesión', () => {
  const { dir, log, session } = setup();
  try {
    const env = { FAKE_CODEX_SESSION_FILE: session };
    const login = cli(dir, ['login', '--device'], env);
    assert.equal(login.status, 0, login.stderr);
    assert.equal(login.stdout.indexOf('https://chatgpt.com') < login.stdout.indexOf('Se'), true);
    assert.match(login.stdout, /Se mostrará un código/);
    assert.match(login.stdout, /✔ Sesión iniciada/);
    assert.equal(readFileSync(log, 'utf8').trim(), '["login","--device-auth"]');
    const doctor = cli(dir, ['doctor'], env);
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    assert.match(doctor.stdout, /Sesión: Logged in using ChatGPT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('run falla antes de empezar cuando Codex no tiene sesión', () => {
  const repo = makeRepo();
  try {
    const config = { executor: { type: 'codex', command: [process.execPath, FAKE_CODEX] } };
    writeFileSync(path.join(repo.dir, 'agentrelay.config.json'), JSON.stringify(config));
    const taskFile = path.join(os.tmpdir(), `agentrelay-task-${process.pid}.json`);
    writeFileSync(taskFile, JSON.stringify(task));
    try {
      const res = cli(repo.dir, ['run', taskFile, '--allow-dirty'], { FAKE_CODEX_LOG: repo.logFile, FAKE_CODEX_LOGGED_IN: '0' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /no tiene sesión iniciada/);
      assert.match(res.stderr, /agentrelay login/);
      assert.equal(res.stderr.split('https://chatgpt.com').length - 1, 1);
    } finally { rmSync(taskFile, { force: true }); }
  } finally { repo.cleanup(); }
});

function requireCalls(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

test('doctor ofrece crear una cuenta gratuita cuando no hay sesiÃ³n', () => {
  const { dir } = setup();
  try {
    const doctor = cli(dir, ['doctor'], { FAKE_CODEX_LOGGED_IN: '0' });
    assert.equal(doctor.status, 1);
    assert.equal(doctor.stdout.split('https://chatgpt.com').length - 1, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('login no muestra sugerencia de cuenta para Cline', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-login-cline-'));
  try {
    writeFileSync(path.join(dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'cline' } }));
    const res = cli(dir, ['login']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout.includes('https://chatgpt.com'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
