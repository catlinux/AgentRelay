// Edición de los archivos de configuración JSONC de AgentRelay línea a línea,
// conservando todos los comentarios y el resto de las líneas byte a byte.
// Son funciones puras: reciben texto y devuelven texto, sin tocar el disco.
import { DEFAULT_CONFIG } from './config.js';
import { POLICY } from './policy.js';

// --- Utilidades de líneas -------------------------------------------------

// Divide el texto en líneas sin sus terminadores y detecta el salto de línea
// dominante (LF o CRLF) para reconstruirlo igual al volver a unir.
function splitText(text) {
  const source = String(text);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return { eol, lines: source.split(/\r?\n/) };
}

function indentOf(line) { return /^[ \t]*/.exec(line)[0]; }

// Añade el prefijo de comentario conservando la sangría.
function comment(line) { return line.replace(/^([ \t]*)/, '$1// '); }

// Quita el prefijo de comentario conservando la sangría.
function uncomment(line) { return line.replace(/^([ \t]*)\/\/ ?/, '$1'); }

// Línea de una opción con su sangría y, si procede, el prefijo de comentario.
function leafLine(indent, commented, key, valueText) {
  return `${indent}${commented ? '// ' : ''}"${key}": ${valueText},`;
}

// --- Análisis estructural -------------------------------------------------

// Describe una línea: bloque que abre, bloque que cierra, opción con clave, o
// cualquier otra cosa (comentario explicativo, línea en blanco...).
function describe(line) {
  const trimmed = line.trim();
  if (!trimmed) return { kind: 'blank', commented: false };
  const commented = trimmed.startsWith('//');
  const code = commented ? trimmed.slice(2).trim() : trimmed;
  if (!code) return { kind: 'blank', commented };
  if (code === '{') return { kind: 'root-open', commented };
  if (/^\}\s*,?$/.test(code)) return { kind: 'close', commented };
  const open = /^"([^"]+)"\s*:\s*\{$/.exec(code);
  if (open) return { kind: 'open', key: open[1], commented };
  const leaf = /^"([^"]+)"\s*:\s*(.+)$/.exec(code);
  if (leaf) {
    let value = leaf[2].trim();
    if (value.endsWith(',')) value = value.slice(0, -1).trimEnd();
    return { kind: 'leaf', key: leaf[1], value, commented };
  }
  return { kind: 'other', commented };
}

// Recorre las líneas manteniendo la pila de bloques para localizar cada opción
// y cada bloque por su ruta con puntos (por ejemplo policy.selfReview.normal).
function analyze(lines) {
  const blocks = new Map();
  const leaves = new Map();
  const stack = [];
  let rootClose = -1;
  for (let i = 0; i < lines.length; i++) {
    const info = describe(lines[i]);
    if (info.kind === 'root-open') { stack.push({ path: '', key: null }); continue; }
    if (info.kind === 'open') {
      const parent = stack.length ? stack[stack.length - 1].path : '';
      const path = parent ? `${parent}.${info.key}` : info.key;
      stack.push({ path, key: info.key });
      blocks.set(path, { open: i, close: -1, openCommented: info.commented, closeCommented: true });
    } else if (info.kind === 'close') {
      const frame = stack.pop();
      if (!frame) continue;
      if (frame.key === null) { rootClose = i; continue; }
      const block = blocks.get(frame.path);
      if (block) { block.close = i; block.closeCommented = info.commented; }
    } else if (info.kind === 'leaf') {
      const parent = stack.length ? stack[stack.length - 1].path : '';
      const path = parent ? `${parent}.${info.key}` : info.key;
      leaves.set(path, { line: i, key: info.key, commented: info.commented, value: info.value });
    }
  }
  return { blocks, leaves, rootClose };
}

// Descomenta, si hace falta, todos los bloques que contienen la clave.
function uncommentAncestors(lines, blocks, parts) {
  for (let i = 1; i < parts.length; i++) {
    const block = blocks.get(parts.slice(0, i).join('.'));
    if (!block) continue;
    if (block.openCommented) lines[block.open] = uncomment(lines[block.open]);
    if (block.closeCommented) lines[block.close] = uncomment(lines[block.close]);
  }
}

// --- Valores por defecto conocidos ---------------------------------------

// Objeto con los valores predeterminados que aparecen en la plantilla: los de
// DEFAULT_CONFIG más los de la política por defecto.
function defaultValues() {
  return { ...DEFAULT_CONFIG, policy: { ...POLICY, ...DEFAULT_CONFIG.policy } };
}

// Valor por defecto de una clave con puntos, o { known: false } si no es una
// clave documentada en la plantilla.
function defaultFor(dottedKey) {
  let node = defaultValues();
  for (const part of String(dottedKey).split('.')) {
    if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, part)) node = node[part];
    else return { known: false };
  }
  return { known: true, value: node };
}

