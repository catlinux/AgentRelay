// Catálogo de ejecutores e instalación de los opcionales.
//
// Codex viene incluido con AgentRelay (dependencia npm). Los demás se instalan
// bajo demanda en una carpeta del usuario (~/.agentrelay/executors), nunca en la
// carpeta de AgentRelay: así sobreviven a git pull / npm ci y no la ensucian.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../proc.js';

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
    cost: 'cuenta de ChatGPT',
    npmPackage: null,
    connect: 'agentrelay login',
  },
  {
    name: 'opencode',
    title: 'OpenCode',
    description: 'Con los modelos gratuitos de OpenCode (p. ej. opencode/nemotron-3-ultra-free).',
    bundled: false,
    cost: 'gratis',
    // Sin "^": proc.js rechaza ese carácter en Windows (metacarácter de cmd.exe).
    npmPackage: 'opencode-ai@1',
    connect: 'agentrelay login opencode',
  },
];

export function getCatalogEntry(name, dir = executorsDir()) {
  const entry = CATALOG.find((item) => item.name === name);
  return entry ? { ...entry, connect: entry.connect?.replace('<executorsDir>', dir) ?? null } : null;
}

/** Busca un ejecutable en el PATH (para ejecutores instalados fuera de AgentRelay). */
function findOnPath(command, { env = process.env, exists = existsSync, platform = process.platform } = {}) {
  const pathValue = env.PATH || env.Path || '';
  const names = platform === 'win32' ? [`${command}.exe`, `${command}.cmd`, command] : [command];
  for (const dir of String(pathValue).split(path.delimiter)) {
    if (!dir) continue;
    for (const fileName of names) {
      const candidate = path.join(dir, fileName);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

export async function isInstalled(name, options = {}) {
  const entry = getCatalogEntry(name, options.dir || executorsDir(options.env, options.home));
  if (!entry) throw new Error(`Ejecutor desconocido: ${name}`);
  if (entry.bundled) return true;
  // OpenCode puede estar instalado en la carpeta gestionada o en el PATH.
  if (!entry.npmPackage) return Boolean(findOnPath(entry.name, options));
  const dir = options.dir || executorsDir(options.env, options.home);
  if (name === 'opencode') {
    const link = path.join(dir, 'node_modules', '.bin', `opencode${(options.platform || process.platform) === 'win32' ? '.cmd' : ''}`);
    if ((options.exists || existsSync)(link)) return true;
    return Boolean(findOnPath(entry.name, options));
  }
  return false;
}

export async function installExecutor(name, { dir = executorsDir(), run = runProcess, out = () => {} } = {}) {
  const entry = getCatalogEntry(name, dir);
  if (!entry) throw new Error(`Ejecutor desconocido: ${name}`);
  if (entry.bundled) throw new Error(`${entry.title} ya viene incluido con AgentRelay.`);
  if (!entry.npmPackage) throw new Error(`${entry.title} no se instala con AgentRelay; instálalo aparte en el PATH (${entry.connect}).`);

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
