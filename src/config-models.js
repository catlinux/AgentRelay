import { parseJsonc, stripJsonc } from './config.js';

export const MODELS_START = '// agentrelay:models:start';
export const MODELS_END = '// agentrelay:models:end';

const EFFORT_ES = {
  none: 'ninguno',
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
  xhigh: 'extremo',
  max: 'máximo',
  ultra: 'ultra',
};

function dateText(now) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? String(now) : date.toISOString().slice(0, 10);
}

export function renderModelsBlock(entries, { now = new Date() } = {}) {
  const lines = [
    MODELS_START,
    '  // ── Modelos disponibles (se actualiza con "agentrelay config refresh"; no edites este bloque) ──',
    `  // Actualizado: ${dateText(now)}`,
  ];

  for (const entry of entries) {
    lines.push(`  // ${entry.title} (executor.type = "${entry.executor}")${entry.current ? ' — en uso' : ''}`);
    if (entry.error) {
      lines.push(`  //   no se pudo leer: ${entry.error}`);
      continue;
    }
    if (!entry.models?.length) {
      lines.push('  //   sin lista de modelos disponible');
      continue;
    }
    for (const model of entry.models) {
      const efforts = Array.isArray(model.efforts)
        ? ` · esfuerzos: ${model.efforts.map((effort) => `${EFFORT_ES[effort] || effort}${effort === model.defaultEffort ? '*' : ''}`).join(', ')}`
        : '';
      lines.push(`  //   ${model.id}${efforts}`);
    }
  }

  lines.push(MODELS_END);
  return lines.join('\n');
}

function markerLines(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === MODELS_START);
  const end = lines.findIndex((line, index) => index > start && line.trim() === MODELS_END);
  return { lines, start, end };
}

function rootCloseLine(text) {
  const cleaned = stripJsonc(text);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      return text.slice(0, i).lastIndexOf('\n') + 1;
    }
  }
  throw new Error('No se encontró el cierre del objeto raíz de configuración');
}

export function applyModelsBlock(text, block) {
  const source = String(text);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const normalizedBlock = String(block).replace(/\r?\n/g, eol);
  const { lines, start, end } = markerLines(source);
  if (start >= 0 && end >= 0) {
    lines.splice(start, end - start + 1, ...normalizedBlock.split(eol));
    const result = lines.join(eol);
    parseJsonc(result);
    return result;
  }

  const insertAt = rootCloseLine(source);
  const result = `${source.slice(0, insertAt)}${eol}${normalizedBlock}${eol}${eol}${source.slice(insertAt)}`;
  parseJsonc(result);
  return result;
}

export function removeModelsBlock(text) {
  const source = String(text);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const { lines, start, end } = markerLines(source);
  if (start < 0 || end < 0) return source;
  let from = start;
  let to = end;
  if (from > 0 && lines[from - 1] === '') from--;
  if (to + 1 < lines.length && lines[to + 1] === '') to++;
  lines.splice(from, to - from + 1);
  return lines.join(eol);
}
