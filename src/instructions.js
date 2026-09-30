// Instalación del bloque de instrucciones de AgentRelay en archivos Markdown.
// El bloque va delimitado por dos marcas y nunca se altera nada fuera de ellas.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const START_MARK = '<!-- agentrelay:start -->';
export const END_MARK = '<!-- agentrelay:end -->';

// Bloque de instrucciones para el archivo global del orquestador.
export const GLOBAL_BLOCK = [
  '<!-- agentrelay:start -->',
  '## AgentRelay',
  '',
  'Si el comando `agentrelay` está disponible en el sistema, úsalo para delegar las tareas de implementación bien acotadas a un agente ejecutor más económico, y conserva para ti la planificación, las decisiones de diseño y la revisión.',
  '',
  '- En un proyecto que todavía no tenga el bloque de AgentRelay en su `CLAUDE.md`, ejecuta `agentrelay init` antes de delegar (si el directorio no es un repositorio git, pide antes confirmación al usuario y usa `agentrelay init --yes`).',
  '- Las instrucciones detalladas de uso están en el bloque de AgentRelay del `CLAUDE.md` del proyecto; ejecuta `agentrelay --help` si necesitas recordar los comandos.',
  '<!-- agentrelay:end -->',
].join('\n');

// Bloque de instrucciones para el CLAUDE.md de cada proyecto.
export const PROJECT_BLOCK = [
  '<!-- agentrelay:start -->',
  '## Delegación con AgentRelay',
  '',
  'Este proyecto usa AgentRelay para delegar tareas de implementación a un agente ejecutor más económico (por defecto, Codex con GPT-6 Luna) mientras tú planificas, revisas y decides. No edites este bloque: `agentrelay init` lo actualiza.',
  '',
  '- Delega las tareas de implementación bien acotadas con `agentrelay run -`, pasando por la entrada estándar una tarea JSON con `objective`, `context`, `files`, `constraints`, `acceptanceCriteria`, `validation` (comandos que deben pasar) y `doNotModify`. El repositorio debe estar limpio (sin cambios pendientes) antes de delegar.',
  '- Haz tú directamente los cambios triviales, las decisiones de diseño y todo lo que no compense delegar.',
  '- Lee el informe (diff, validaciones e informe del ejecutor). La autorrevisión del ejecutor no sustituye tu revisión. Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos).',
  '- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.',
  '- Antes de delegar, dile brevemente al usuario qué vas a delegar y por qué; el usuario puede seguir la ejecución en directo con `agentrelay watch` en otro terminal.',
  '- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.',
  '<!-- agentrelay:end -->',
].join('\n');

// Separador de líneas detectado en el texto (CRLF si aparece, si no LF).
function newlineOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// Normaliza los saltos de línea de un bloque al separador indicado.
function normalizeNewlines(block, nl) {
  return block.replace(/\r?\n/g, nl);
}

// Separa un BOM inicial del resto del texto.
function splitBom(text) {
  return text.startsWith('﻿') ? { bom: '﻿', body: text.slice(1) } : { bom: '', body: text };
}

// Localiza las marcas por posición dentro del texto, sin reescribir nada.
// Devuelve null si no hay ninguna y lanza un error ante marcas incoherentes
// (faltantes, repetidas o invertidas). `from` es el inicio de la línea de la
// marca y `to` el final de su contenido, sin el salto de línea.
function findBlock(body) {
  const starts = [];
  const ends = [];
  let offset = 0;
  for (const part of body.split('\n')) {
    const content = part.endsWith('\r') ? part.slice(0, -1) : part;
    const mark = content.trim();
    if (mark === START_MARK) starts.push({ from: offset, to: offset + content.length });
    else if (mark === END_MARK) ends.push({ from: offset, to: offset + content.length });
    offset += part.length + 1;
  }
  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length > 1 || ends.length > 1) {
    throw new Error('Hay marcas de AgentRelay repetidas en el archivo; no se puede decidir qué bloque actualizar.');
  }
  if (starts.length === 0) throw new Error(`Falta la marca de inicio de AgentRelay (\`${START_MARK}\`).`);
  if (ends.length === 0) throw new Error(`Falta la marca de fin de AgentRelay (\`${END_MARK}\`).`);
  if (starts[0].from > ends[0].from) throw new Error('Las marcas de AgentRelay están en orden inverso.');
  return { start: starts[0], end: ends[0] };
}

