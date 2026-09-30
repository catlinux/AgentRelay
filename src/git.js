// Operaciones Git sobre el repositorio de trabajo.
// AgentRelay solo confirma CLAUDE.md (vía `init`) y nunca hace stash, checkout ni push.

import { copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runProcess } from './proc.js';

// Hash del árbol vacío de Git: línea base de un repositorio sin commits.
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function git(cwd, args, { env, allowFail = false } = {}) {
  const res = await runProcess('git', args, { cwd, env, windowsShell: false, timeoutMs: 120_000 });
  if (res.error) throw new Error(`No se puede ejecutar git: ${res.error.message}`);
  if (res.code !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} ha fallado: ${res.stderr.trim()}`);
  }
  return res;
}

export async function repoRoot(cwd) {
  const res = await git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  return res.code === 0 ? path.resolve(res.stdout.trim()) : null;
}

export async function head(cwd) {
  const res = await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
  return res.code === 0 ? res.stdout.trim() : null;
}

/** Cambios pendientes (incluye archivos sin seguimiento no ignorados). */
export async function pendingChanges(cwd) {
  const res = await git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/**
 * Compara el árbol de trabajo actual con la línea base, incluidos los archivos
 * nuevos. Usa un índice temporal para no modificar el índice real.
 */
export async function diffFromBase(cwd, base, tmpDir) {
  const tmpIndex = path.join(tmpDir, `index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: tmpIndex };
  try {
    const realIndex = path.resolve(cwd, (await git(cwd, ['rev-parse', '--git-path', 'index'])).stdout.trim());
    if (existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);
    else await git(cwd, ['read-tree', '--empty'], { env });

    await git(cwd, ['add', '-A'], { env });
    const target = base || EMPTY_TREE;
    const names = await git(cwd, ['diff', '--cached', '--name-status', '--no-renames', target], { env });
    const patch = await git(cwd, ['diff', '--cached', '--no-renames', '--no-color', target], { env });

    const files = names.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t');
        return { status, path: rest.join('\t') };
      });
    return { files, patch: patch.stdout };
  } finally {
    rmSync(tmpIndex, { force: true });
  }
}

/** true si el repositorio está limpio (git status sin salida). */
export async function isClean(cwd) {
  const res = await git(cwd, ['status', '--porcelain', '--untracked-files=all']);
  return res.stdout.trim() === '';
}

/** true si git ignora el archivo indicado. */
export async function isIgnored(cwd, file) {
  const res = await git(cwd, ['check-ignore', '-q', '--', file], { allowFail: true });
  return res.code === 0;
}

/** Añade y confirma solo las rutas indicadas; devuelve { ok, error } sin lanzar. */
export async function commitPaths(cwd, paths, message) {
  try {
    const addRes = await git(cwd, ['add', '--', ...paths], { allowFail: true });
    if (addRes.code !== 0) return { ok: false, error: addRes.stderr.trim() };
    const commitRes = await git(cwd, ['commit', '-m', message, '--', ...paths], { allowFail: true });
    if (commitRes.code !== 0) return { ok: false, error: commitRes.stderr.trim() };
    return { ok: true, error: '' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
