import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyReview, startRun } from '../src/orchestrator.js';
import { readEvents } from '../src/events.js';
import { listRunIds, runDir, saveState } from '../src/store.js';
import { loadChecks } from '../src/model-check.js';
import { normalizeTask } from '../src/task.js';
import { baseTask, fakePlan, git, makeRepo, testConfig } from './helpers.js';

const GOOD = { write: { 'hello.txt': 'hi\n' } };
const BAD = { write: { 'hello.txt': 'bye\n' } };

async function run(repo, { task = {}, config = {}, plan, allowDirty } = {}) {
  fakePlan(repo, plan);
  return startRun({
    root: repo.dir, task: normalizeTask(baseTask(task)), config: testConfig(config), allowDirty,
  });
}

function prompt(repo, state, n) {
  const attempt = state.attempts[n - 1];
  return readFileSync(path.join(runDir(repo.dir, state.id), `attempt-${n}-${attempt.kind}.prompt.md`), 'utf8');
}

test('implementa, valida y queda pendiente de revisión', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { plan: { implement: GOOD } });
    assert.equal(state.status, 'awaiting_review');
    assert.deepEqual(state.attempts.map((a) => a.kind), ['implement']);
    assert.equal(state.selfReview.mode, 'inline');
    assert.ok(state.lastCheck.passed);
    assert.deepEqual(state.lastCheck.files, [{ status: 'A', path: 'hello.txt' }]);
    assert.equal(state.attempts[0].report.status, 'done');
    assert.equal(state.usage.inputTokens, 1000);

    const text = prompt(repo, state, 1);
    assert.match(text, /AgentRelay-Phase: implement/);
    assert.match(text, /Self-review before finishing/);
    assert.match(text, /hello.txt contiene hi/);

    const dir = runDir(repo.dir, state.id);
    assert.match(readFileSync(path.join(dir, 'report.md'), 'utf8'), /pendiente de revisión/);
    assert.match(readFileSync(path.join(dir, 'diff.patch'), 'utf8'), /\+hi/);

    // Argumentos reales que recibe Cline.
    const [call] = repo.calls();
    assert.deepEqual(call.args.slice(0, 8), ['--json', '--auto-approve', 'true', '-P', 'fake', '-m', 'fake-model', '-t']);

    // AgentRelay no toca el índice ni crea commits en el repositorio del usuario.
    assert.equal(git(repo.dir, 'status', '--porcelain').trim(), '?? hello.txt');
    assert.equal(git(repo.dir, 'rev-list', '--count', 'HEAD').trim(), '1');
  } finally {
    repo.cleanup();
  }
});

test('normaliza effort y model opcionales de la tarea', () => {
  const defaults = normalizeTask(baseTask());
  assert.equal(defaults.effort, null);
  assert.equal(defaults.model, null);
  const task = normalizeTask(baseTask({ effort: 'high', model: 'modelo-tarea' }));
  assert.equal(task.effort, 'high');
  assert.equal(task.model, 'modelo-tarea');
  assert.throws(() => normalizeTask(baseTask({ effort: 'ultra' })), /"effort" debe ser none \| low \| medium \| high \| xhigh \| max/);
});

test('usa effort y model de la tarea solo para esa ejecución', async () => {
  const repo = makeRepo();
  try {
    const config = testConfig({ executor: { thinking: 'low', model: 'modelo-config' } });
    const state = await run(repo, {
      task: { effort: 'high', model: 'modelo-tarea' }, config, plan: { implement: GOOD },
    });
    const [call] = repo.calls();
    assert.ok(call.args.includes('modelo-tarea'));
    assert.ok(call.args.includes('high'));
    assert.equal(config.executor.model, 'modelo-config');
    assert.equal(config.executor.thinking, 'low');
  } finally {
    repo.cleanup();
  }
});

