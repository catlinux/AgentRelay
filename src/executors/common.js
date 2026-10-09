// Helpers genéricos compartidos por los adaptadores de ejecutor.
//
// Aquí vive todo lo que no depende del formato concreto de cada CLI: el informe
// estructurado del ejecutor, el recorte de textos, la relativización de rutas y
// el procesado de stdout línea a línea.

import { realpathSync } from 'node:fs';

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

export function maskSecrets(text) {
  return String(text ?? '').replace(/\bsk-(?:proj-)?[A-Za-z0-9_*\-]+/gi, 'clave de API');
}

/** Clasifica errores recuperables solo tras corregir credenciales o cuota. */
export function classifyExecutorError(text) {
  const value = String(text ?? '').toLowerCase();
  if (/\b(?:unauthorized|authentication fails?|invalid api key|incorrect api key|invalid_api_key|not logged in|session expired)\b/.test(value)
    || /\b401\s+unauthorized\b/.test(value)
    || /\b(?:status|http|error|code)[^a-z0-9]{0,3}401\b/.test(value)) {
    return 'credentials';
  }
  if (/\b(?:insufficient_quota|quota exceeded|exceeded your current quota|billing|insufficient balance|out of credits|payment required)\b/.test(value)
    || /\b402\s+payment required\b/.test(value)
    || /\b(?:status|http|error|code)[^a-z0-9]{0,3}402\b/.test(value)
    || /\b(?:hit|reached)\s+your\s+usage\s+limit\b/.test(value)
    || /\busage[\s_-]+limit[\s_-]+reached\b/.test(value)
    || /\busage_limit_reached\b/.test(value)
    || /\busage[\s_-]+limit\b[\s\S]{0,120}\btry again\s+(?:in|at)\b/.test(value)
    || /\bplan\s+limit\b/.test(value)
    || /\b(?:\d+\s*[- ]?hour|weekly)\s+usage\s+limit\b/.test(value)) {
    return 'quota';
  }
  const mentionsModelOrEndpoint = /\b(?:models?|endpoints?)\b/.test(value);
  if ((mentionsModelOrEndpoint && (
    /\b(?:status|http|error|code)[^a-z0-9]{0,3}(?:410|404)\b/.test(value)
    || /\b410\s+gone\b/.test(value)
    || /\b404\s+not found\b/.test(value)
  ))
    || /\bmodel(?:\s+|_)?not(?:\s+|_)found\b/.test(value)
    || /\bprovidermodelnotfounderror\b/.test(value)
    || /\bunknown model\b/.test(value)
    || /\bno such model\b/.test(value)
    || /\bmodel\b[^.\r\n]{0,80}\b(?:is\s+)?not\s+(?:available|supported)\b/.test(value)
    || /\bmodel unavailable\b/.test(value)
    || /\bmodels?\b[^.\r\n]{0,80}\b(?:deprecated|retired|decommissioned)\b/.test(value)
    || /\b(?:deprecated|retired|decommissioned)\b[^.\r\n]{0,40}\bmodels?\b/.test(value)
    || /\bno longer (?:available|supported)\b/.test(value)) {
    return 'unavailable';
  }
  return null;
}

