import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';
import { connectedProviderIds } from '../src/executors/opencode.js';
import { PROVIDERS } from '../src/free-providers.js';

test('connectedProviderIds identifica la primera columna de opencode auth list', async () => {
  let call;
  const ids = await connectedProviderIds({ command: 'opencode' }, {
    run: async (...args) => {
      call = args;
      return {
        code: 0,
        stdout: 'DeepSeek          DeepSeek                    stored\nOpenCode Console  Personal                    stored\nZ.AI              Z.AI                        stored\n',
        stderr: '',
      };
    },
  });
  assert.deepEqual(call, ['opencode', ['auth', 'list'], { timeoutMs: 60_000 }]);
  assert.deepEqual(ids, ['deepseek', 'opencode', 'zai']);

  assert.deepEqual(await connectedProviderIds({ command: 'opencode' }, {
    run: async () => ({ code: 1, stdout: 'DeepSeek  secret credential', stderr: '' }),
  }), []);
});

test('connectedProviderIds entiende el formato de Linux con viñetas y tipo de credencial', async () => {
  const stdout = '\n┌  Credentials ~/.local/share/opencode/auth.json\n│\n●  OpenCode Go api\n│\n●  OpenCode Zen api\n│\n●  DeepSeek api\n│\n●  Z.AI oauth\n│\n└  4 credentials\n';
  const ids = await connectedProviderIds({ command: 'opencode' }, { run: async () => ({ code: 0, stdout, stderr: '' }) });
  assert.deepEqual(ids.sort(), ['deepseek', 'opencode', 'zai']);
});

test('providers --json muestra conexiones y recomendaciones sin credenciales', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-providers-'));
  try {
    const config = path.join(cwd, 'agentrelay.config.json');
    writeFileSync(config, JSON.stringify({ executor: { type: 'opencode', command: 'missing-opencode-for-test' } }));
    const envNames = [...new Set(PROVIDERS.flatMap(({ env }) => env))];
    const savedEnv = new Map(envNames.map((name) => [name, process.env[name]]));
    for (const name of envNames) process.env[name] = '';
    process.env.MISTRAL_API_KEY = 'api-secret-value';
    const savedSettings = new Map(['AGENTRELAY_HOME', 'AGENTRELAY_NO_MIGRATE', 'AGENTRELAY_NO_STATE']
      .map((name) => [name, process.env[name]]));
    process.env.AGENTRELAY_HOME = path.join(cwd, 'home');
    process.env.AGENTRELAY_NO_MIGRATE = '1';
    process.env.AGENTRELAY_NO_STATE = '1';
    let output = '';
    const write = process.stdout.write;
    let exitCode;
    try {
      process.stdout.write = (chunk, ...rest) => (typeof chunk === 'string' ? ((output += chunk), true) : write.call(process.stdout, chunk, ...rest));
      exitCode = await main(['--cwd', cwd, 'providers', '--json', '--config', config]);
    } finally {
      process.stdout.write = write;
      for (const [name, value] of [...savedEnv, ...savedSettings]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    assert.equal(exitCode, 0);
    const providers = JSON.parse(output);
    assert.equal(providers.length, PROVIDERS.length);
    assert.equal(providers.find(({ id }) => id === 'opencode').connection.command, 'agentrelay login opencode');
    assert.equal(providers.find(({ id }) => id === 'deepseek').status, 'no conectado');
    assert.equal(providers.find(({ id }) => id === 'zai').connected, false);
    assert.equal(providers.find(({ id }) => id === 'mistral').connected, true);
    assert.equal(providers.find(({ id }) => id === 'mistral').freeTier, true);
    assert.equal(providers.find(({ id }) => id === 'zai').freeTier, false);
    assert.equal(providers.find(({ id }) => id === 'mistral').dataNotice, 'política de datos sin verificar');
    assert.equal(providers.find(({ id }) => id === 'openrouter').connection.env[0], 'OPENROUTER_API_KEY');
    assert.equal(providers.find(({ id }) => id === 'openrouter').connection.signupUrl, 'https://openrouter.ai/settings/keys');
    assert.doesNotMatch(output, /api-secret-value|stored/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
