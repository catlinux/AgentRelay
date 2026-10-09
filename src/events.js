// Eventos estructurados de una ejecución en .agentrelay/runs/<id>/events.ndjson.
// La CLI los muestra formateados por stderr en tiempo real; el archivo NDJSON
// queda como registro persistente de todo lo que ha ocurrido.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runDir } from './store.js';

/** Añade una línea JSON al events.ndjson y devuelve el evento escrito. */
export function appendEvent(root, runId, event) {
  const stored = { ...event };
  if (!stored.ts) stored.ts = new Date().toISOString();
  const file = path.join(runDir(root, runId), 'events.ndjson');
  appendFileSync(file, `${JSON.stringify(stored)}\n`);
  return stored;
}

/** Devuelve los eventos del archivo (vacío si no existe; ignora líneas no válidas). */
export function readEvents(root, runId) {
  const file = path.join(runDir(root, runId), 'events.ndjson');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

const ansi = (code, value) => `\u001b[${code}m${value}\u001b[0m`;
const cleanPath = (value) => value.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '').replace(/^\.\//, '');

/** Quita una capa habitual de shell para describir la orden que ejecutó el agente. */
function unwrapCommand(line) {
  let command = String(line ?? '').trim().replace(/\b([A-Z]:)\/\//gi, '$1/').replace(/\\/g, '/');
  const wrapper = /^(?:"[^"]*(?:powershell(?:\.exe)?|pwsh|cmd(?:\.exe)?|bash|sh)[^"]*"|[^\s]+(?:powershell(?:\.exe)?|pwsh|cmd(?:\.exe)?|bash|sh))\s*(?:-Command|-c|\/c|-lc)\s+([\s\S]+)$/i.exec(command);
  if (wrapper) command = wrapper[1].trim();
  if ((command.startsWith('"') && command.endsWith('"')) || (command.startsWith("'") && command.endsWith("'"))) {
    command = command.slice(1, -1);
  }
  return command.trim();
}

const firstWord = (command) => (/^([^\s;|&]+)/.exec(command)?.[1] ?? '').replace(/^['"]|['"]$/g, '');

/** Resume en español una orden conocida, o devuelve null si no se reconoce. */
export function describeCommand(commandLine) {
  const command = unwrapCommand(commandLine);
  const words = command.match(/(?:"[^"]*"|'[^']*'|[^\s;|&]+)/g) ?? [];
  const name = firstWord(command).toLowerCase();
  const args = words.slice(1).map((word) => word.replace(/^['"]|['"]$/g, ''));
  const isTest = /^(?:npm(?:\.cmd)?|pnpm|yarn|node|pytest|go|cargo|dotnet|vitest|jest)$/i.test(name)
    && (/^(?:npm(?:\.cmd)?|pnpm|yarn)$/i.test(name) && (args[0] === 'test' || (args[0] === 'run' && args[1] === 'test'))
      || name === 'node' && args[0] === '--test'
      || /^(?:pytest|vitest|jest)$/.test(name)
      || name === 'go' && args[0] === 'test'
      || name === 'cargo' && args[0] === 'test'
      || name === 'dotnet' && args[0] === 'test');
  if (isTest) return 'ejecuta los tests';
  if (/^(?:npm(?:\.cmd)?|pnpm|yarn)$/i.test(name) && /^(?:install|ci)$/.test(args[0] ?? '')) return 'instala dependencias';
  if (/^(?:get-content|cat|type|sed|head|tail|more)$/.test(name)) {
    const file = args.find((arg) => !arg.startsWith('-'));
    return file ? `lee ${cleanPath(file)}` : 'lee archivos';
  }
  if (/^(?:get-childitem|ls|dir|find|tree)$/.test(name)) return 'lista archivos';
  if (/^(?:select-string|grep|rg|findstr)$/.test(name)) return 'busca en el código';
  if (name === 'git' && /^(?:status|diff|log|show)$/i.test(args[0] ?? '')) return 'revisa el estado de git';
  if (name === 'node' && args[0] && args[0] !== '--test') return `ejecuta node ${cleanPath(args[0])}`;
  if (/^(?:set-content|out-file|add-content|mkdir|new-item|remove-item|rm|mv|cp)$/.test(name)) return 'modifica archivos';
  return null;
}

/** Determina si la salida admite color y no se ha desactivado explícitamente. */
export function useColor(stream = process.stderr, env = process.env) {
  return stream?.isTTY === true && (env.NO_COLOR === undefined || env.NO_COLOR === '') && env.TERM !== 'dumb';
}

/** OSC 8 depende de la capacidad del terminal, no de la configuración de color. */
export function supportsLinks(stream = process.stdout, env = process.env) {
  if (env.AGENTRELAY_LINKS === '1') return true;
  if (env.AGENTRELAY_LINKS === '0') return false;
  return stream?.isTTY === true && env.TERM !== 'dumb'
    && (['vscode', 'iTerm.app', 'WezTerm', 'ghostty', 'Hyper'].includes(env.TERM_PROGRAM)
      || Boolean(env.WT_SESSION)
      || Number(env.VTE_VERSION) >= 5000
      || Boolean(env.KONSOLE_VERSION));
}

function linkFiles(files, root) {
  if (!root) return files;
  return files.split(/(, )/).map((part) => {
    if (part === ', ') return part;
    if (part === 'archivos' || /[*?\[\]"'`]/.test(part)) return part;
    const normalized = part.replace(/\\/g, '/');
    if (!normalized || path.isAbsolute(part) || /^[A-Za-z]:/.test(part)) return part;
    const absolute = path.resolve(root, normalized);
    const relative = path.relative(root, absolute);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return part;
    return `\u001b]8;;${pathToFileURL(absolute).href}\u001b\\${part}\u001b]8;;\u001b\\`;
  }).join('');
}

function formatFileDetails(detail, root) {
  // Preserve the formatter's historical output byte-for-byte when links are off.
  if (!root) return detail.split(/\s*[,;]\s*/).map(cleanPath).join(', ');
  const files = [];
  const pattern = /\s*(?:"([^"]+)"|'([^']+)'|([^,;]+?))\s*(?:[,;]|$)/g;
  for (const match of detail.matchAll(pattern)) {
    const quoted = match[1] ?? match[2];
    const value = (quoted ?? match[3] ?? '').trim();
    if (value) files.push({ value, quoted: quoted !== undefined });
  }
  return files.map(({ value, quoted }) => {
    const visible = cleanPath(value);
    if (quoted && visible.includes(' ')) {
      const absolute = path.resolve(root, visible);
      const relative = path.relative(root, absolute);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return visible;
      return `"\u001b]8;;${pathToFileURL(absolute).href}\u001b\\${visible}\u001b]8;;\u001b\\"`;
    }
    return linkFiles(visible, root);
  }).join(', ');
}

function shortNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace('.', ',')} mil`;
  return String(number);
}

function humanDuration(ms) {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${String(seconds % 60).padStart(2, '0')} s` : `${seconds} s`;
}

const KIND_NAMES = { implement: 'implementación', fix: 'corrección' };
const STATUS_LINES = {
  interrupted: '■ Interrumpida',
  running: '■ En curso', awaiting_review: '■ Listo para tu revisión', accepted: '✔ Aceptada',
  failed: '✖ Fallida', escalated: '↻ Escalada', rejected: '✖ Rechazada',
};

/** Formatea un evento como una o más líneas, o null si no se muestra. */
export function formatEvent(event, startedAtMs, options = {}) {
  if (!event || !event.type) return null;
  const color = options.color === true;
  const time = event.ts && Number.isFinite(Date.parse(event.ts))
    ? (() => { const date = new Date(event.ts); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`; })()
    : '';
  const prefix = time ? `${time}  ` : '';
  const fmt = (text, { blank = false, tone = '' } = {}) => {
    if (!color) return `${blank ? '\n' : ''}${prefix}${text}`;
    const body = tone ? ansi(tone, text) : text;
    const dim = !tone && event.type === 'activity' && ['thinking', 'usage'].includes(event.kind);
    const timePrefix = time ? ansi('2', `${time}  `) : '';
    return `${blank ? '\n' : ''}${timePrefix}${dim ? ansi('2', body) : body}`;
  };
  switch (event.type) {
    case 'run_start':
      return fmt(`▶ Ejecución ${event.runId}\n  ${String(event.title ?? '').slice(0, 100)}`, { tone: '1;36' });
    case 'attempt_start':
      return fmt(`▶ Intento ${event.attempt} (${KIND_NAMES[event.kind] ?? event.kind}) · ${[event.provider, event.model].filter(Boolean).join('/') || 'modelo por defecto'}`, { blank: true, tone: '1;36' });
    case 'activity': {
      if (event.kind === 'iteration') return null;
      if (event.kind === 'thinking') return fmt(`  · piensa: ${event.text}`);
      if (event.kind === 'tool') {
        const detail = String(event.detail ?? '');
        if (['read_files', 'editor-read', 'editor'].includes(event.tool)) {
          const files = formatFileDetails(detail, options.links?.root);
          return fmt(`  ${event.tool === 'editor' ? '✎ edita' : '· lee'}: ${files}`);
        }
        if (event.tool === 'edit') return fmt(`  ✎ edita: ${formatFileDetails(detail, options.links?.root)}`);
        if (['run_commands', 'command'].includes(event.tool)) {
          const inner = unwrapCommand(detail);
          const summary = describeCommand(detail) ?? `ejecuta: ${inner.slice(0, 100)}`;
          const read = /^lee (.+)$/.exec(summary);
          const linkedSummary = options.links?.root && read
            ? `lee ${linkFiles(read[1], options.links.root)}`
            : summary;
          return fmt(`  · ${linkedSummary}`);
        }
        return fmt(`  · ${event.tool}: ${detail}`);
      }
      if (event.kind === 'usage') {
        const tokens = `  · tokens: ${shortNumber(event.inputTokens)} entrada · ${shortNumber(event.outputTokens)} salida`;
        return fmt(typeof event.cost === 'number' ? `${tokens} · ${event.cost.toFixed(4)} USD` : tokens);
      }
      if (event.kind === 'error') return fmt(`  ✖ error: ${event.message}`, { tone: '31' });
      return null;
    }
    case 'attempt_end':
      if (event.ok) return fmt(`✔ Intento ${event.attempt} completado en ${humanDuration(event.durationMs)} (${event.agentStatus})`, { tone: '32' });
      return fmt(`✖ Intento ${event.attempt} fallido: ${event.error}`, { tone: '31' });
    case 'validation': {
      const result = event.timedOut ? 'TIEMPO AGOTADO' : event.passed ? 'correcta' : `FALLA (código ${event.exitCode})`;
      return fmt(`  · validación \`${event.command}\`: ${result}`);
    }
    case 'check_start': return fmt('  · validando…');
    case 'check': {
      const parts = [`${event.changedFiles} archivo(s) modificado(s) · validación ${event.passed ? 'correcta' : 'fallida'}`];
      if (event.scopeViolations?.length) parts.push(`archivos protegidos: ${event.scopeViolations.join(', ')}`);
      return fmt(`  · ${parts.join(' · ')}`);
    }
    case 'retry': return fmt(`↻ Corrección automática ${event.n}/${event.max}`, { tone: '33' });
    case 'route_switch': {
      const details = [
        event.paid ? 'de pago' : '',
        event.trainsOnData ? 'aviso: puede usar tus prompts para entrenar' : '',
      ].filter(Boolean);
      return fmt(`⇄ Cambio de ejecutor: ${event.from} → ${event.to} (${event.reason})${details.length ? ` · ${details.join(' · ')}` : ''}`, { tone: '33' });
    }
    case 'self_review_start': return fmt('▶ Self-review del ejecutor', { tone: '1;36' });
    case 'self_review_skipped': return fmt(`  · self-review separada omitida: ${event.reason}`);
    case 'status': {
      const reasons = event.reasons?.length ? ` (${event.reasons.join('; ')})` : '';
      const line = `${STATUS_LINES[event.status] ?? event.status}${reasons}`;
      const statusLine = fmt(line, { tone: event.status === 'accepted' ? '32' : ['failed', 'rejected'].includes(event.status) ? '31' : event.status === 'escalated' ? '33' : '' });
      if (event.status === 'awaiting_review' && event.runId) return `${statusLine}\n  Siguiente paso: agentrelay review ${event.runId} --decision accept|fix|escalate|reject`;
      return statusLine;
    }
    case 'review': {
      const first = String(event.feedback ?? '').trim().split(/\r?\n/)[0];
      const feedback = first ? ` — ${first.length > 160 ? `${first.slice(0, 160)}…` : first}` : '';
      return fmt(`Revisión del orquestador: ${event.decision}${feedback}`);
    }
    default: return null;
  }
}
