import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MATCHER = 'Edit|Write|MultiEdit';

export function hookCommand(platform = process.platform) {
  return platform === 'win32' ? 'agentrelay.cmd hook' : 'agentrelay hook';
}

function parseSettings(claudeDir) {
  const file = path.join(claudeDir, 'settings.json');
  if (!existsSync(file)) return { file, settings: {}, newline: '\n', exists: false };
  const text = readFileSync(file, 'utf8');
  let settings;
  try { settings = JSON.parse(text); } catch { return { file, invalid: true }; }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { file, invalid: true };
  return { file, settings, newline: text.includes('\r\n') ? '\r\n' : '\n', exists: true };
}

function isAgentRelay(entry) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((hook) => typeof hook?.command === 'string'
    && /^(?:agentrelay|agentrelay\.cmd)(?:\s+.*)?\s+hook$/.test(hook.command));
}

function desiredEntry(platform) {
  return { matcher: MATCHER, hooks: [{ type: 'command', command: hookCommand(platform) }] };
}

export function hookStatus(claudeDir) {
  const parsed = parseSettings(claudeDir);
  if (parsed.invalid) return 'invalid';
  const entries = parsed.settings.hooks?.PreToolUse;
  if (!Array.isArray(entries)) return 'missing';
  const own = entries.find(isAgentRelay);
  if (!own) return 'missing';
  const equivalent = [hookCommand('win32'), hookCommand('linux')];
  return own.matcher === MATCHER && Array.isArray(own.hooks) && own.hooks.length === 1
    && own.hooks[0]?.type === 'command' && equivalent.includes(own.hooks[0]?.command) ? 'current' : 'outdated';
}

function writeSettings(parsed) {
  mkdirSync(path.dirname(parsed.file), { recursive: true });
  writeFileSync(parsed.file, `${JSON.stringify(parsed.settings, null, 2).replace(/\n/g, parsed.newline)}${parsed.newline}`, 'utf8');
}

export function installHook(claudeDir) {
  const parsed = parseSettings(claudeDir);
  if (parsed.invalid) return { action: 'skipped', reason: 'settings.json no contiene JSON válido; no se ha modificado.' };
  const hadFile = parsed.exists;
  parsed.settings.hooks ??= {};
  if (!parsed.settings.hooks || typeof parsed.settings.hooks !== 'object' || Array.isArray(parsed.settings.hooks)) {
    return { action: 'skipped', reason: 'La clave hooks de settings.json no es un objeto; no se ha modificado.' };
  }
  parsed.settings.hooks.PreToolUse ??= [];
  if (!Array.isArray(parsed.settings.hooks.PreToolUse)) return { action: 'skipped', reason: 'La clave hooks.PreToolUse de settings.json no es una lista; no se ha modificado.' };
  const entries = parsed.settings.hooks.PreToolUse;
  const index = entries.findIndex(isAgentRelay);
  if (index >= 0) {
    const desired = desiredEntry(process.platform);
    if (JSON.stringify(entries[index]) === JSON.stringify(desired)) return { action: 'unchanged' };
    entries[index] = desired;
    writeSettings(parsed);
    return { action: 'updated' };
  }
  entries.push(desiredEntry(process.platform));
  writeSettings(parsed);
  return { action: hadFile ? 'added' : 'created' };
}

export function removeHook(claudeDir) {
  const parsed = parseSettings(claudeDir);
  if (parsed.invalid) return { removed: false };
  const entries = parsed.settings.hooks?.PreToolUse;
  if (!Array.isArray(entries)) return { removed: false };
  const remaining = entries.filter((entry) => !isAgentRelay(entry));
  if (remaining.length === entries.length) return { removed: false };
  if (remaining.length) parsed.settings.hooks.PreToolUse = remaining;
  else delete parsed.settings.hooks.PreToolUse;
  if (Object.keys(parsed.settings.hooks).length === 0) delete parsed.settings.hooks;
  writeSettings(parsed);
  return { removed: true };
}
