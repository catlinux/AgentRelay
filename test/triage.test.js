import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advise, appendRecord, executorIndex, executorKey, normalizeLabel, orchestratorIndex, readRecords, validateLabel } from '../src/triage.js';
import { main } from '../src/cli.js';
import { createRunDir, saveState } from '../src/store.js';
import { makeRepo } from './helpers.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'agentrelay-triage-'));
const rec = (outcome, effort = 'medium', extra = {}) => ({ v: 1, kind: 'orchestrator', type: 'implementation', size: 'normal', model: 'sonnet', effort, outcome, ts: '2026-01-01T00:00:00.000Z', ...extra });

test('normaliza alias en español e inglés y valida campos', () => {
  assert.equal(normalizeLabel('type', ' IMPLEMENTACIÓN '), 'implementation');
  assert.equal(normalizeLabel('size', 'pequeña'), 'small');
  assert.equal(normalizeLabel('effort', 'extreme'), 'xhigh');
  assert.equal(normalizeLabel('outcome', 'sobró'), 'over');
  assert.throws(() => validateLabel('type', 'X'), /Valores válidos/);
});

test('priors cubren todos los tipos y tamaños', () => {
  for (const type of ['query', 'mechanical', 'docs', 'implementation', 'debugging', 'design', 'review']) {
    for (const size of ['small', 'normal', 'large']) {
      const a = advise([], { type, size });
      assert.ok(orchestratorIndex(a.step.model, a.step.effort) >= 0);
      assert.equal(a.samples, 0);
      assert.equal(a.confidence, 'baja');
    }
  }
});

test('under eleva un escalón y las buenas elecciones permiten explorar a la baja', () => {
  assert.deepEqual(advise([rec('under')], { type: 'implementation', size: 'normal' }).step, { model: 'sonnet', effort: 'high' });
  const three = [rec('ok'), rec('ok', 'medium', { ts: '2026-01-02' }), rec('ok', 'medium', { ts: '2026-01-03' })];
  const advice = advise(three, { type: 'implementation', size: 'normal' });
  assert.deepEqual(advice.step, { model: 'sonnet', effort: 'low' });
  assert.equal(advice.exploring, true);
  assert.match(advice.reason, /prueba un escalón más barato/);
  const twoOver = advise([rec('ok'), rec('over', 'medium', { ts: '2026-01-02' })], { type: 'implementation', size: 'normal' });
  assert.equal(twoOver.exploring, true);
});

test('amplía muestra al tipo, limita escaleras y calcula confianza', () => {
  const few = [rec('ok', 'low', { size: 'small' }), rec('ok', 'low', { size: 'large', ts: '2026-01-02' })];
  assert.equal(advise(few, { type: 'implementation', size: 'normal' }).samples, 2);
  const raised = advise([rec('under', 'xhigh', { model: 'opus' })], { type: 'implementation', size: 'normal' });
  assert.equal(orchestratorIndex(raised.step.model, raised.step.effort), 10);
  assert.equal(advise(Array.from({ length: 3 }, (_, i) => rec('ok', 'medium', { ts: `2026-01-0${i + 1}` })), { type: 'implementation', size: 'normal' }).confidence, 'media');
  assert.equal(advise(Array.from({ length: 8 }, (_, i) => rec('ok', 'medium', { ts: `2026-02-${String(i + 1).padStart(2, '0')}` })), { type: 'implementation', size: 'normal' }).confidence, 'alta');
  const executor = advise([{ ...rec('under'), kind: 'executor', executor: 'codex', model: 'gpt-6-luna', effort: 'high', level: 5 }], { kind: 'executor', executor: 'codex', model: 'gpt-6-luna', type: 'implementation', size: 'normal' });
  assert.equal(executor.step.effort, 'xhigh');
  assert.equal(executor.step.level, 5);
  assert.equal(executorIndex('low'), 0);
  assert.equal(executorKey(' Codex ', ' GPT-6-Luna '), 'codex|gpt-6-luna');
});

