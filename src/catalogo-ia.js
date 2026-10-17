// Catálogo de IA con nombres cortos y claros, para elegirlas sin recordar ids largos:
// `agentrelay use deepseek-flash-go` y `agentrelay orden pago deepseek-pro-go luna-go`.

const esGratuito = (id) => /^opencode-go\/.+-free$/.test(id);

/**
 * ejecutor: lo que `agentrelay use <nombre>` escribe en executor.type/model (null si no se puede usar como ejecutor fijo).
 * ruta: entrada para routing.paidOrder ("tipo:modelo"); null si no va en esa lista.
 */
export const CATALOGO = [
  {
    id: 'luna-chatgpt', nombre: 'Luna · cuenta de ChatGPT (Codex)', coste: 'gratis',
    ejecutor: { type: 'codex', model: 'gpt-6-luna' }, ruta: null,
    nota: 'Siempre va la primera en el enrutado automático, mientras haya cuota.',
  },
  {
    id: 'luna-go', nombre: 'Luna · suscripción de OpenCode Go', coste: 'suscripción Go',
    ejecutor: { type: 'opencode', model: 'opencode-go/gpt-6-luna' }, ruta: 'opencode:opencode-go/gpt-6-luna',
  },
  {
    id: 'luna-api', nombre: 'Luna · API de OpenAI (Codex)', coste: 'de pago, sin tope de gasto',
    ejecutor: null, ruta: 'codex-api:gpt-6-luna',
    nota: 'Necesita la clave guardada con: agentrelay login --api',
  },
  {
    id: 'deepseek-flash-go', nombre: 'DeepSeek Flash · suscripción de OpenCode Go', coste: 'suscripción Go',
    ejecutor: { type: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' }, ruta: 'opencode:opencode-go/deepseek-v4.1-flash',
  },
  {
    id: 'deepseek-pro-go', nombre: 'DeepSeek Pro · suscripción de OpenCode Go', coste: 'suscripción Go',
    ejecutor: { type: 'opencode', model: 'opencode-go/deepseek-v4-pro' }, ruta: 'opencode:opencode-go/deepseek-v4-pro',
  },
  {
    id: 'deepseek-flash-api', nombre: 'DeepSeek Flash · API directa de DeepSeek', coste: 'de pago (saldo de DeepSeek)',
    ejecutor: { type: 'opencode', model: 'deepseek/deepseek-flash' }, ruta: 'opencode:deepseek/deepseek-flash',
  },
  {
    id: 'deepseek-pro-api', nombre: 'DeepSeek Pro · API directa de DeepSeek', coste: 'de pago (saldo de DeepSeek)',
    ejecutor: { type: 'opencode', model: 'deepseek/deepseek-v4-pro' }, ruta: 'opencode:deepseek/deepseek-v4-pro',
  },
];

export const porId = (id) => CATALOGO.find((item) => item.id === String(id).toLowerCase()) ?? null;

/** Nombre claro de una entrada "tipo:modelo" de routing, o la propia entrada si no está en el catálogo. */
export function nombreDeRuta(spec) {
  return CATALOGO.find((item) => item.ruta === spec)?.nombre ?? spec;
}

/** Atajo de `use`: devuelve { type, model } o lanza un error con la explicación. */
export function ejecutorDeAtajo(id) {
  const item = porId(id);
  if (!item) return null;
  if (!item.ejecutor) {
    throw new Error(`${item.nombre} no se puede fijar como ejecutor con use. ${item.nota ?? ''} Para ponerla en el enrutado: agentrelay orden pago ${item.id}`.trim());
  }
  return item.ejecutor;
}

/** Entrada de routing.paidOrder a partir de un nombre del catálogo, de "tipo:modelo" o de un id "proveedor/modelo". */
export function resolverPago(texto) {
  const valor = String(texto).trim();
  const item = porId(valor);
  if (item) {
    if (!item.ruta) throw new Error(`${item.id} es la cuota gratuita de ChatGPT: va siempre primera y no se pone en la lista de pago.`);
    return item.ruta;
  }
  if (/^(opencode|codex|codex-api):\S+$/.test(valor)) return valor;
  if (/^[\w.-]+\/\S+$/.test(valor)) return `opencode:${valor}`;
  throw new Error(`No conozco "${valor}". Nombres válidos: ${CATALOGO.filter((c) => c.ruta).map((c) => c.id).join(', ')} (o un id como opencode-go/glm-5.3).`);
}

/** Entrada de routing.freeOrder: solo modelos gratuitos de OpenCode Go (acepta "cat-jam", "cat-jam-free" o el id completo). */
export function resolverGratuito(texto) {
  const gemini = /^gemini(?::(\S+))?$/.exec(String(texto).trim());
  if (gemini) return `gemini:${gemini[1] || 'auto'}`;
  let valor = String(texto).trim().replace(/^opencode:/, '');
  if (!valor.includes('/')) valor = `opencode-go/${valor.endsWith('-free') ? valor : `${valor}-free`}`;
  if (!esGratuito(valor)) {
    throw new Error(`"${texto}" no es un modelo gratuito de OpenCode Go (los gratuitos terminan en -free). Para modelos de pago usa: agentrelay orden pago ${texto}`);
  }
  return `opencode:${valor}`;
}
