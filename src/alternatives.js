import { agentrelayHome } from './config.js';
import { isExhausted, loadQuota } from './quota-state.js';

/** Describe opciones disponibles sin cambiar la configuración del ejecutor. */
export function alternativesHint({ current, config, installed }) {
  const lines = ['Alternativas (no se cambia nada solo; elige una):'];

  const routing = config?.routing || {};
  const freeIds = (routing.freeOrder || []).map((spec) => String(spec).replace(/^opencode:/, ''));
  const quota = loadQuota(agentrelayHome());
  const now = new Date();

  if (current?.type !== 'codex') {
    lines.push('- Codex (cuenta de ChatGPT, cuota gratuita por cuenta): agentrelay use codex');
  }

  if (installed?.opencode) {
    const suggestions = freeIds
      .filter((id) => id !== current?.model)
      .filter((id) => !isExhausted(quota, id, now))
      .slice(0, 3);
    for (const id of suggestions) {
      lines.push(`- OpenCode gratis: agentrelay use opencode ${id}`);
    }
  } else {
    lines.push('- OpenCode gratis: agentrelay executors add opencode');
  }

  const currentModel = String(current?.model || '');
  if (!currentModel.toLowerCase().includes('deepseek')) {
    lines.push('- DeepSeek de pago (Flash): agentrelay use opencode opencode-go/deepseek-v4.1-flash (necesita su clave de API)');
  }

  lines.push('Cuando se renueve la cuota puedes volver con agentrelay use <ejecutor>.');
  return lines.join('\n');
}
