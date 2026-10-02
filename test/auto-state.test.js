import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskSecrets } from '../src/executors/common.js';
import { refreshProjectState } from '../src/project-state.js';
import { makeRepo } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/agentrelay.js', import.meta.url));

test('refreshProjectState escribe el estado, ignora errores y respeta AGENTRELAY_NO_STATE', async () => {
  const repo = makeRepo();
  const previous = process.env.AGENTRELAY_NO_STATE;
  try {
    delete process.env.AGENTRELAY_NO_STATE;
    await refreshProjectState(repo.dir);
    const file = path.join(repo.dir, '.agentrelay', 'ESTADO.md');
    assert.ok(existsSync(file));
    const before = readFileSync(file, 'utf8');
    process.env.AGENTRELAY_NO_STATE = '1';
    await refreshProjectState(repo.dir);
    assert.equal(readFileSync(file, 'utf8'), before);
    await refreshProjectState(path.join(repo.dir, 'no-existe'));
  } finally {
    if (previous === undefined) delete process.env.AGENTRELAY_NO_STATE;
    else process.env.AGENTRELAY_NO_STATE = previous;
    repo.cleanup();
  }
});

test('init actualiza .agentrelay/ESTADO.md y deja limpio el repositorio', () => {
  const repo = makeRepo();
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-auto-state-home-'));
  try {
    const result = spawnSync(process.execPath, [BIN, 'init', '--yes'], {
      cwd: repo.dir, encoding: 'utf8',
      env: {
        ...process.env,
        AGENTRELAY_HOME: home,
        AGENTRELAY_NO_MIGRATE: '1',
        GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(path.join(repo.dir, '.agentrelay', 'ESTADO.md')));
    assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: repo.dir, encoding: 'utf8' }).stdout.trim(), '');
  } finally {
    repo.cleanup();
    rmSync(home, { recursive: true, force: true });
  }
});

test('maskSecrets sustituye claves API visibles y deja intacto el resto', () => {
  assert.equal(maskSecrets('Logged in - sk-proj-***avnwA'), 'Logged in - clave de API');
  assert.equal(maskSecrets('key sk-abcdefghijklmnopqrstuvwxyz'), 'key clave de API');
  assert.equal(maskSecrets('No hay claves'), 'No hay claves');
  assert.equal(maskSecrets('sk-one y sk-proj-***two'), 'clave de API y clave de API');
});
