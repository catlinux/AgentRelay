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
  'Si el comando `agentrelay` está disponible en el sistema, úsalo para delegar las tareas de implementación bien acotadas a un agente ejecutor más económico, y conserva para ti la planificación, las decisiones de diseño y la revisión. El ejecutor, su modelo y su esfuerzo se configuran en AgentRelay (`agentrelay use`, campo `effort` de cada tarea): no des por hecho ninguno en concreto.',
  '',
  '- En un proyecto sin el bloque de AgentRelay en su `AGENTS.md` o `CLAUDE.md`, pregunta al usuario antes de ejecutar `agentrelay init` (con `--yes` si el directorio no es un repositorio git).',
  '- Las instrucciones detalladas de uso están en el bloque de AgentRelay del proyecto; ejecuta `agentrelay --help` si necesitas recordar los comandos.',
  '',
  '### Triaje en cada petición',
  '',
  'Una sola vez, al recibir cada orden de trabajo (no ante una conversación o una pregunta) y antes de empezar, recomienda el modelo y el esfuerzo de razonamiento que necesitas tú (consta en tu propio contexto cuál usas), delegues o no:',
  '',
  '- Si el actual es el recomendado, dilo en el triaje y sigue trabajando.',
  '- Si conviene otro (más ligero o más potente), PARA y espera a que el usuario lo cambie con `/model` y te lo confirme: tú no puedes cambiar tu propio modelo.',
  '- Si delegas, di qué delegas y con qué esfuerzo del ejecutor. Ese esfuerzo lo fijas tú sin esperar (campo `effort` de la tarea, o `agentrelay use`).',
  '- **Petición pequeña:** una línea, por ejemplo `Triaje: ligera · Sonnet, esfuerzo bajo (ahora: Opus) → /model sonnet`. **De envergadura** (varios pasos o archivos, diseño, riesgo real): 3-5 líneas con tamaño, riesgo, qué delegas y qué haces tú. Las partes mecánicas (buscar en el código, leer muchos archivos, resumir) hazlas con subagentes de un modelo más barato, como Haiku.',
  '',
  'Criterio: Haiku para consultas, cambios mecánicos, documentación y búsquedas; Sonnet para implementación y depuración normales; Opus para diseño difícil, depuración sin pistas, revisión crítica o mucho contexto y riesgo. Usa siempre el esfuerzo más bajo que no ponga en riesgo el resultado. No inventes costes ni cifras y respeta el modelo o esfuerzo que el usuario haya fijado.',
  '<!-- agentrelay:end -->',
].join('\n');

// Bloque de instrucciones para CLAUDE.md o AGENTS.md de cada proyecto.
export const PROJECT_BLOCK = [
  '<!-- agentrelay:start -->',
  '## Delegación con AgentRelay',
  '',
  'Este proyecto usa AgentRelay: tú eres el ORQUESTADOR (planificas, delegas, revisas y decides) y un agente ejecutor más económico (el configurado en AgentRelay) escribe el código. No edites este bloque: `agentrelay init` lo actualiza. Si eres tú el ejecutor (te han dado una tarea con `agentrelay run`), haz solo esa tarea e ignora este bloque.',
  '',
  '**Regla principal: delega por defecto.** Toda implementación que no sea trivial (crear o modificar código, tests, configuración o documentación de más de unas pocas líneas) se delega con `agentrelay run`. Escribirla tú gasta tu consumo, que es justo lo que AgentRelay quiere ahorrar. Hazla tú solo si es trivial (1-3 líneas), una decisión de diseño, algo sensible o una tarea ya escalada; y en ese caso di en una línea por qué no delegas.',
  '',
  '**Antes de delegar, ¿lo resuelve un script?** Si la tarea es repetitiva, masiva o mecánica (renombrados, conversiones, migraciones, recuentos, extracción de datos, informes) y un script la hace de forma fiable y más barata que procesarla con tokens, escribe el script y ejecútalo, sin delegarla a un ejecutor ni hacerla a mano. No lo montes para algo de pocas líneas ni de un solo uso donde escribirlo cueste más que hacerlo.',
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
  '   `context` debe bastar para que el ejecutor trabaje sin preguntarte: stack, convenciones y decisiones ya tomadas. Opcionalmente, `effort` (low, medium, high, xhigh) y `model` ajustan el esfuerzo y el modelo solo para esa tarea: esfuerzo bajo en las sencillas, alto en las difíciles.',
  '',
  '### Cómo revisar',
  '',
  '- Lee `agentrelay show <id>` (informe, incidencias y dudas) y el diff completo. Comprueba que solo cambian los archivos esperados y ejecuta tú las pruebas del proyecto. La autorrevisión del ejecutor no sustituye la tuya.',
  '- Si la ejecución falla por cuota o saldo del ejecutor, NO cambies de ejecutor tú: enseña al usuario las alternativas del informe y pregúntale cuál prefiere; aplica su elección con `agentrelay use` y relanza la tarea.',
  '- Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos) y confirma con `agentrelay list` que el estado cambió.',
  '- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.',
  '- Tras aceptar, haz el commit. No hagas push sin aprobación del usuario y no digas «hecho» ni «aceptado» sin haberlo comprobado.',
  '',
  '### Otros',
  '',
  '- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.',
  '- **En Windows (PowerShell o cmd)** usa `agentrelay.cmd` en lugar de `agentrelay` (el segundo es un script de Unix y falla con errores de `sed`, `dirname` o `uname`). Nunca modifiques ese script. El `<<EOF` no existe en PowerShell: guarda el JSON de la tarea en un archivo temporal FUERA del repositorio (por ejemplo `$env:TEMP\\tarea.json`) y lanza `agentrelay.cmd run $env:TEMP\\tarea.json`; un archivo dentro del repositorio ensuciaría el árbol.',
  '- Si una ejecución falla por una causa externa (sesión caducada, PowerShell bloqueado), díselo al usuario en lugar de hacer el trabajo tú en silencio.',
  '<!-- agentrelay:end -->',
].join('\n');