test('corrige automáticamente cuando fallan las validaciones', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { plan: { implement: BAD, fix: GOOD } });
    assert.deepEqual(state.attempts.map((a) => a.kind), ['implement', 'fix']);
    assert.equal(state.retriesUsed, 1);
    assert.equal(state.status, 'awaiting_review');
    const fixPrompt = prompt(repo, state, 2);
    assert.match(fixPrompt, /AgentRelay-Phase: fix/);
    assert.match(fixPrompt, /node check.js`: FAILED/);
  } finally {
    repo.cleanup();
  }
});

test('escala al orquestador al agotar los reintentos', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { plan: { implement: BAD, fix: BAD } });
    assert.equal(state.status, 'escalated');
    assert.equal(state.attempts.length, 3); // implementación + 2 correcciones (política por defecto)
    assert.match(state.statusReasons[0], /validaciones/);
  } finally {
    repo.cleanup();
  }
});

test('con review on-failure y sin self-review: aceptación automática si las validaciones pasan', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { config: { policy: { review: 'on-failure', selfReview: { normal: 'none' } } }, plan: { implement: GOOD } });
    assert.equal(state.status, 'accepted');
    assert.equal(state.acceptedBy, 'policy');
    assert.equal(state.selfReview.mode, 'none');
    assert.doesNotMatch(prompt(repo, state, 1), /Self-review before finishing/);
  } finally {
    repo.cleanup();
  }
});

test('con autoFix desactivado: los fallos van al orquestador sin corrección automática', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { config: { policy: { autoFix: false } }, plan: { implement: BAD } });
    assert.equal(state.status, 'awaiting_review');
    assert.equal(state.attempts.length, 1);
  } finally {
    repo.cleanup();
  }
});

test('self-review en pasada separada para tareas complejas', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, {
      task: { complexity: 'complex' },
      plan: { implement: { write: { 'hello.txt': 'hi\n', 'notes.md': 'x\n' } }, 'self-review': {} },
    });
    assert.deepEqual(state.attempts.map((a) => a.kind), ['implement', 'self-review']);
    assert.equal(state.selfReview.pass.run, true);
    const reviewPrompt = prompt(repo, state, 2);
    assert.match(reviewPrompt, /AgentRelay-Phase: self-review/);
    assert.match(reviewPrompt, /\+hi/);
    assert.match(reviewPrompt, /node check.js`: PASSED/);
  } finally {
    repo.cleanup();
  }
});

test('omite la pasada separada cuando es redundante', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { task: { complexity: 'complex' }, plan: { implement: GOOD } });
    assert.deepEqual(state.attempts.map((a) => a.kind), ['implement']);
    assert.equal(state.selfReview.pass.run, false);
    assert.match(state.selfReview.pass.reason, /cubierto por validaciones/);
  } finally {
    repo.cleanup();
  }
});

test('escala sin reintentar cuando el ejecutor está bloqueado', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, { plan: { implement: { report: { status: 'blocked', questions: ['¿Qué formato?'] } } } });
    assert.equal(state.status, 'escalated');
    assert.equal(state.attempts.length, 1);
  } finally {
    repo.cleanup();
  }
});

test('reintenta cuando el ejecutor falla', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, {
      plan: { implement: { finishReason: 'error', exitCode: 1, report: null }, fix: GOOD },
    });
    assert.equal(state.attempts[0].ok, false);
    assert.deepEqual(state.attempts.map((a) => a.kind), ['implement', 'fix']);
    assert.equal(state.status, 'awaiting_review');
  } finally {
    repo.cleanup();
  }
});

test('detecta cambios en archivos protegidos', async () => {
  const repo = makeRepo();
  try {
    const state = await run(repo, {
      task: { doNotModify: ['check.js'] },
      plan: { implement: { write: { 'hello.txt': 'hi\n', 'check.js': 'process.exit(0)\n' } } },
    });
    assert.equal(state.status, 'escalated');
    assert.deepEqual(state.lastCheck.scopeViolations, ['check.js']);
    assert.match(prompt(repo, state, 2), /must not be modified/);
  } finally {
    repo.cleanup();
  }
});

test('rechaza un repositorio con cambios salvo --allow-dirty', async () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo.dir, 'pending.txt'), 'x');
    await assert.rejects(run(repo, { plan: { implement: GOOD } }), /sin confirmar/);
    const state = await run(repo, { plan: { implement: GOOD }, allowDirty: true });
    assert.deepEqual(state.baseline.pendingAtStart, ['?? pending.txt']);
  } finally {
    repo.cleanup();
  }
});

test('revisión: corrección solicitada por el orquestador y aceptación con validación final', async () => {
  const repo = makeRepo();
  try {
    let state = await run(repo, { plan: { implement: GOOD, fix: { write: { 'hello.txt': 'hi\n', 'README.md': 'doc\n' } } } });
    assert.equal(state.status, 'awaiting_review');

    await assert.rejects(applyReview({ root: repo.dir, id: state.id, decision: 'fix' }), /feedback/);
    state = await applyReview({ root: repo.dir, id: state.id, decision: 'fix', feedback: 'Añade un README.md' });
    assert.equal(state.status, 'awaiting_review');
    assert.equal(state.attempts[1].kind, 'fix');
    assert.equal(state.attempts[1].feedback, 'Añade un README.md');
    assert.ok(state.statusReasons.includes('corrección solicitada por el orquestador'));
    assert.match(prompt(repo, state, 2), /Añade un README.md/);

    // La aceptación ejecuta la validación final.
    writeFileSync(path.join(repo.dir, 'hello.txt'), 'roto\n');
    await assert.rejects(applyReview({ root: repo.dir, id: state.id, decision: 'accept' }), /validación final/);
    writeFileSync(path.join(repo.dir, 'hello.txt'), 'hi\n');
    state = await applyReview({ root: repo.dir, id: state.id, decision: 'accept' });
    assert.equal(state.status, 'accepted');
    assert.equal(state.acceptedBy, 'orchestrator');
    await assert.rejects(applyReview({ root: repo.dir, id: state.id, decision: 'reject' }), /cerrada/);
  } finally {
    repo.cleanup();
  }
});

