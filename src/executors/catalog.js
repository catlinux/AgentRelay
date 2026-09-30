// Catálogo de ejecutores e instalación de los opcionales.
//
// Codex viene incluido con AgentRelay (dependencia npm). Los demás se instalan
// bajo demanda en una carpeta del usuario (~/.agentrelay/executors), nunca en la
// carpeta de AgentRelay: así sobreviven a git pull / npm ci y no la ensucian.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../proc.js';
import { commandParts as clineCommandParts } from './cline.js';

/** Carpeta de los ejecutores opcionales (AGENTRELAY_EXECUTORS_DIR la sustituye). */
export function executorsDir(env = process.env, home = os.homedir()) {
  return env.AGENTRELAY_EXECUTORS_DIR || path.join(home, '.agentrelay', 'executors');
}

export const CATALOG = [
  {
    name: 'codex',
    title: 'Codex (OpenAI)',
    description: 'Por defecto. Usa tu cuenta de ChatGPT, sin clave de API; GPT-6 Luna está incluido en el plan gratuito.',
    bundled: true,
    npmPackage: null,
    connect: 'agentrelay login',
  },
  {
    name: 'cline',
    title: 'Cline',
    description: 'Con cualquier proveedor que Cline soporte (p. ej. DeepSeek con clave de API).',
    bundled: false,
    // Sin "^": proc.js rechaza ese carácter en Windows (metacarácter de cmd.exe).
    npmPackage: 'cline@3',
    connect: 'npx --prefix <executorsDir> cline auth --provider deepseek --apikey TU_CLAVE --modelid deepseek-v4-pro',
  },
];

export function getCatalogEntry(name, dir = executorsDir()) {
  const entry = CATALOG.find((item) => item.name === name);
  return entry ? { ...entry, connect: entry.connect?.replace('<executorsDir>', dir) ?? null } : null;
}

export async function isInstalled(name, options = {}) {
  const entry = getCatalogEntry(name, options.dir || executorsDir(options.env, options.home));
  if (!entry) throw new Error(`Ejecutor desconocido: ${name}`);
  if (entry.bundled) return true;
  const dir = options.dir || executorsDir(options.env, options.home);
  const parts = clineCommandParts('cline', { executorsDir: dir, exists: options.exists || existsSync });
  const candidate = parts.length > 1 && parts[0] === process.execPath ? parts[1] : parts[0];
  return (options.exists || existsSync)(candidate);
}

export async function installExecutor(name, { dir = executorsDir(), run = runProcess, out = () => {} } = {}) {
  const entry = getCatalogEntry(name, dir);
  if (!entry) throw new Error(`Ejecutor desconocido: ${name}`);
  if (entry.bundled) throw new Error(`${entry.title} ya viene incluido con AgentRelay.`);

  mkdirSync(dir, { recursive: true });
  const packageJson = path.join(dir, 'package.json');
  if (!existsSync(packageJson)) {
    writeFileSync(packageJson, `${JSON.stringify({ name: 'agentrelay-executors', private: true }, null, 2)}\n`);
  }
  const args = ['install', '--prefix', dir, '--no-audit', '--no-fund', entry.npmPackage];
  const result = await run('npm', args, { cwd: dir, timeoutMs: 10 * 60 * 1000 });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.code !== 0 || result.error || result.timedOut) {
    return { ok: false, error: result.error?.message || (result.timedOut ? 'La instalación superó el tiempo máximo.' : `npm terminó con código ${result.code}`), output };
  }
  return { ok: true, error: null, output };
}
