// Preparación de un directorio que todavía no es un repositorio git:
// plan, escaneo de archivos sensibles y creación del repositorio inicial.

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initRepository } from './git.js';
import { confirm } from './prompt.js';

// .gitignore inicial para no confirmar secretos. Se usa solo si no hay uno.
export const DEFAULT_GITIGNORE = [
  '# Creado por AgentRelay para no confirmar secretos en el repositorio.',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa*',
  'id_ed25519*',
  'credentials.json',
  'secrets.json',
  'wp-config.php',
  '.htpasswd',
  'node_modules/',
  '.agentrelay/',
  'agentrelay.config.json',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
].join('\n') + '\n';

// Nombres de archivo que parecen contener secretos.
export const SENSITIVE_PATTERNS = [
  /^\.env(\..*)?$/,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|ecdsa|ed25519)/,
  /^(credentials|secrets)\.json$/i,
  /^(wp-config\.php|\.htpasswd)$/i,
];

// Directorios que se ignoran al escanear.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.agentrelay']);

/** Recorre `dir` sin seguir enlaces simbólicos ni entrar en .git/node_modules/.agentrelay. */
export function scanFolder(dir, { limit = 5000 } = {}) {
  const sensitive = [];
  const sample = [];
  let count = 0;
  let truncated = false;

  const walk = (current) => {
    if (truncated) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (count >= limit) {
        truncated = true;
        return;
      }
      count += 1;
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (SENSITIVE_PATTERNS.some((re) => re.test(entry.name))) sensitive.push(rel);
      if (sample.length < 15) sample.push(rel);
    }
  };

  walk(dir);
  return { count, sensitive, sample, truncated };
}

/** true si la ruta absoluta parece un directorio servido públicamente por un servidor web. */
export function looksPublic(dir) {
  const normalized = path.resolve(dir).replace(/\\/g, '/');
  return /(^|\/)(var\/www|srv\/www|public_html|htdocs|wwwroot|inetpub)(\/|$)/i.test(normalized);
}

/** Explica en español qué hará `init` en un directorio sin repositorio. */
export function describePlan(dir, scan, { hasGitignore, public: isPublic }) {
  // Con un .gitignore nuevo, los archivos sensibles no entrarán en el commit.
  const excluded = hasGitignore ? new Set() : new Set(scan.sensitive);
  const included = scan.sample.filter((file) => !excluded.has(file));
  const lines = [
    `La carpeta ${dir} no es un repositorio git. Se hará:`,
    'git init',
    hasGitignore ? 'Se respetará el .gitignore existente y se añadirá agentrelay.config.json' : 'Crear .gitignore con patrones de secretos y agentrelay.config.json',
    `Crear un primer commit con ${scan.count - excluded.size} archivo(s)${scan.truncated ? ' (recuento parcial)' : ''}:`,
  ];
  for (const file of included) lines.push(`  ${file}`);
  if (scan.sensitive.length) {
    lines.push(hasGitignore
      ? 'Estos archivos parecen sensibles: revisa que tu .gitignore los excluya antes de continuar:'
      : 'Estos archivos parecen sensibles y quedarán excluidos por el .gitignore:');
    for (const file of scan.sensitive) lines.push(`  ${file}`);
  }
  if (isPublic) {
    lines.push('AVISO: esta carpeta parece servida públicamente por un servidor web. AgentRelay guarda prompts, diffs e informes en .agentrelay/ dentro del proyecto; no dejes ese directorio accesible desde Internet, o trabaja sobre una copia fuera del directorio público.');
  }
  return lines;
}

/**
 * Prepara el repositorio: muestra el plan, pide confirmación y ejecuta git init
 * (y crea el .gitignore si no existía). No hace el commit: lo hace el llamador.
 */
export async function prepareRepository(dir, { yes, out, err }) {
  const scan = scanFolder(dir);
  const hasGitignore = existsSync(path.join(dir, '.gitignore'));
  const isPublic = looksPublic(dir);
  for (const line of describePlan(dir, scan, { hasGitignore, public: isPublic })) {
    out(line);
  }
  const answer = await confirm('¿Preparar el repositorio?', { yes });
  if (answer === null) {
    err('Ejecuta de nuevo con --yes para aplicar el cambio.');
    return { status: 'needs-confirmation' };
  }
  if (answer === false) {
    return { status: 'cancelled' };
  }
  await initRepository(dir);
  if (!hasGitignore) {
    writeFileSync(path.join(dir, '.gitignore'), DEFAULT_GITIGNORE);
  }
  return { status: 'initialized' };
}