// --- Construcción de bloques nuevos --------------------------------------

// Genera las líneas de una clave que no existe en la plantilla, creando los
// objetos padre que falten. `components` va del bloque superior a la hoja.
function buildCreated(components, valueText, baseIndent) {
  const out = [];
  let indent = baseIndent;
  for (let i = 0; i < components.length - 1; i++) {
    out.push(`${indent}"${components[i]}": {`);
    indent += '  ';
  }
  out.push(`${indent}"${components.at(-1)}": ${valueText},`);
  for (let i = components.length - 2; i >= 0; i--) {
    indent = indent.slice(2);
    out.push(`${indent}},`);
  }
  return out;
}

// --- API pública ----------------------------------------------------------

export function setConfigValue(text, dottedKey, value) {
  const { eol, lines } = splitText(text);
  const { blocks, leaves, rootClose } = analyze(lines);
  const parts = String(dottedKey).split('.');
  const valueText = JSON.stringify(value);
  const existing = leaves.get(String(dottedKey));

  // 1) La opción ya existe: si está activa se reemplaza el valor; si está
  //    comentada (plantilla) se descomenta con el valor nuevo.
  if (existing) {
    const indent = indentOf(lines[existing.line]);
    lines[existing.line] = leafLine(indent, false, parts.at(-1), valueText);
    uncommentAncestors(lines, blocks, parts);
    return lines.join(eol);
  }

  // 2) La opción no está, pero su objeto padre sí: se descomenta el padre y se
  //    inserta la opción justo antes de su cierre.
  const parentPath = parts.slice(0, -1).join('.');
  if (parentPath && blocks.has(parentPath)) {
    uncommentAncestors(lines, blocks, parts);
    const block = blocks.get(parentPath);
    const indent = `${indentOf(lines[block.open])}  `;
    lines.splice(block.close, 0, leafLine(indent, false, parts.at(-1), valueText));
    return lines.join(eol);
  }

  // 3) Hay que crear los objetos padre que falten. Se busca el ancestro
  //    existente más profundo y se construye el resto a partir de él.
  const ancestors = parts.slice(0, -1);
  let depth = ancestors.length;
  while (depth > 0 && !blocks.has(ancestors.slice(0, depth).join('.'))) depth--;

  if (depth === 0) {
    const created = buildCreated(parts, valueText, '  ');
    lines.splice(rootClose >= 0 ? rootClose : lines.length, 0, ...created);
    return lines.join(eol);
  }

  uncommentAncestors(lines, blocks, parts);
  const block = blocks.get(ancestors.slice(0, depth).join('.'));
  const baseIndent = `${indentOf(lines[block.open])}  `;
  const created = buildCreated(parts.slice(depth), valueText, baseIndent);
  lines.splice(block.close, 0, ...created);
  return lines.join(eol);
}

// ¿El bloque entre las líneas `open` y `close` (exclusivas) no tiene contenido
// activo?
function blockIsEmpty(lines, open, close) {
  for (let i = open + 1; i < close; i++) {
    const info = describe(lines[i]);
    if (!info.commented && (info.kind === 'leaf' || info.kind === 'open')) return false;
  }
  return true;
}

// Vuelve a comentar los bloques que se quedaron vacíos al retirar una opción,
// del más interno al más externo.
function recommentEmptyBlocks(lines, parts) {
  for (let i = parts.length - 1; i >= 1; i--) {
    const block = analyze(lines).blocks.get(parts.slice(0, i).join('.'));
    if (!block) continue;
    if (describe(lines[block.open]).commented) continue;
    if (!blockIsEmpty(lines, block.open, block.close)) continue;
    // Un bloque creado a mano y ya vacío (sin líneas entre la apertura y el
    // cierre) se elimina por completo; uno de la plantilla solo se comenta.
    if (block.close === block.open + 1) {
      lines.splice(block.close, 1);
      lines.splice(block.open, 1);
    } else {
      lines[block.open] = comment(lines[block.open]);
      lines[block.close] = comment(lines[block.close]);
    }
  }
}

export function unsetConfigValue(text, dottedKey) {
  const { eol, lines } = splitText(text);
  const existing = analyze(lines).leaves.get(String(dottedKey));
  // Si no existe o ya está comentada, no hay nada que retirar.
  if (!existing || existing.commented) return text;

  const parts = String(dottedKey).split('.');
  const indent = indentOf(lines[existing.line]);
  const fallback = defaultFor(dottedKey);

  if (fallback.known) lines[existing.line] = leafLine(indent, true, parts.at(-1), JSON.stringify(fallback.value));
  else lines.splice(existing.line, 1);

  recommentEmptyBlocks(lines, parts);
  return lines.join(eol);
}
