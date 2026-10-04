import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookDecision } from '../src/hook.js';

const now = 1_800_000_000_000;
const event = (tool_name = 'Edit', session_id = 'session-1') => JSON.stringify({
  session_id, cwd: '/project', tool_name, tool_input: { file_path: '/project/file.js' },
});

function decide(input, marker = null, agentRelay = true) {
  const writes = [];
  const result = hookDecision({
    input, now,
    readMarker: () => marker,
    writeMarker: (...args) => writes.push(args),
    usesAgentRelay: () => agentRelay,
  });
  return { result, writes };
}

test('hookDecision: recuerda una edición en un proyecto AgentRelay', () => {
  const { result, writes } = decide(event());
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(result.hookSpecificOutput.additionalContext, /agentrelay run/);
  assert.deepEqual(writes, [['session-1', now]]);
});

test('hookDecision: omite herramientas ajenas a edición y proyectos sin AgentRelay', () => {
  assert.equal(decide(event('Read')).result, null);
  assert.equal(decide(event(), null, false).result, null);
});

test('hookDecision: limita el recordatorio a uno cada 15 minutos por sesión', () => {
  assert.equal(decide(event(), String(now - 14 * 60 * 1000)).result, null);
  const afterInterval = hookDecision({
    input: event(), now,
    readMarker: () => String(now - 15 * 60 * 1000),
    writeMarker() {}, usesAgentRelay: () => true,
  });
  assert.ok(afterInterval);
});

test('hookDecision: trata entrada vacía, JSON inválido y excepciones como no-op', () => {
  assert.equal(decide('').result, null);
  assert.equal(decide('{').result, null);
  assert.equal(hookDecision({ input: event(), now, readMarker() { throw Error(); }, writeMarker() {}, usesAgentRelay: () => true }), null);
});

test('hookDecision: sanea el identificador de sesión', () => {
  const { writes } = decide(event('Edit', '../a b'));
  assert.equal(writes[0][0], '___a_b');
});
