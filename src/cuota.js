// `agentrelay cuota`: estado en directo de las IA gratuitas (cuánto queda y cuándo se renueva).
//
// Luna se consulta en directo al servidor local de Codex, sin gastar peticiones del modelo.
// Antigravity y los gratuitos de OpenCode no publican su cuota fuera de su propia ventana: de ellos
// solo se sabe lo que dejó registrado el último error (src/quota-state.js).

import { loadConfig } from './config.js';
import { readRateLimits } from './executors/codex.js';
import { correoLuna, cuentaActiva, entornoCuenta, listarCuentas, PRINCIPAL, quotaIdCuenta } from './cuentas.js';
import { quotaGroup } from './executors/antigravity.js';
import { getQuotaState } from './quota-state.js';

const pad = (n) => String(n).padStart(2, '0');

/** "hoy 14:05", "mañana 09:00" o "lun 20/10 09:00", en hora local. */
export function formatReset(iso, now = new Date()) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(date) - day(now)) / 86_400_000);
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `mañana ${time}`;
  const weekday = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][date.getDay()];
  return `${weekday} ${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
}

function windowName(minutes) {
  if (minutes === 300) return '5 h';
  if (minutes === 10_080) return 'semanal';
  if (minutes === 1440) return 'diaria';
  if (!minutes) return 'ventana';
  return minutes % 1440 === 0 ? `${minutes / 1440} días` : minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

function recordedState(quotaId, now) {
  const state = getQuotaState(quotaId, { now });
  if (state.state === 'exhausted') return { exhausted: true, resetAt: state.until.toISOString(), note: 'agotada según el último error' };
  if (state.state === 'unknown') return { exhausted: true, resetAt: state.nextProbe.toISOString(), note: 'agotada; se vuelve a probar' };
  return null;
}

/**
 * Estado de cada IA gratuita: { id, nombre, ok, mensaje, ventanas: [{ nombre, quedaPct, quedan, limite, resetAt }], registro }.
 * `readers` permite sustituir las consultas en las pruebas.
 */
export async function collectQuotas({ config, now = new Date(), readers = {} } = {}) {
  const readLuna = readers.luna ?? ((cuenta) => readRateLimits(config.executor.type === 'codex' ? config.executor : { command: 'codex' }, { env: entornoCuenta('luna', cuenta) }));
  const cuentas = readers.cuentas ?? ((servicio) => listarCuentas(servicio));
  const activa = readers.activa ?? ((servicio) => cuentaActiva(servicio));
  const correo = readers.correo ?? ((servicio, cuenta) => correoLuna(cuenta));
  // Con varias cuentas se muestra el correo de cada una y cuál está en uso.
  const etiqueta = (servicio, cuenta) => {
    if (cuentas(servicio).length < 2) return '';
    return ` · ${correo(servicio, cuenta) || cuenta}${cuenta === activa(servicio) ? ' (en uso)' : ''}`;
  };
  const result = [];

  for (const cuenta of cuentas('luna')) {
    const luna = await readLuna(cuenta);
    result.push({
      id: cuenta === PRINCIPAL ? 'luna' : `luna@${cuenta}`,
      nombre: `Luna · cuenta de ChatGPT (Codex)${etiqueta('luna', cuenta)}`,
      ok: luna.ok,
      mensaje: luna.ok ? (luna.plan ? `plan ${luna.plan}` : '') : luna.message,
      ventanas: luna.ok ? luna.windows.map((w) => ({
        nombre: windowName(w.windowMinutes), quedaPct: w.usedPercent == null ? null : Math.max(0, 100 - w.usedPercent), resetAt: w.resetAt,
      })) : [],
      registro: recordedState(quotaIdCuenta('luna', cuenta), now),
    });
  }

  // Antigravity no ofrece consulta de cuota fuera de su ventana: se muestra lo registrado y cómo verla.
  const agyGroups = [...new Set((config.routing?.freeOrder ?? []).filter((spec) => spec.startsWith('antigravity:'))
    .map((spec) => quotaGroup(spec.slice('antigravity:'.length))))];
  for (const group of agyGroups) {
    result.push({
      id: `antigravity:${group}`,
      nombre: `Antigravity · cuenta de Google (${group === 'claude' ? 'cupo de Claude y GPT' : 'cupo de Gemini'})`,
      ok: false,
      mensaje: 'cuota semanal; para ver el porcentaje exacto abre agy y escribe /usage',
      ventanas: [],
      registro: recordedState(`antigravity:${group}`, now),
    });
  }

  for (const spec of config.routing?.freeOrder ?? []) {
    if (!spec.startsWith('opencode:')) continue;
    const model = spec.slice('opencode:'.length);
    result.push({
      id: spec, nombre: `${model} (OpenCode)`, ok: false, mensaje: 'no publica su cuota; solo se sabe cuándo falla', ventanas: [],
      registro: recordedState(model, now),
    });
  }
  return result;
}

export function renderQuotas(quotas, now = new Date()) {
  const lines = ['Cuota de las IA gratuitas (consulta en directo, no gasta peticiones):', ''];
  for (const item of quotas) {
    lines.push(`${item.nombre}${item.mensaje ? ` — ${item.mensaje}` : ''}`);
    for (const w of item.ventanas) {
      const amount = w.quedan != null && w.limite ? ` (${w.quedan} de ${w.limite})` : '';
      const reset = w.resetAt ? `, se renueva ${formatReset(w.resetAt, now)}` : '';
      const pct = w.quedaPct == null ? '¿?' : `${w.quedaPct} %`;
      lines.push(`  ${w.quedaPct === 0 ? '✖' : '✔'} ${w.nombre}: queda ${pct}${amount}${reset}`);
    }
    if (item.registro) lines.push(`  ✖ ${item.registro.note} hasta ${formatReset(item.registro.resetAt, now)}`);
    if (!item.ventanas.length && !item.registro && !item.ok) lines.push(item.id.startsWith('antigravity:') ? '  ✔ sin agotar según AgentRelay' : '  · estado desconocido');
    lines.push('');
  }
  return lines.join('\n');
}

export async function cmdCuota(positionals, values, { readers } = {}) {
  const { config } = loadConfig({ cwd: values.cwd || process.cwd(), configPath: values.config });
  const quotas = await collectQuotas({ config, readers });
  if (values.json) process.stdout.write(`${JSON.stringify(quotas, null, 2)}\n`);
  else process.stdout.write(renderQuotas(quotas));
  return 0;
}
