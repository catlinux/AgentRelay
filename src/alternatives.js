import { isFreeModel } from './model-check.js';
import { rankedFree, rankPosition } from './free-ranking.js';

/** Describe opciones disponibles sin cambiar la configuración del ejecutor. */
export function alternativesHint({ current, checks, installed }) {
  const lines = ['Alternativas (no se cambia nada solo; elige una):'];

  if (current?.type !== 'codex') {
    lines.push('- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex');
  }

  if (installed?.opencode) {
    const rankingExists = Array.isArray(checks?.ranking?.entries);
    const ranked = rankedFree(checks)
      .filter(({ id }) => id !== current?.model)
      .slice(0, 3);
    if (rankingExists) {
      for (const { id } of ranked) {
        lines.push(`- OpenCode gratis (nº ${rankPosition(checks, id)} del ranquing): agentrelay use opencode ${id}`);
      }
    } else if (current?.type !== 'opencode') {
      const approved = Object.entries(checks?.models || {})
        .filter(([id, record]) => isFreeModel(id) && record?.status === 'approved')
        .sort((a, b) => (Date.parse(b[1].checkedAt) || 0) - (Date.parse(a[1].checkedAt) || 0))
        .slice(0, 3);
      if (approved.length) {
        for (const [id] of approved) lines.push(`- OpenCode gratis, probado: agentrelay use opencode ${id}`);
      } else {
        lines.push('- OpenCode gratis: agentrelay executors check (prueba los modelos nuevos) y luego agentrelay use opencode');
      }
    }
  } else if (current?.type !== 'opencode') {
    lines.push('- OpenCode gratis: agentrelay executors add opencode');
  }

  if (current?.type !== 'cline') {
    lines.push('- DeepSeek de pago (Flash): agentrelay use cline deepseek-v4-flash (necesita su clave de API)');
  }

  lines.push('Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>.');
  return lines.join('\n');
}
