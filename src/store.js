// Estado de las ejecuciones en <repositorio>/.agentrelay/runs/<id>/.
// El directorio .agentrelay se ignora a sí mismo, así que no aparece en git.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const WORKSPACE_DIR = '.agentrelay';

export function workspaceDir(root) {
  return path.join(root, WORKSPACE_DIR);
}

export function ensureWorkspace(root) {
  const dir = workspaceDir(root);
  mkdirSync(path.join(dir, 'runs'), { recursive: true });
  mkdirSync(path.join(dir, 'tmp'), { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '# Estado local de AgentRelay\n*\n');
  return dir;
}

export function newRunId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

export function runDir(root, id) {
  return path.join(workspaceDir(root), 'runs', id);
}

/** Ruta relativa a la raíz, con "/" en todas las plataformas (para prompts). */
export function relativeRunFile(id, name) {
  return `${WORKSPACE_DIR}/runs/${id}/${name}`;
}

export function createRunDir(root, id) {
  const dir = runDir(root, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeRunFile(root, id, name, content) {
  const file = path.join(runDir(root, id), name);
  writeFileSync(file, content);
  return file;
}

export function saveState(root, state) {
  state.updatedAt = new Date().toISOString();
  writeRunFile(root, state.id, 'state.json', `${JSON.stringify(state, null, 2)}\n`);
}

export function loadState(root, id) {
  const file = path.join(runDir(root, id), 'state.json');
  if (!existsSync(file)) throw new Error(`No existe la ejecución ${id}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function listRunIds(root) {
  const dir = path.join(workspaceDir(root), 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => existsSync(path.join(dir, id, 'state.json')))
    .sort();
}

export function latestRunId(root) {
  const ids = listRunIds(root);
  return ids.length ? ids[ids.length - 1] : null;
}
