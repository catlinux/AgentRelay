import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANAGED_MARK = '<!-- agentrelay:managed -->';

// Comandos de versiones anteriores que ya no existen (los sustituye /ar:usar).
// Se retiran del equipo del usuario, pero solo si llevan la marca de AgentRelay.
export const RETIRED_COMMANDS = ['modelo.md', 'esfuerzo.md', 'ejecutor.md', 'nivel.md', 'triaje.md'];

export function commandsSourceDir() {
  return fileURLToPath(new URL('../assets/claude-commands/ar/', import.meta.url));
}

export function commandsTargetDir(claudeDir) {
  return path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'commands', 'ar');
}

export function legacyCommandsDir(claudeDir) {
  return path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'commands', 'agentrelay');
}

export function listCommands(sourceDir = commandsSourceDir()) {
  const files = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) throw new Error(`No se encontraron comandos .md en ${sourceDir}.`);
  return files.map((file) => ({ name: file, content: readFileSync(path.join(sourceDir, file), 'utf8') }));
}

const normalize = (text) => text.replace(/\r\n/g, '\n');

// Nombres que AgentRelay puede haber instalado: los actuales y los retirados.
function knownNames(sourceDir) {
  return [...new Set([...listCommands(sourceDir).map(({ name }) => name), ...RETIRED_COMMANDS])];
}

export function commandsStatus(claudeDir, sourceDir = commandsSourceDir()) {
  const targetDir = commandsTargetDir(claudeDir);
  const details = listCommands(sourceDir).map(({ name, content }) => {
    const target = path.join(targetDir, name);
    if (!existsSync(target)) return { name, state: 'missing' };
    const existing = readFileSync(target, 'utf8');
    if (!existing.includes(MANAGED_MARK)) return { name, state: 'foreign' };
    return { name, state: normalize(existing) === normalize(content) ? 'current' : 'outdated' };
  });
  const managed = details.filter(({ state }) => state === 'current' || state === 'outdated').length;
  const status = managed === 0 ? 'missing'
    : details.some(({ state }) => state === 'outdated' || state === 'missing') ? 'outdated' : 'current';
  return { status, details };
}

export function installCommands(claudeDir, sourceDir = commandsSourceDir()) {
  const targetDir = commandsTargetDir(claudeDir);
  const result = { created: [], updated: [], unchanged: [], skipped: [], retired: [] };
  mkdirSync(targetDir, { recursive: true });
  for (const { name, content } of listCommands(sourceDir)) {
    const target = path.join(targetDir, name);
    const existed = existsSync(target);
    if (existed) {
      const existing = readFileSync(target, 'utf8');
      if (!existing.includes(MANAGED_MARK)) { result.skipped.push(name); continue; }
      if (normalize(existing) === normalize(content)) { result.unchanged.push(name); continue; }
    }
    const temp = path.join(targetDir, `.${name}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
      writeFileSync(temp, normalize(content), 'utf8');
      renameSync(temp, target);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
    result[existed ? 'updated' : 'created'].push(name);
  }
  const current = listCommands(sourceDir).map(({ name }) => name);
  for (const name of RETIRED_COMMANDS.filter((item) => !current.includes(item))) {
    const target = path.join(targetDir, name);
    if (!existsSync(target) || !readFileSync(target, 'utf8').includes(MANAGED_MARK)) continue;
    rmSync(target);
    result.retired.push(name);
  }
  return result;
}

export function removeCommands(claudeDir, sourceDir = commandsSourceDir()) {
  const targetDir = commandsTargetDir(claudeDir);
  const result = { removed: [], kept: [] };
  if (!existsSync(targetDir)) return result;
  for (const name of knownNames(sourceDir)) {
    const target = path.join(targetDir, name);
    if (!existsSync(target)) continue;
    if (readFileSync(target, 'utf8').includes(MANAGED_MARK)) {
      rmSync(target);
      result.removed.push(name);
    } else result.kept.push(name);
  }
  if (readdirSync(targetDir).length === 0) rmdirSync(targetDir);
  return result;
}

export function removeLegacyCommands(claudeDir, sourceDir = commandsSourceDir()) {
  const targetDir = legacyCommandsDir(claudeDir);
  const result = { removed: [] };
  if (!existsSync(targetDir)) return result;
  for (const name of knownNames(sourceDir)) {
    const target = path.join(targetDir, name);
    if (!existsSync(target) || !readFileSync(target, 'utf8').includes(MANAGED_MARK)) continue;
    rmSync(target);
    result.removed.push(name);
  }
  if (readdirSync(targetDir).length === 0) rmdirSync(targetDir);
  return result;
}

export function legacyCommandsStatus(claudeDir, sourceDir = commandsSourceDir()) {
  const targetDir = legacyCommandsDir(claudeDir);
  if (!existsSync(targetDir)) return [];
  return knownNames(sourceDir).filter((name) => {
    const target = path.join(targetDir, name);
    return existsSync(target) && readFileSync(target, 'utf8').includes(MANAGED_MARK);
  });
}