test('revisión: límite de reintentos y escalado', async () => {
  const repo = makeRepo();
  try {
    let state = await run(repo, { config: { policy: { maxRetries: 1, skipPassMaxFiles: 0, selfReview: { normal: 'pass' } } }, plan: { implement: GOOD, 'self-review': {}, fix: GOOD } });
    state = await applyReview({ root: repo.dir, id: state.id, decision: 'fix', feedback: 'Otra vez' });
    await assert.rejects(
      applyReview({ root: repo.dir, id: state.id, decision: 'fix', feedback: 'Y otra' }),
      /máximo de reintentos/,
    );
    state = await applyReview({ root: repo.dir, id: state.id, decision: 'escalate', feedback: 'Lo hago yo' });
    assert.equal(state.status, 'escalated');
  } finally {
    repo.cleanup();
  }
});

test('la revisión registra decisiones de OpenCode con el modelo de la ejecución', async () => {
  const repo = makeRepo();
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-review-'));
  const previousHome = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  try {
    let state = await run(repo, { plan: { implement: GOOD } });
    state.config.executor.type = 'opencode';
    state.config.executor.model = 'vendor/config-free';
    state.attempts[0].model = { id: 'vendor/run-free', provider: null };
    saveState(repo.dir, state);
    state = await applyReview({ root: repo.dir, id: state.id, decision: 'accept' });

    assert.equal(state.status, 'accepted');
    assert.equal(loadChecks(home).reviews['vendor/run-free'].accept, 1);
    assert.equal(loadChecks(home).reviews['vendor/config-free'], undefined);
  } finally {
    if (previousHome === undefined) delete process.env.AGENTRELAY_HOME;
    else process.env.AGENTRELAY_HOME = previousHome;
    repo.cleanup();
    rmSync(home, { recursive: true, force: true });
  }
});

test('la revisión no registra modelos de otros ejecutores', async () => {
  const repo = makeRepo();
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-review-'));
  const previousHome = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  try {
    const state = await run(repo, { plan: { implement: GOOD } });
    await applyReview({ root: repo.dir, id: state.id, decision: 'reject' });
    assert.equal(loadChecks(home).reviews, undefined);
  } finally {
    if (previousHome === undefined) delete process.env.AGENTRELAY_HOME;
    else process.env.AGENTRELAY_HOME = previousHome;
    repo.cleanup();
    rmSync(home, { recursive: true, force: true });
  }
});

test('falla pronto si el ejecutor no está disponible', async () => {
  const repo = makeRepo();
  try {
    await assert.rejects(
      run(repo, { config: { executor: { command: [process.execPath, 'no-existe.mjs'] } }, plan: {} }),
      /no está disponible/,
    );
    assert.equal(existsSync(path.join(repo.dir, '.agentrelay')), false);
  } finally {
    repo.cleanup();
  }
});

test('falla antes de crear una ejecución si el modelo no está disponible', async () => {
  const repo = makeRepo();
  try {
    await assert.rejects(
      run(repo, { config: { executor: { provider: 'deepseek', model: 'deepseek-v4-imposible' } }, plan: { implement: GOOD } }),
      /deepseek-v4-imposible.*agentrelay use cline/,
    );
    assert.deepEqual(listRunIds(repo.dir), []);
    assert.equal(existsSync(path.join(repo.dir, '.agentrelay')), false);

    const state = await run(repo, {
      config: { executor: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
      plan: { implement: GOOD },
    });
    assert.equal(state.status, 'awaiting_review');
    assert.equal(listRunIds(repo.dir).length, 1);
  } finally {
    repo.cleanup();
  }
});

test('registra eventos estructurados en events.ndjson y los emite en orden', async () => {
  const repo = makeRepo();
  try {
    fakePlan(repo, { implement: GOOD });
    const received = [];
    const state = await startRun({
      root: repo.dir,
      task: normalizeTask(baseTask()),
      config: testConfig(),
      onEvent: (event) => received.push(event),
    });

    const events = readEvents(repo.dir, state.id);
    assert.deepEqual(
      events.filter((e) => e.type !== 'activity').map((e) => e.type),
      ['run_start', 'attempt_start', 'attempt_end', 'check_start', 'validation', 'check', 'status'],
    );
    const tool = events.find((e) => e.type === 'activity' && e.kind === 'tool');
    assert.ok(tool);
    assert.equal(tool.detail, './hello.txt');
    assert.equal(received.length, events.length);
  } finally {
    repo.cleanup();
  }
});
