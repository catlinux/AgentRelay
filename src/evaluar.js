// Descubrimiento, sondeo y clasificación de modelos gratuitos de OpenCode Go.
//
// Primera parte de `agentrelay evaluar`: NO ejecuta tareas ni puntúa ni escribe
// informes. Solo descubre los modelos gratuitos disponibles en la cuenta del
// usuario, los compara con el catálogo público y con el historial anterior, y
// sondea cada uno con una llamada corta para separar fallos de infraestructura
// de fallos del propio modelo.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentrelayHome } from './config.js';
import { commandParts, buildArgs, listModels as opencodeListModels, parseOutput } from './executors/opencode.js';
import { maskSecrets } from './executors/common.js';
import { runProcess } from './proc.js';

// --- helpers internos ---

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function asText(v) {
  return String(v ?? '');
}

function normaliseId(raw) {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const id = raw.id ?? raw.model ?? raw.name;
    return typeof id === 'string' ? id.trim() : null;
  }
  return null;
}

export function esGratuito(id) {
  return typeof id === 'string' && /^opencode-go\/.+-free$/.test(id);
}

export function evaluarDir(home = agentrelayHome()) {
  return path.join(home, 'evaluar');
}

export function cargarHistorial(home = agentrelayHome()) {
  const file = path.join(evaluarDir(home), 'history.json');
  try {
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { runs: [] };
    if (!Array.isArray(data.runs)) return { runs: [] };
    return { runs: data.runs };
  } catch {
    return { runs: [] };
  }
}

function previousIdsFromRun(run) {
  const out = [];
  if (!run || typeof run !== 'object') return out;
  if (Array.isArray(run.freeOrderPrevio)) {
    out.push(...run.freeOrderPrevio.map((v) => (typeof v === 'string' ? v.replace(/^opencode:/, '') : v)));
  }
  if (run.modelos && typeof run.modelos === 'object' && !Array.isArray(run.modelos)) {
    out.push(...Object.keys(run.modelos));
  }
  return out.filter(esGratuito);
}

function normalisePublicId(id) {
  const value = normaliseId(id);
  if (!value) return null;
  const full = value.includes('/') ? value : `opencode-go/${value}`;
  return esGratuito(full) ? full : null;
}

