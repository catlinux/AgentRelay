import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProjectState, renderProjectState, writeProjectState } from '../src/project-state.js';
import { PROJECT_BLOCK } from '../src/instructions.js';
import { createRunDir, ensureWorkspace, saveState } from '../src/store.js';
import { git, makeRepo } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

function run(args, cwd, home) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, AGENTRELAY_HOME: home, AGENTRELAY_NO_MIGRATE: '1' },
  });
}

function addRun(root, id, status, objective = `Objetivo ${id}`) {
  ensureWorkspace(root);
  createRunDir(root, id);
  saveState(root, {
    id, status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pid: process.pid,
    task: { title: objective, objective }, attempts: [{ n: 1 }],
  });
}

test('collectProjectState resume git, configuración, instrucciones, ejecuciones y TODO', async () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'AGENTS.md'), PROJECT_BLOCK);
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), '@AGENTS.md\n');
    writeFileSync(path.join(repo.dir, 'TODO.md'), '- [x] Hecho\n- [ ] Pendiente uno\n- [ ] Pendiente dos\n');
    addRun(repo.dir, 'a', 'awaiting_review', 'Revisar esto');
    addRun(repo.dir, 'b', 'completed');
    const state = await collectProjectState(repo.dir, { now: new Date('2026-10-02T12:00:00Z') });
    assert.equal(state.name, path.basename(repo.dir));
    assert.equal(state.git.clean, false);
    assert.equal(state.git.pendingCount, 3);
    assert.equal(state.git.lastCommits[0].subject, 'init');
    assert.equal(state.executor.type, 'codex');
    assert.equal(state.executor.model, 'gpt-6-luna');
    assert.equal(state.instructions.claude, 'importa AGENTS.md');
    assert.deepEqual(state.runs.awaitingReview, ['a']);
    assert.equal(state.runs.total, 2);
    assert.equal(state.runs.recent[0].objective, 'Objetivo b');
    assert.deepEqual(state.todo, ['Pendiente uno', 'Pendiente dos']);
    assert.match(renderProjectState(state), /## Últimas ejecuciones[\s\S]*## Últimos commits[\s\S]*## Pendiente \(TODO.md\)[\s\S]*## Qué hacer ahora/);
    const written = await writeProjectState(repo.dir, { now: new Date('2026-10-02T12:00:00Z') });
    assert.equal(written, path.join(repo.dir, '.agentrelay', 'ESTADO.md'));
    assert.ok(existsSync(written));
    assert.match(readFileSync(written, 'utf8'), /^# Estado de /);
  } finally { repo.cleanup(); }
});

test('collectProjectState aplica las recomendaciones en orden de prioridad', async () => {
  const repo = makeRepo();
  const fresh = () => collectProjectState(repo.dir, { now: new Date() });
  try {
    writeFileSync(path.join(repo.dir, 'AGENTS.md'), PROJECT_BLOCK);
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), '@AGENTS.md\n');
    addRun(repo.dir, 'review', 'awaiting_review');
    assert.match((await fresh()).next[0], /Revisa la ejecución review/);
    rmSync(path.join(repo.dir, '.agentrelay'), { recursive: true, force: true });
    addRun(repo.dir, 'stopped', 'interrupted');
    addRun(repo.dir, 'active', 'running');
    assert.match((await fresh()).next[0], /Recupera con agentrelay recover stopped/);
    rmSync(path.join(repo.dir, '.agentrelay'), { recursive: true, force: true });
    addRun(repo.dir, 'active', 'running');
    assert.match((await fresh()).next[0], /sigue con agentrelay watch/);
    rmSync(path.join(repo.dir, '.agentrelay'), { recursive: true, force: true });
    rmSync(path.join(repo.dir, 'AGENTS.md'));
    rmSync(path.join(repo.dir, 'CLAUDE.md'));
    writeFileSync(path.join(repo.dir, 'dirty.txt'), 'dirty');
    assert.match((await fresh()).next[0], /Hay 1 cambios sin confirmar/);
    rmSync(path.join(repo.dir, 'dirty.txt'));
    assert.equal((await fresh()).next[0], 'Ejecuta agentrelay init');
    writeFileSync(path.join(repo.dir, 'AGENTS.md'), PROJECT_BLOCK);
    assert.match((await fresh()).next[0], /Hay 1 cambios sin confirmar/);
    writeFileSync(path.join(repo.dir, 'CLAUDE.md'), '@AGENTS.md');
    execFileSync('git', ['add', 'AGENTS.md', 'CLAUDE.md'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-q', '-m', 'instrucciones'], { cwd: repo.dir });
    assert.match((await fresh()).next[0], /Todo en orden/);
  } finally { repo.cleanup(); }
});

test('status --json imprime JSON y status rechaza carpetas fuera de git', () => {
  const repo = makeRepo();
  const temp = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-status-'));
  const home = path.join(temp, 'home');
  try {
    const json = run(['status', '--json'], repo.dir, home);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).name, path.basename(repo.dir));
    const md = run(['status'], repo.dir, home);
    assert.equal(md.status, 0, md.stderr);
    assert.match(md.stdout, /^# Estado de /);
    const outside = run(['status'], temp, home);
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /no es un repositorio git/);
  } finally {
    repo.cleanup();
    rmSync(temp, { recursive: true, force: true });
  }
});