// Bloque del AGENTS.md que crea `init` cuando el ejecutor no lee CLAUDE.md: remite a
// CLAUDE.md en lugar de copiar sus normas, que así nunca quedan anticuadas.
export const EXECUTOR_HEADING = '## Normas del proyecto para el ejecutor (AgentRelay)';
export const EXECUTOR_BLOCK = [
  START_MARK,
  EXECUTOR_HEADING,
  '',
  'Las normas de este proyecto están en `CLAUDE.md`. Léelo entero antes de empezar y síguelo. Ignora en él la sección «Delegación con AgentRelay»: tú eres el ejecutor, no el orquestador; haz solo la tarea que te han dado y no ejecutes `agentrelay`.',
  END_MARK,
].join('\n');

/** True si el texto lleva el bloque de ejecutor (el que remite a CLAUDE.md) en lugar del de orquestación. */
export function hasExecutorBlock(text) {
  return text.includes(EXECUTOR_HEADING);
}

/** Estado del bloque que corresponde a ese archivo: el de ejecutor si lo lleva, y si no el de orquestación. */
export function projectBlockStatus(file) {
  const executor = existsSync(file) && hasExecutorBlock(readFileSync(file, 'utf8'));
  return blockStatus(file, executor ? EXECUTOR_BLOCK : PROJECT_BLOCK);
}

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

// Cuántos caracteres de CLAUDE.md se incluyen como máximo en el prompt de una tarea.
const PROJECT_RULES_MAX_CHARS = 20000;

// Ejecutores que, sin AGENTS.md, recurren a CLAUDE.md por su cuenta (OpenCode
// lo hace; Codex solo lee AGENTS.md).
const READS_CLAUDE_MD = new Set(['opencode']);

/**
 * Normas del proyecto que el ejecutor no vería por sí solo: el contenido propio
 * de CLAUDE.md (sin el bloque de AgentRelay ni la línea `@AGENTS.md`) cuando no
 * existe AGENTS.md y el ejecutor no lee CLAUDE.md. Devuelve `null` si no hay
 * nada que aportar; en otro caso `{ source, text }`.
 */
export function projectRulesForExecutor(root, executorType) {
  const agentsFile = path.join(root, 'AGENTS.md');
  const claudeFile = path.join(root, 'CLAUDE.md');
  if (READS_CLAUDE_MD.has(executorType) || existsSync(agentsFile) || !existsSync(claudeFile)) return null;
  let text = readFileSync(claudeFile, 'utf8');
  try {
    text = removeBlock(text).text;
  } catch {
    // Marcas incoherentes: se usa el texto tal cual antes que perder las normas.
  }
  text = text.replace(/^[ \t]*@AGENTS\.md[ \t]*\r?$/gm, '').replace(/^﻿/, '').trim();
  if (text === '') return null;
  const truncated = text.length > PROJECT_RULES_MAX_CHARS;
  return { source: 'CLAUDE.md', text: truncated ? `${text.slice(0, PROJECT_RULES_MAX_CHARS)}\n... (truncated; read CLAUDE.md for the rest)` : text };
}

/** Aviso para el usuario cuando AgentRelay tiene que inyectar CLAUDE.md en las tareas; `null` si no hace falta. */
export function executorInstructionsNotice(root, executorType) {
  const rules = projectRulesForExecutor(root, executorType);
  if (!rules) return null;
  return `El ejecutor ${executorType} no lee CLAUDE.md y no hay AGENTS.md: AgentRelay incluirá el contenido de CLAUDE.md en el prompt de cada tarea. Si prefieres que el ejecutor lo lea de AGENTS.md, ejecuta agentrelay init para crear un AGENTS.md que remita a CLAUDE.md.`;
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
    'También se añadirá el hook de delegación de Claude Code, que recuerda delegar al editar código.',
    'Para retirar el bloque, los comandos y el hook de Claude Code, ejecuta "agentrelay setup --uninstall".',
  ];
}

/** Explica la instalación del bloque de instrucciones de AgentRelay en un proyecto. */
export function initExplanation(file, { importOnly = false, executor = false } = {}) {
  if (executor) {
    return `Se creará o actualizará ${file} con un bloque que remite a CLAUDE.md (entre ${START_MARK} y ${END_MARK}; el resto del archivo se conserva) para que el ejecutor, que no lee CLAUDE.md, siga las normas del proyecto.`;
  }
  if (importOnly) {
    return `Se creará ${file} con la línea @AGENTS.md para que Claude Code utilice las instrucciones compartidas de AGENTS.md.`;
  }
  return `Se añadirá o actualizará el bloque de instrucciones de AgentRelay en ${file} (solo entre ${START_MARK} y ${END_MARK}; el resto del archivo se conserva) para que el orquestador sepa cómo delegar en este proyecto. Para quitarlo, elimina a mano las líneas entre las marcas.`;
}