// Añade el bloque al final, separado del contenido existente por una línea en
// blanco. Nunca se recorta el contenido: solo se añaden los saltos que faltan.
function appendBlock(body, blockNorm, nl) {
  let trailing = 0;
  for (let i = body.length - nl.length; i >= 0 && body.slice(i, i + nl.length) === nl; i -= nl.length) {
    trailing += 1;
  }
  const extra = trailing >= 2 ? 0 : 2 - trailing;
  return body + nl.repeat(extra) + blockNorm + nl;
}

/**
 * Inserta o actualiza el bloque delimitado por marcas dentro de `text`.
 * Devuelve `{ text, action }` con action en
 * 'created' | 'added' | 'updated' | 'unchanged'.
 * Solo se sustituye la región entre las marcas: el resto del texto se conserva
 * byte a byte.
 */
export function upsertBlock(text, block) {
  const { bom, body } = splitBom(text);
  const nl = newlineOf(body);
  const blockNorm = normalizeNewlines(block, nl);

  // Texto vacío o solo espacios: el resultado es el bloque.
  if (body.trim() === '') {
    return { text: bom + blockNorm + nl, action: 'created' };
  }

  const found = findBlock(body);

  // Sin marcas: el bloque se añade al final.
  if (found === null) {
    return { text: bom + appendBlock(body, blockNorm, nl), action: 'added' };
  }

  const current = body.slice(found.start.from, found.end.to);
  if (normalizeNewlines(current, nl) === blockNorm) {
    return { text, action: 'unchanged' };
  }
  const next = body.slice(0, found.start.from) + blockNorm + body.slice(found.end.to);
  return { text: bom + next, action: 'updated' };
}

/**
 * Elimina el bloque delimitado por marcas de `text`, junto con la línea en
 * blanco que lo precedía (si la había). Devuelve `{ text, action }` con action
 * en 'removed' | 'absent'.
 */
export function removeBlock(text) {
  const { bom, body } = splitBom(text);
  const found = findBlock(body);
  if (found === null) return { text, action: 'absent' };

  // Se quita también el salto de línea que cierra la marca de fin y una línea
  // en blanco anterior, si la había.
  const before = body.slice(0, found.start.from).replace(/(\r?\n)\r?\n$/, '$1');
  const after = body.slice(found.end.to).replace(/^\r?\n/, '');
  return { text: bom + before + after, action: 'removed' };
}

/** Aplica el bloque al archivo, creando los directorios padre si faltan. */
export function applyBlockToFile(file, block) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const { text: next, action } = upsertBlock(text, block);
  if (action !== 'unchanged') {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, next);
  }
  return { action };
}

/** Quita el bloque del archivo; si queda vacío (solo espacios) lo elimina. */
export function removeBlockFromFile(file) {
  if (!existsSync(file)) return { action: 'absent' };
  const text = readFileSync(file, 'utf8');
  const { text: next, action } = removeBlock(text);
  if (action === 'absent') return { action };
  const withoutBom = next.startsWith('﻿') ? next.slice(1) : next;
  if (withoutBom.trim() === '') {
    rmSync(file, { force: true });
  } else {
    writeFileSync(file, next);
  }
  return { action };
}

/** Ruta del archivo de instrucciones global a partir del directorio .claude. */
export function globalInstructionsPath(claudeDir) {
  return path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'CLAUDE.md');
}

/** Explica dónde se instala el bloque global y cómo retirarlo. */
export function setupExplanation(file, removing = false) {
  if (removing) {
    return [
      `Se quitará el bloque de instrucciones de AgentRelay de ${file}.`,
      `Solo se eliminará el contenido entre ${START_MARK} y ${END_MARK}; el resto del archivo se conserva.`,
    ];
  }
  return [
    `El bloque de instrucciones de AgentRelay son unas líneas entre ${START_MARK} y ${END_MARK} en el archivo global de instrucciones de Claude Code.`,
    'Indica a Claude cuándo y cómo delegar tareas con AgentRelay en cualquier proyecto.',
    `Se instalará en ${file}: si el archivo no existe se creará, y si ya tiene el bloque se actualizará.`,
    'No se modifica nada fuera de las marcas.',
    'Para quitarlo, ejecuta "agentrelay setup --uninstall".',
  ];
}

/** Explica la instalación del bloque de instrucciones de AgentRelay en un proyecto. */
export function initExplanation(file) {
  return `Se añadirá o actualizará el bloque de instrucciones de AgentRelay en ${file} (solo entre ${START_MARK} y ${END_MARK}; el resto del archivo se conserva) para que el orquestador sepa cómo delegar en este proyecto. Para quitarlo, elimina a mano las líneas entre las marcas.`;
}
