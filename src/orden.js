// agentrelay orden: ver y cambiar en qué orden prueba el enrutado automático las IA.
//
//   agentrelay orden                          muestra el orden actual
//   agentrelay orden gratis <a> [<b> …]       gratuitos de OpenCode Go, en ese orden
//   agentrelay orden pago <nombre>            la IA de pago (por defecto, DeepSeek Flash de Go)
//   agentrelay orden pago <a> <b> …           varias, en ese orden (si falla la última, se detiene y pregunta)
//   agentrelay orden reset                    vuelve al orden por defecto

import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { agentrelayHome, loadConfig } from './config.js';
import { CATALOGO, nombreDeRuta, resolverGratuito, resolverPago } from './catalogo-ia.js';
import { archivoUsuario, escribirAjustesUsuario } from './config-usuario.js';
import { hasApiProfile } from './executors/codex.js';
import { getQuotaState } from './quota-state.js';
import { resumenGasto } from './gasto.js';
import { routeEntries } from './router.js';

const hora = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function estadoDe(entry, now) {
  if (entry.api && !hasApiProfile()) return 'sin configurar (agentrelay login --api)';
  const quota = getQuotaState(entry.quotaId, { home: agentrelayHome(), now });
  if (quota.state === 'available') return 'disponible';
  const hasta = new Date(quota.state === 'unknown' ? quota.nextProbe : quota.until);
  const dia = hasta.toDateString() === now.toDateString() ? '' : `${hasta.getDate()}/${hasta.getMonth() + 1} `;
  return `agotado hasta ${dia}${hora(hasta)}`;
}

function cantidad(n) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, notation: n >= 10000 ? 'compact' : 'standard' }).format(n); }

function gastoTexto(route, now) {
  const { hoy, total } = resumenGasto(route, { now });
  if (!total.intentos) return 'sin uso registrado';
  const parte = (dato) => `${dato.intentos} intentos, ${cantidad(dato.inputTokens + dato.outputTokens)} tokens (${cantidad(dato.inputTokens)}/${cantidad(dato.outputTokens)})${dato.coste > 0 ? `, $${dato.coste.toFixed(4)}` : ''}`;
  return `hoy: ${parte(hoy)} · total: ${parte(total)}`;
}

function mostrar(loaded, out, now = new Date()) {
  const { routing } = loaded.config;
  out(`Orden del enrutado (routing.mode: ${routing.mode})`);
  if (routing.mode !== 'auto') {
    out('  El enrutado está apagado: se usa solo el ejecutor de "agentrelay use". Para activarlo: agentrelay set routing auto');
  }
  const gratis = new Set((routing.freeOrder ?? []).map((spec) => spec.replace(/^opencode:/, '')));
  routeEntries({ config: loaded.config }).forEach((entry, index) => {
    const tipo = entry.paid ? 'de pago' : 'gratis';
    const estado = estadoDe(entry, now);
    const spec = entry.api ? `codex-api:${entry.model}` : entry.type === 'opencode' ? `opencode:${entry.model}` : null;
    const nombre = entry.type === 'antigravity' ? `Antigravity · cuenta de Google (${entry.model === 'auto' ? 'Gemini' : entry.model})`
      : spec && !gratis.has(entry.model) ? nombreDeRuta(spec) : (entry.type === 'codex' && !entry.api ? 'Luna · cuenta de ChatGPT (Codex)' : entry.model);
    out(`  ${index + 1}. ${nombre} · ${tipo} · ${estado} · ${gastoTexto(entry.key, now)}`);
  });
  out('');
  out('Cambiar:');
  out('  agentrelay orden gratis <nombre> [<nombre> …]  gratuitos tras Luna: antigravity[:modelo] (cuenta de Google) o modelos -free de OpenCode Go');
  out('  agentrelay cuota                                cuánto queda de cada gratuita y cuándo se renueva');
  out('  agentrelay orden pago <nombre>                  la IA de pago (si falla, la tarea se detiene y se pregunta qué hacer)');
  out('  agentrelay orden pago <a> <b> …                 varias de pago, en ese orden');
  out('  agentrelay orden reset                          orden por defecto');
  out('Nombres de pago: ' + CATALOGO.filter((item) => item.ruta).map((item) => item.id).join(', '));
}

function avisarProyecto(loaded, claves, out) {
  for (const clave of claves) {
    const origen = loaded.origins?.[clave];
    if (origen && path.isAbsolute(origen) && path.resolve(origen) !== path.resolve(archivoUsuario())) {
      out(`Aviso: ${origen} fija ${clave} y anula este cambio en ese proyecto.`);
    }
  }
}

export async function cmdOrden(positionals, values, runtime = {}) {
  const out = runtime.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = runtime.err ?? ((text) => process.stderr.write(`${text}\n`));
  const opts = { cwd: path.resolve(values.cwd || process.cwd()), configPath: values.config };
  const [accion, ...nombres] = positionals;

  try {
    if (!accion) {
      let loaded = loadConfig(opts);
      mostrar(loaded, out, runtime.now);
      const interactivo = runtime.interactivo === true || (runtime.interactivo !== false && process.stdin.isTTY && process.stdout.isTTY);
      if (interactivo) {
        const opciones = CATALOGO.filter((item) => item.ruta);
        const rl = runtime.preguntar ? null : createInterface({ input: process.stdin, output: process.stdout });
        try {
          opciones.forEach((item, i) => out(`  ${i + 1}. ${item.nombre} · ${item.coste}`));
          const respuesta = (await (runtime.preguntar ?? ((prompt) => rl.question(prompt)))('Elige la IA de pago (número, o Enter para salir): ')).trim();
          if (respuesta) {
            const n = Number(respuesta);
            if (!Number.isInteger(n) || n < 1 || n > opciones.length) out('Número inválido.');
            else {
              loaded = escribirAjustesUsuario([['routing.paidOrder', [resolverPago(opciones[n - 1].id)]]], opts);
              mostrar(loaded, out, runtime.now);
              avisarProyecto(loaded, ['routing.paidOrder'], out);
            }
          }
        } finally { rl?.close(); }
      }
      return 0;
    }
    let edits;
    let claves;
    if (accion === 'reset') {
      if (nombres.length) throw new Error('Uso: agentrelay orden reset');
      edits = [['routing.freeOrder', undefined], ['routing.paidOrder', undefined]];
      claves = ['routing.freeOrder', 'routing.paidOrder'];
    } else if (accion === 'gratis') {
      if (!nombres.length) throw new Error('Uso: agentrelay orden gratis <modelo> [<modelo> …]');
      edits = [['routing.freeOrder', [...new Set(nombres.map(resolverGratuito))]]];
      claves = ['routing.freeOrder'];
    } else if (accion === 'pago') {
      if (!nombres.length) throw new Error('Uso: agentrelay orden pago <nombre> [<nombre> …]');
      edits = [['routing.paidOrder', [...new Set(nombres.map(resolverPago))]]];
      claves = ['routing.paidOrder'];
    } else {
      throw new Error(`No entiendo "${accion}". Uso: agentrelay orden [gratis <modelos> | pago <nombres> | reset]`);
    }
    const loaded = escribirAjustesUsuario(edits, opts);
    mostrar(loaded, out, runtime.now);
    avisarProyecto(loaded, claves, out);
    return 0;
  } catch (error) {
    err(error.message);
    return 1;
  }
}
