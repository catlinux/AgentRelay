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
  '- En un proyecto que todavía no tenga el bloque de AgentRelay en su `AGENTS.md` o `CLAUDE.md`, ejecuta `agentrelay init` antes de delegar (si el directorio no es un repositorio git, pide antes confirmación al usuario y usa `agentrelay init --yes`).',
  '- Las instrucciones detalladas de uso están en el bloque de AgentRelay del `AGENTS.md` (o `CLAUDE.md`) del proyecto; ejecuta `agentrelay --help` si necesitas recordar los comandos.',
  '',
  '### Triaje en cada petición',
  '',
  'Ante cada orden de trabajo (no ante una simple conversación o pregunta), antes de empezar, valora qué modelo y esfuerzo de razonamiento necesita y compáralo con el modelo que estás usando (consta en tu propio contexto). Hazlo aunque el usuario tenga el modelo más potente: si la tarea es liviana, sugiere bajar; si es difícil y el modelo se queda corto, sugiere subir.',
  '',
  '- **Petición pequeña:** una sola línea, por ejemplo `Triaje: ligera · basta Sonnet con esfuerzo bajo (ahora: Opus) → /model sonnet`, o `Triaje: ligera · el modelo actual es adecuado`.',
  '- **Petición de envergadura** (varios pasos o archivos, diseño, riesgo real): 3-5 líneas con tamaño y riesgo, qué delegas con AgentRelay y qué haces tú (y el nivel de orquestación 1-5 si conviene otro), y el modelo y esfuerzo recomendados. Las partes mecánicas (buscar en el código, leer muchos archivos, resumir) hazlas con subagentes de un modelo más barato, como Haiku.',
  '',
  'Criterio: Haiku para consultas, cambios mecánicos, documentación y búsquedas; Sonnet para implementación y depuración normales; Opus para diseño difícil, depuración sin pistas, revisión crítica o mucho contexto y riesgo. Usa siempre el esfuerzo más bajo que no ponga en riesgo el resultado.',
  '',
  'El triaje aprende de sus aciertos y fallos. En peticiones normales o grandes (no en las pequeñas, para no gastar tokens), antes de valorar ejecuta `agentrelay triage advise --type <tipo> --size <tamaño> --model <tu modelo> --effort <tu esfuerzo>` y tenlo en cuenta; al terminar, anota el resultado con `agentrelay triage record --type <tipo> --size <tamaño> --model <modelo> --effort <esfuerzo> --outcome over|ok|under` (`over`: sobró potencia; `under`: se quedó corto, hubo que rehacer o el usuario subió de modelo). Tipos: query, mechanical, docs, implementation, debugging, design, review; tamaños: small, normal, large; esfuerzo: low, medium, high, xhigh. Si una recomendación marca «prueba de un escalón más barato», dilo al usuario y anota después el resultado. Tras aceptar una ejecución delegada, anótala con `agentrelay triage record --kind executor --run <id>`. Si el usuario dice que se pasó o se quedó corto, anótalo.',
  '',
  'Tú no puedes cambiar tu propio modelo: avisa ANTES de trabajar para que el usuario lo cambie con `/model`. Cambiar de modelo a mitad de conversación pierde la caché del contexto, así que solo compensa si el trabajo que queda es largo; si es corto, di que sigues con el actual. Continúa sin esperar salvo que la tarea sea pesada y el modelo claramente insuficiente. No inventes costes ni cifras (son estimaciones razonadas) y respeta el modelo o esfuerzo que el usuario haya fijado.',
  '<!-- agentrelay:end -->',
].join('\n');