/** Extrae del error de cuota el instante a partir del que se puede reintentar. */
export function parseQuotaReset(text, now = new Date()) {
  const value = String(text ?? '');
  const maxDelay = 8 * 24 * 60 * 60 * 1000;
  const valid = (date) => {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    const delay = date.getTime() - now.getTime();
    return delay > 0 && delay <= maxDelay ? date : null;
  };

  for (const match of value.matchAll(/"resets_in_seconds"\s*:\s*(\d+(?:\.\d+)?)/gi)) {
    const date = valid(new Date(now.getTime() + Number(match[1]) * 1000));
    if (date) return date;
  }
  for (const match of value.matchAll(/"resets_at"\s*:\s*(\d{10}|\d{13})(?!\d)/gi)) {
    const stamp = Number(match[1]);
    const date = valid(new Date(match[1].length === 13 ? stamp : stamp * 1000));
    if (date) return date;
  }

  const duration = value.match(/\btry again in\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|days?|d|seconds?|secs?|s)\s*(?:and\s*)?)+)/i);
  if (duration) {
    let milliseconds = 0;
    const units = /([\d.]+)\s*(hours?|hrs?|h|minutes?|mins?|m|days?|d|seconds?|secs?|s)/gi;
    for (const [, amount, unit] of duration[1].matchAll(units)) {
      const factor = /^h/i.test(unit) ? 60 * 60 * 1000
        : /^m/i.test(unit) ? 60 * 1000
          : /^d/i.test(unit) ? 24 * 60 * 60 * 1000 : 1000;
      milliseconds += Number(amount) * factor;
    }
    const date = valid(new Date(now.getTime() + milliseconds));
    if (date) return date;
  }

  const time = value.match(/\btry again at\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\b/i);
  if (time) {
    let hour = Number(time[1]);
    const minute = Number(time[2]);
    if (minute < 60 && (time[3] ? hour >= 1 && hour <= 12 : hour <= 23)) {
      if (time[3]) hour = (hour % 12) + (/PM/i.test(time[3]) ? 12 : 0);
      let date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      if (date.getTime() <= now.getTime()) date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
      const parsed = valid(date);
      if (parsed) return parsed;
    }
  }

  const dateText = value.match(/\btry again (?:at|on)\s+(.+?)(?:[\r\n]|$)/i)?.[1]?.trim().replace(/[.,]+$/, '');
  if (dateText) return valid(new Date(Date.parse(dateText)));
  return null;
}

/** Busca el último bloque JSON del texto final con el informe del ejecutor. */
export function extractAgentReport(text) {
  if (!text) return null;
  const blocks = [...text.matchAll(/```(?:json)?[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) blocks.push(trimmed);
  for (const block of blocks.reverse()) {
    try {
      const data = JSON.parse(block);
      if (data && typeof data === 'object' && 'status' in data) {
        return {
          status: String(data.status),
          summary: String(data.summary ?? ''),
          filesChanged: toArray(data.filesChanged).map(String),
          checks: toArray(data.checks),
          issues: toArray(data.issues).map(String),
          questions: toArray(data.questions).map(String),
          needsEscalation: Boolean(data.needsEscalation),
        };
      }
    } catch {
      // Bloque no válido: probamos el anterior.
    }
  }
  return null;
}

/** Últimos `max` caracteres de un texto. */
export function tail(text, max = 2000) {
  return text.length > max ? text.slice(-max) : text;
}

/** Recorta un texto a `max` caracteres, añadiendo "…" si se excede. */
export function clip(text, max = 160) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Ruta real de `dir` (sin enlaces simbólicos) o null si no se puede resolver. */
function realPath(dir) {
  try {
    return realpathSync(dir);
  } catch {
    return null;
  }
}

/**
 * Sustituye el directorio `cwd` (con "\\" o "/") por "." y normaliza a "/".
 * Tiene en cuenta también su ruta real: en macOS, por ejemplo, /var/... es un
 * enlace a /private/var/... y el ejecutor puede informar de cualquiera de las
 * dos. Se sustituyen primero las más largas para no dejar restos como "/private.".
 */
export function relativize(text, cwd) {
  if (!cwd || !text) return text;
  const variants = new Set();
  for (const base of [cwd, realPath(cwd)].filter(Boolean)) {
    variants.add(base);
    variants.add(base.replace(/\\/g, '/'));
    variants.add(base.replace(/\//g, '\\'));
  }
  let out = text;
  for (const v of [...variants].sort((a, b) => b.length - a.length)) out = out.split(v).join('.');
  return out.replace(/\\/g, '/');
}

/** Primera línea no vacía de un texto. */
export function firstLine(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Instrucción corta que se le pasa al ejecutor para que lea el prompt. */
export function instructionFor(promptFile) {
  return `Read the file ${promptFile} in the working directory and carry out the task it describes exactly. Do not modify or delete that file.`;
}

/**
 * Procesa stdout línea a línea y avisa de cada actividad según llega.
 * `toActivity(evento, cwd)` convierte una línea ya parseada en actividad o null.
 */
export function makeLineHandler(toActivity, cwd, onActivity) {
  let pending = '';
  const handleLine = (raw) => {
    if (!raw.startsWith('{')) return;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    const activity = toActivity(event, cwd);
    if (activity) onActivity(activity);
  };
  return (chunk) => {
    pending += chunk;
    let nl;
    while ((nl = pending.indexOf('\n')) !== -1) {
      const raw = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      handleLine(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    }
  };
}