export async function descubrirModelos({ executor, home = agentrelayHome(), fetchFn = globalThis.fetch, listModels } = {}) {
  const avisos = [];

  let rawModels = [];
  const lm = typeof listModels === 'function' ? listModels : opencodeListModels;
  if (lm) {
    try {
      rawModels = await lm(executor);
    } catch {
      rawModels = [];
    }
  }
  if (!Array.isArray(rawModels)) rawModels = [];
  const cuentaIds = rawModels
    .map((m) => normaliseId(m))
    .filter((v) => typeof v === 'string' && v.length > 0)
    .filter(esGratuito);
  const cuenta = uniqueSorted(cuentaIds);

  const historial = cargarHistorial(home);
  const runs = Array.isArray(historial.runs) ? historial.runs : [];
  const lastRun = runs.length ? runs[runs.length - 1] : null;

  let nuevos = [];
  let retirados = [];
  if (lastRun) {
    const prev = uniqueSorted(previousIdsFromRun(lastRun));
    const prevSet = new Set(prev);
    nuevos = cuenta.filter((id) => !prevSet.has(id));
    retirados = prev.filter((id) => !cuenta.includes(id));
    retirados = uniqueSorted(retirados);
  }

  let publico = null;
  if (typeof fetchFn === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      let response;
      try {
        response = await fetchFn('https://opencode.ai/inference/go/v1/models', { signal: controller.signal });
      } catch (err) {
        throw err;
      }
      let payload = response;
      if (response && typeof response === 'object' && typeof response.json === 'function') {
        if (response.ok === false) {
          throw new Error('El catálogo público no respondió correctamente');
        }
        payload = await response.json();
      }
      let list = [];
      if (Array.isArray(payload)) list = payload;
      else if (payload && Array.isArray(payload.data)) list = payload.data;
      else if (payload && Array.isArray(payload.models)) list = payload.models;
      else if (payload && Array.isArray(payload.items)) list = payload.items;

      const publicIds = [];
      for (const item of list) {
        const normalized = normalisePublicId(item);
        if (normalized) publicIds.push(normalized);
      }
      publico = uniqueSorted(publicIds);

      for (const id of publico) {
        if (!cuenta.includes(id)) {
          avisos.push(`el catálogo público lista ${id} que tu cuenta no tiene`);
        }
      }
    } catch (err) {
      publico = null;
      avisos.push(`No se pudo consultar el catálogo público: ${asText(err && err.message ? err.message : err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return { cuenta, publico, nuevos, retirados, avisos };
}

export function seleccionarModelos(cuenta, pedidos) {
  const lista = Array.isArray(cuenta) ? cuenta : [];
  if (!pedidos || (Array.isArray(pedidos) && pedidos.length === 0)) {
    return Array.isArray(cuenta) ? [...cuenta] : cuenta;
  }
  const result = Array.isArray(pedidos) ? [...pedidos] : [pedidos];
  for (const id of result) {
    if (typeof id !== 'string' || !esGratuito(id) || !lista.includes(id)) {
      throw new Error(`solo se pueden evaluar modelos gratuitos -free de tu cuenta de OpenCode Go: ${id}`);
    }
  }
  return result;
}

export function clasificarFallo({ texto, timedOut = false, exitCode, hadEvents = false } = {}) {
  const value = asText(texto);
  const cuota = /quota|usage limit|rate.?limit|429|insufficient (?:quota|credit|balance)|(?:quota|limit|credit)s? exceeded/i.test(value);
  const sinSesion = /not authenticated|unauthorized|401|login|credential/i.test(value);
  const modeloNoDisp = /model.*(not found|unavailable|does not exist|deprecated)|404|410/i.test(value);
  const red = /ECONN|ENOTFOUND|ETIMEDOUT|network|fetch failed|socket/i.test(value);

  if (cuota) return { tipo: 'infraestructura', causa: 'cuota' };
  if (sinSesion) return { tipo: 'infraestructura', causa: 'sin-sesion' };
  if (modeloNoDisp) return { tipo: 'infraestructura', causa: 'modelo-no-disponible' };
  if (red) return { tipo: 'infraestructura', causa: 'red' };
  if (timedOut && !hadEvents) return { tipo: 'infraestructura', causa: 'tiempo' };
  if (hadEvents) return { tipo: 'modelo', causa: 'otro' };
  return { tipo: 'infraestructura', causa: 'otro' };
}

export async function sondear({ executor, modelo, run = runProcess, timeoutMs = 90000 } = {}) {
  const inicio = Date.now();
  let tempDir = null;
  try {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-evaluar-'));
    const [command, ...prefix] = commandParts(executor?.command);
    const adapted = { ...(executor || {}), model: modelo };
    const args = [...prefix, ...buildArgs(adapted, 'Responde solo con la palabra OK.')];

    const res = await run(command, args, {
      cwd: tempDir,
      env: { PWD: tempDir },
      timeoutMs,
    });

    const combined = `${res?.stdout ?? ''}\n${res?.stderr ?? ''}`;
    const parsed = parseOutput(combined);
    const hadEvents = asText(parsed?.text).trim().length > 0;
    const ok = res?.code === 0 && hadEvents;

    const segundos = typeof res?.durationMs === 'number'
      ? res.durationMs / 1000
      : (Date.now() - inicio) / 1000;
    const tokens = {
      entrada: parsed?.usage?.inputTokens ?? 0,
      salida: parsed?.usage?.outputTokens ?? 0,
      cache: (parsed?.usage?.cacheReadTokens ?? 0) + (parsed?.usage?.cacheWriteTokens ?? 0),
    };
    const coste = parsed?.usage?.totalCost ?? 0;

    if (ok) {
      return { ok: true, segundos, tokens, coste, fallo: null };
    }

    let mensaje;
    if (res?.error) {
      mensaje = res.error.code === 'ENOENT'
        ? `No se encuentra el ejecutor "${command}".`
        : asText(res.error.message || res.error);
    } else if (res?.timedOut) {
      mensaje = `El ejecutor ha superado el tiempo máximo.`;
    } else {
      mensaje = (parsed?.errors || []).join('\n')
        || asText(res?.stderr).trim()
        || `El ejecutor terminó con código ${res?.code}`;
    }

    const fallo = clasificarFallo({
      texto: combined,
      timedOut: Boolean(res?.timedOut),
      exitCode: res?.code,
      hadEvents,
    });

    return {
      ok: false,
      segundos,
      tokens,
      coste,
      fallo: {
        tipo: fallo.tipo,
        causa: fallo.causa,
        mensaje: maskSecrets(mensaje),
      },
    };
  } catch (err) {
    return {
      ok: false,
      segundos: (Date.now() - inicio) / 1000,
      tokens: { entrada: 0, salida: 0, cache: 0 },
      coste: 0,
      fallo: {
        tipo: 'infraestructura',
        causa: 'otro',
        mensaje: maskSecrets(asText(err && err.message ? err.message : err)),
      },
    };
  } finally {
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* se ignora */ }
    }
  }
}
