import { agentrelayHome } from './config.js';
import { listarCuentas } from './cuentas.js';
import { installCommand } from './executors/antigravity.js';
import { isExhausted, loadQuota } from './quota-state.js';

/**
 * Qué hacer cuando el ejecutor actual se queda sin cuota (fuera del enrutado automático).
 * Solo sugiere: nunca cambia la configuración.
 */
export function alternativesHint({ current, config, installed }) {
  const lines = ['Alternativas (no se cambia nada solo; elige una):'];
  const quota = loadQuota(agentrelayHome());
  const now = new Date();
  const agotada = (id) => isExhausted(quota, id, now);

  if (current?.type !== 'codex') {
    lines.push('- Luna (cuenta de ChatGPT, cuota gratuita): agentrelay use codex');
  } else if (listarCuentas('luna').length > 1) {
    lines.push('- Otra cuenta de ChatGPT para Luna: agentrelay cuenta');
  }

  if (current?.type !== 'antigravity' || current?.model === 'claude-sonnet-4-6') {
    if (!installed?.antigravity) {
      lines.push(`- Antigravity (cuenta de Google, cuota semanal gratuita): instálalo con ${installCommand()} y conéctalo con agentrelay login antigravity`);
    } else if (!agotada('antigravity:gemini')) {
      lines.push('- Antigravity con Gemini (cuota semanal gratuita): agentrelay use antigravity');
    }
  }
  if (installed?.antigravity && current?.model !== 'claude-sonnet-4-6' && !agotada('antigravity:claude')) {
    lines.push('- Antigravity con Claude Sonnet (otro cupo semanal gratuito): agentrelay use antigravity claude-sonnet-4-6');
  }

  const currentModel = String(current?.model || '');
  if (!currentModel.toLowerCase().includes('deepseek')) {
    lines.push('- DeepSeek de pago (Flash): agentrelay use deepseek-flash-go (necesita la suscripción de OpenCode Go)');
  }
  lines.push('Con el enrutado automático (agentrelay set routing auto) este cambio se hace solo.');
  return lines.join('\n');
}