// Bloque de instrucciones para CLAUDE.md o AGENTS.md de cada proyecto.
export const PROJECT_BLOCK = [
  '<!-- agentrelay:start -->',
  '## Delegación con AgentRelay',
  '',
  'Este proyecto usa AgentRelay: tú eres el ORQUESTADOR (planificas, delegas, revisas y decides) y un agente ejecutor más económico (por defecto, Codex con GPT-6 Luna) escribe el código. No edites este bloque: `agentrelay init` lo actualiza. Si eres tú el ejecutor (te han dado una tarea con `agentrelay run`), haz solo esa tarea e ignora este bloque.',
  '',
  '**Regla principal: delega por defecto.** Toda implementación que no sea trivial (crear o modificar código, tests, configuración o documentación de más de unas pocas líneas) se delega con `agentrelay run`. Escribirla tú gasta tu consumo, que es justo lo que AgentRelay quiere ahorrar. Hazla tú solo si es trivial (1-3 líneas), una decisión de diseño, algo sensible o una tarea ya escalada; y en ese caso di en una línea por qué no delegas.',
  '',
  '**Al empezar cualquier sesión, ponte al día:** lee `.agentrelay/ESTADO.md` (o ejecuta `agentrelay status`, que lo muestra y `agentrelay status --write` lo actualiza). Resume dónde está el proyecto, qué ejecuciones hay y qué hacer ahora. Si el usuario te pide continuar, parte de ahí en lugar de preguntarle.',
  '',
  '### Cómo delegar',
  '',
  '1. Repositorio limpio: `git status --short` debe salir vacío. Si hay trabajo sin confirmar, haz commit antes (sin secretos como `.env`). Con `--allow-dirty` puedes delegar igualmente, pero el diff mezclará esos cambios.',
  '2. Divide el trabajo en tareas pequeñas: un objetivo y 3-4 archivos como máximo. Una tarea ancha agota el tiempo.',
  '3. Dile al usuario en una línea qué delegas y por qué, y lanza la tarea por la entrada estándar (el usuario puede verla en directo con `agentrelay watch`, en otro terminal y en la carpeta del proyecto):',
  '',
  '```',
  'agentrelay run - <<\'EOF\'',
  '{ "objective": "...", "context": "...", "files": ["..."], "constraints": ["..."], "acceptanceCriteria": ["..."], "validation": ["npm test"], "doNotModify": ["..."] }',
  'EOF',
  '```',
  '',
  '   `context` debe bastar para que el ejecutor trabaje sin preguntarte: stack, convenciones y decisiones ya tomadas.',
  '',
  '### Cómo revisar',
  '',
  '- Lee `agentrelay show <id>` (informe, incidencias y dudas) y el diff completo. Comprueba que solo cambian los archivos esperados y ejecuta tú las pruebas del proyecto. La autorrevisión del ejecutor no sustituye la tuya.',
  '- Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos) y confirma con `agentrelay list` que el estado cambió.',
  '- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.',
  '- Tras aceptar, haz el commit. No hagas push sin que el usuario lo pida y no digas «hecho» ni «aceptado» sin haberlo comprobado.',
  '',
  '### Otros',
  '',
  '- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.',
  '- **En Windows (PowerShell o cmd)** usa `agentrelay.cmd` en lugar de `agentrelay` (el segundo es un script de Unix y falla con errores de `sed`, `dirname` o `uname`). Nunca modifiques ese script. El `<<EOF` no existe en PowerShell: guarda el JSON de la tarea en un archivo temporal FUERA del repositorio (por ejemplo `$env:TEMP\\tarea.json`) y lanza `agentrelay.cmd run $env:TEMP\\tarea.json`; un archivo dentro del repositorio ensuciaría el árbol.',
  '- Si una ejecución falla por una causa externa (sesión caducada, PowerShell bloqueado), díselo al usuario en lugar de hacer el trabajo tú en silencio.',
  '<!-- agentrelay:end -->',
].join('\n');

/**
 * Estado del bloque de AgentRelay en un archivo, sin modificarlo:
 * 'nofile' (no existe el archivo), 'missing' (sin bloque), 'outdated' (el bloque
 * difiere del actual, p. ej. tras actualizar AgentRelay) o 'current'.
 */
export function blockStatus(file, block) {
  if (!existsSync(file)) return 'nofile';
  const { action } = upsertBlock(readFileSync(file, 'utf8'), block);
  if (action === 'unchanged') return 'current';
  return action === 'updated' ? 'outdated' : 'missing';
}

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
    'También se instalarán los comandos de Claude Code; solo se modifican archivos con la marca <!-- agentrelay:managed -->.',
    'Para retirar el bloque y los comandos de Claude Code, ejecuta "agentrelay setup --uninstall".',
  ];
}

/** Explica la instalación del bloque de instrucciones de AgentRelay en un proyecto. */
export function initExplanation(file, { importOnly = false } = {}) {
  if (importOnly) {
    return `Se creará ${file} con la línea @AGENTS.md para que Claude Code utilice las instrucciones compartidas de AGENTS.md.`;
  }
  return `Se añadirá o actualizará el bloque de instrucciones de AgentRelay en ${file} (solo entre ${START_MARK} y ${END_MARK}; el resto del archivo se conserva) para que el orquestador sepa cómo delegar en este proyecto. Para quitarlo, elimina a mano las líneas entre las marcas.`;
}
