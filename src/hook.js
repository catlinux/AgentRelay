import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { START_MARK } from './instructions.js';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const REMINDER_INTERVAL_MS = 15 * 60 * 1000;
const REMINDER = 'AgentRelay: este proyecto delega la implementación. Si el cambio no es trivial (más de unas pocas líneas), delégalo con `agentrelay run` en lugar de editarlo tú; hazlo tú solo si es trivial, una decisión de diseño o algo sensible, y di en una línea por qué no delegas.';

/** Decide si corresponde mostrar el recordatorio de delegación. */
export function hookDecision({ input, now, readMarker, writeMarker, usesAgentRelay }) {
  try {
    const event = typeof input === 'string' ? JSON.parse(input) : input;
    if (!event || !EDIT_TOOLS.has(event.tool_name)) return null;
    const cwd = event.cwd;
    if (typeof cwd !== 'string' || !usesAgentRelay(cwd)) return null;

    const sessionId = String(event.session_id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const previous = Number(readMarker(sessionId));
    if (Number.isFinite(previous) && now - previous < REMINDER_INTERVAL_MS) return null;

    writeMarker(sessionId, now);
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: REMINDER } };
  } catch {
    return null;
  }
}

/** Comprueba los archivos de instrucciones del proyecto sin propagar errores. */
export function projectUsesAgentRelay(cwd) {
  try {
    return ['AGENTS.md', 'CLAUDE.md'].some((name) => {
      const file = path.join(cwd, name);
      return existsSync(file) && readFileSync(file, 'utf8').includes(START_MARK);
    });
  } catch {
    return false;
  }
}