test('almacena registros y omite líneas corruptas', () => {
  const home = tmp();
  try {
    const file = path.join(home, 'triage.jsonl');
    appendRecord(rec('ok'), file);
    appendFileSync(file, 'esto no es JSON\n');
    assert.equal(readRecords(file).length, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

async function cli(args) {
  let stdout = '', stderr = '';
  const oldOut = process.stdout.write, oldErr = process.stderr.write;
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  try { return { code: await main(args), stdout, stderr }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

test('CLI record, advise, stats y derive datos del run', async () => {
  const home = tmp(), prev = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  try {
    let result = await cli(['triage', 'stats']);
    assert.match(result.stdout, /Sin datos todavía/);
    result = await cli(['triage', 'advise', '--type', 'implementation', '--size', 'normal']);
    assert.match(result.stdout, /sonnet · esfuerzo medio/);
    result = await cli(['triage', 'record', '--type', 'implementation', '--size', 'normal', '--model', 'sonnet', '--effort', 'medium', '--outcome', 'under']);
    assert.match(result.stdout, /Anotado:/);
    result = await cli(['triage', 'stats']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /implementación|implementation/);
    result = await cli(['triage', 'advise', '--type', 'implementation', '--size', 'normal', '--json']);
    assert.equal(JSON.parse(result.stdout).step.effort, 'high');
    result = await cli(['triage', 'advise', '--type', 'implementation', '--size', 'normal', '--model', 'opus', '--effort', 'high', '--json']);
    assert.equal(JSON.parse(result.stdout).comparison, 'down');
    result = await cli(['triage', 'advise', '--type', 'implementation', '--size', 'normal', '--model', 'sonnet', '--effort', 'medium', '--json']);
    assert.equal(JSON.parse(result.stdout).comparison, 'up');
    result = await cli(['triage', 'advise', '--type', 'implementation', '--size', 'normal', '--model', 'sonnet', '--effort', 'high', '--json']);
    assert.equal(JSON.parse(result.stdout).comparison, 'keep');
    result = await cli(['triage', 'record', '--type', 'bad', '--size', 'normal', '--model', 'sonnet', '--effort', 'medium', '--outcome', 'ok']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Valores válidos/);

    const repo = makeRepo();
    try {
      createRunDir(repo.dir, 'fake-run');
      saveState(repo.dir, { id: 'fake-run', status: 'accepted', task: { type: 'feature', complexity: 'normal' }, config: { executor: { type: 'cline', model: 'configured-model', thinking: null } }, policy: { level: 3 }, attempts: [{ kind: 'implement', model: { provider: 'deepseek', id: 'deepseek-v4-flash' } }], retriesUsed: 0, lastCheck: { validations: [{ passed: true }] } });
      result = await cli(['triage', 'record', '--kind', 'executor', '--run', 'fake-run', '--cwd', repo.dir]);
      assert.equal(result.code, 0, result.stderr);
      const last = readRecords(path.join(home, 'triage.jsonl')).at(-1);
      assert.equal(last.outcome, 'ok');
      assert.equal(last.executor, 'cline');
      assert.equal(last.model, 'deepseek-v4-flash');
      assert.deepEqual(last.signals, ['intentos:1', 'reintentos:0']);
      saveState(repo.dir, { id: 'fake-run', status: 'accepted', task: { type: 'feature', complexity: 'normal' }, config: { executor: { thinking: null } }, policy: { level: 3 }, attempts: [{ kind: 'implement' }, { kind: 'fix' }], retriesUsed: 1, lastCheck: { validations: [{ passed: true }] } });
      result = await cli(['triage', 'record', '--kind', 'executor', '--run', 'fake-run', '--cwd', repo.dir]);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(readRecords(path.join(home, 'triage.jsonl')).at(-1).outcome, 'under');
    } finally { repo.cleanup(); }
  } finally { if (prev === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = prev; rmSync(home, { recursive: true, force: true }); }
});

test('executor triage aísla executor y modelo, admite legado y agrupa stats', async () => {
  const home = tmp(), repo = makeRepo(), prev = process.env.AGENTRELAY_HOME;
  process.env.AGENTRELAY_HOME = home;
  try {
    writeFileSync(path.join(repo.dir, 'agentrelay.config.json'), JSON.stringify({ executor: { type: 'codex', model: 'gpt-6-luna' } }));
    let result = await cli(['triage', 'record', '--kind', 'executor', '--type', 'implementation', '--size', 'normal', '--effort', 'medium', '--outcome', 'ok', '--cwd', repo.dir]);
    assert.equal(result.code, 0, result.stderr);
    let stored = readRecords(path.join(home, 'triage.jsonl')).at(-1);
    assert.equal(stored.executor, 'codex');
    assert.equal(stored.model, 'gpt-6-luna');

    for (let i = 0; i < 2; i++) {
      result = await cli(['triage', 'record', '--kind', 'executor', '--executor', ' CODEx ', '--model', ' GPT-6-Luna ', '--type', 'implementation', '--size', 'normal', '--effort', 'medium', '--outcome', 'ok', '--cwd', repo.dir]);
      assert.equal(result.code, 0, result.stderr);
    }
    stored = readRecords(path.join(home, 'triage.jsonl')).at(-1);
    assert.equal(stored.executor, 'CODEx');
    assert.equal(stored.model, 'GPT-6-Luna');
    const another = Array.from({ length: 3 }, (_, i) => ({ ...stored, id: `cline-${i}`, executor: 'cline', model: 'deepseek-v4-flash', effort: 'high', outcome: 'under', ts: `2026-01-0${i + 1}` }));
    const legacy = { ...stored, id: 'legacy', executor: undefined, model: undefined, effort: 'high', outcome: 'under', ts: '2027-02-01' };
    const file = path.join(home, 'triage.jsonl');
    for (const record of [...another, legacy]) appendRecord(record, file);
    const records = readRecords(file);
    const codex = advise(records, { kind: 'executor', executor: 'codex', model: 'gpt-6-luna', type: 'implementation', size: 'normal' });
    assert.equal(codex.step.effort, 'low');
    assert.equal(codex.samples, 3);
    const cline = advise(records, { kind: 'executor', executor: 'cline', model: 'deepseek-v4-flash', type: 'implementation', size: 'normal' });
    assert.equal(cline.step.effort, 'xhigh');
    const empty = advise(records, { kind: 'executor', executor: 'other', model: 'model-x', type: 'implementation', size: 'normal' });
    assert.match(empty.reason, /Sin datos para other · model-x: valor inicial/);
    const withLegacy = advise(records, { kind: 'executor', executor: 'codex', model: 'gpt-6-luna', type: 'implementation', size: 'normal', includeLegacy: true });
    assert.equal(withLegacy.step.effort, 'xhigh');

    result = await cli(['triage', 'advise', '--kind', 'executor', '--executor', 'codex', '--model', 'gpt-6-luna', '--type', 'implementation', '--size', 'normal', '--json', '--cwd', repo.dir]);
    const json = JSON.parse(result.stdout);
    assert.equal(json.executor, 'codex');
    assert.equal(json.model, 'gpt-6-luna');
    assert.equal(json.step.effort, 'low');
    result = await cli(['triage', 'advise', '--kind', 'executor', '--executor', 'other', '--model', 'model-x', '--type', 'implementation', '--size', 'normal', '--cwd', repo.dir]);
    assert.match(result.stdout, /^Ejecutor: other · model-x/m);
    assert.match(result.stdout, /Sin datos para other · model-x: valor inicial/);
    result = await cli(['triage', 'advise', '--kind', 'executor', '--executor', 'codex', '--model', 'gpt-6-luna', '--type', 'implementation', '--size', 'normal', '--include-legacy', '--json', '--cwd', repo.dir]);
    assert.equal(JSON.parse(result.stdout).step.effort, 'xhigh');
    result = await cli(['triage', 'stats', '--kind', 'executor', '--json', '--cwd', repo.dir]);
    const groups = JSON.parse(result.stdout).groups;
    assert.ok(groups.some((g) => g.executor === 'codex' && g.model === 'gpt-6-luna'));
    assert.ok(groups.some((g) => g.executor === 'cline' && g.model === 'deepseek-v4-flash'));
    assert.ok(groups.some((g) => g.executor === 'sin ejecutor (antiguo)'));
    result = await cli(['triage', 'stats', '--kind', 'executor', '--cwd', repo.dir]);
    assert.match(result.stdout, /sin ejecutor \(antiguo\)/);
    assert.match(result.stdout, /codex · gpt-6-luna/);
  } finally {
    if (prev === undefined) delete process.env.AGENTRELAY_HOME; else process.env.AGENTRELAY_HOME = prev;
    rmSync(home, { recursive: true, force: true });
    repo.cleanup();
  }
});
