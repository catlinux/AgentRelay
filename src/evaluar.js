// Descubrimiento, sondeo y clasificación de modelos gratuitos de OpenCode Go.
//
// Primera parte de `agentrelay evaluar`: NO ejecuta tareas ni puntúa ni escribe
// informes. Solo descubre los modelos gratuitos disponibles en la cuenta del
// usuario, los compara con el catálogo público y con el historial anterior, y
// sondea cada uno con una llamada corta para separar fallos de infraestructura
// de fallos del propio modelo.

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentrelayHome, loadConfig, merge, DEFAULT_CONFIG } from './config.js';
import { commandParts, buildArgs, listModels as opencodeListModels, parseOutput } from './executors/opencode.js';
import { maskSecrets } from './executors/common.js';
import { runProcess } from './proc.js';
import { normalizeTask } from './task.js';
import { startRun as startRunRealImported } from './orchestrator.js';
import { escribirFixture, TAREAS } from './evaluar-tareas.js';
import { loadState, listRunIds } from './store.js';
import { diffFromBase, head as gitHead, commitAll as gitCommitAll } from './git.js';
import { scopeViolations } from './validate.js';

const NODE = process.execPath;
const startRunReal = startRunRealImported;
const ACTIVE_TEMP_DIRS = new Set();

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

function normalizePath(p) {
  return String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function round1(x) {
  return Math.round((Number(x) || 0) * 10) / 10;
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
    ACTIVE_TEMP_DIRS.add(tempDir);
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
    ACTIVE_TEMP_DIRS.delete(tempDir);
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* se ignora */ }
    }
  }

  return null;
}
function minimalEnv() {
  return {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    // runProcess mezcla con process.env: sin esto, bajo `node --test` el hijo no ejecutaría nada y saldría con 0.
    NODE_TEST_CONTEXT: undefined,
  };
}

function evaluateReportCheck(report, rc) {
  if (!rc) return true;
  const fields = Array.isArray(rc.fields) ? rc.fields : (rc.fields ? [rc.fields] : []);
  const pattern = rc.pattern;
  if (fields.length === 0) return true;
  return fields.some((field) => {
    if (!report || typeof report !== 'object') return false;
    const val = report[field];
    if (pattern) {
      const low = String(pattern).toLowerCase();
      if (Array.isArray(val)) return val.some((item) => String(item).toLowerCase().includes(low));
      if (typeof val === 'string') return val.toLowerCase().includes(low);
      if (typeof val === 'boolean') {
        if (field === 'needsEscalation' && val === true) return true;
        return false;
      }
      return false;
    }
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim().length > 0;
    if (typeof val === 'boolean') return val === true;
    return false;
  });
}

export async function ejecutarTarea({ executor, modelo, tarea, startRun = startRunReal, tmpBase = os.tmpdir() } = {}) {
  const dir = mkdtempSync(path.join(tmpBase, 'agentrelay-evaluar-'));
  const diffTmp = mkdtempSync(path.join(os.tmpdir(), 'agentrelay-evaluar-diff-'));
  ACTIVE_TEMP_DIRS.add(dir);
  ACTIVE_TEMP_DIRS.add(diffTmp);
  let result;
  try {
    escribirFixture(dir);
    await runProcess('git', ['init'], { cwd: dir, windowsShell: false });
    await runProcess('git', ['config', 'user.name', 'AgentRelay Evaluar'], { cwd: dir, windowsShell: false });
    await runProcess('git', ['config', 'user.email', 'agentrelay-evaluar@example.invalid'], { cwd: dir, windowsShell: false });
    await gitCommitAll(dir, 'base');
    const baseHead = await gitHead(dir);

    const task = normalizeTask({ ...(tarea && tarea.task ? tarea.task : {}), title: tarea && tarea.titulo ? tarea.titulo : (tarea && tarea.task && tarea.task.title) });
    const config = merge(DEFAULT_CONFIG, {
      executor: { ...(executor || {}), type: 'opencode', model: modelo, timeoutSeconds: 300 },
      routing: { mode: 'off' },
      policy: { maxRetries: 1 },
      validation: { commands: [], timeoutSeconds: 120 },
    });

    let state = null;
    let thrown = null;
    try {
      state = await startRun({ root: dir, task, config, allowDirty: true });
    } catch (err) {
      thrown = err;
      try {
        const ids = listRunIds(dir);
        if (ids.length) state = loadState(dir, ids[ids.length - 1]);
      } catch { /* se ignora */ }
    }
    if (!state || typeof state !== 'object') state = { attempts: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCost: 0 } };

    let changed = [];
    try {
      const diff = await diffFromBase(dir, baseHead, diffTmp);
      changed = (diff.files || []).map((f) => f.path).filter((p) => {
        const n = normalizePath(p);
        return n !== '' && !n.startsWith('.agentrelay/') && n !== '.agentrelay';
      });
    } catch { /* se ignora */ }

    const hidden = (tarea && tarea.hidden && typeof tarea.hidden === 'object') ? tarea.hidden : {};
    for (const [rel, content] of Object.entries(hidden)) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content, 'utf8');
    }

    const testRes = await runProcess(NODE, ['--test'], { cwd: dir, env: minimalEnv(), timeoutMs: 120000, windowsShell: false });
    const ocultasPasan = testRes.code === 0 && !testRes.timedOut && !testRes.error;

    const doNotModify = Array.isArray(task.doNotModify) ? task.doNotModify : [];
    const scope = scopeViolations(changed.map((p) => ({ path: p })), doNotModify);
    const taskFiles = new Set((task.files || []).map(normalizePath));
    const changedNorm = changed.map(normalizePath);
    const changedOutside = changedNorm.filter((p) => !taskFiles.has(p));

    const attempts = Array.isArray(state.attempts) ? state.attempts : [];
    const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
    let infra = null;
    if (thrown || (lastAttempt && lastAttempt.ok === false)) {
      if (lastAttempt && lastAttempt.ok === false) {
        const f = clasificarFallo({
          texto: asText(lastAttempt.error),
          timedOut: Boolean(lastAttempt.timedOut),
          exitCode: lastAttempt.exitCode,
          hadEvents: Boolean((lastAttempt.iterations || 0) > 0 || (lastAttempt.toolCalls || 0) > 0),
        });
        infra = { tipo: f.tipo, causa: f.causa, mensaje: asText(lastAttempt.error || (thrown ? thrown.message : '')) };
      } else if (thrown) {
        const f = clasificarFallo({ texto: asText(thrown && thrown.message ? thrown.message : thrown), timedOut: false, exitCode: null, hadEvents: false });
        infra = { tipo: f.tipo, causa: f.causa, mensaje: asText(thrown && thrown.message ? thrown.message : thrown) };
      }
    }

    const report = lastAttempt && lastAttempt.report ? lastAttempt.report : null;
    const reportCheck = tarea && tarea.reportCheck ? tarea.reportCheck : null;
    const reportCheckOk = reportCheck ? evaluateReportCheck(report, reportCheck) : true;
    const informePresente = report !== null && report !== undefined;

    let aprobada = !infra
      && ocultasPasan
      && changedOutside.length === 0
      && scope.length === 0
      && reportCheckOk
      && informePresente;

    let fallo = null;
    if (infra) {
      fallo = infra;
    } else if (!aprobada) {
      const reasons = [];
      if (!ocultasPasan) reasons.push('las pruebas ocultas no pasan');
      if (changedOutside.length) reasons.push('archivos fuera de los permitidos');
      if (scope.length) reasons.push('violación de alcance');
      if (!report) reasons.push('falta el informe');
      if (report && reportCheck && !reportCheckOk) reasons.push('el informe no evidencia el conflicto');
      if (reasons.length === 0) reasons.push('no superada');
      fallo = { tipo: 'modelo', causa: 'otro', mensaje: reasons.join('; ') };
    }

    const seconds = attempts.reduce((s, a) => s + (typeof a.durationMs === 'number' ? a.durationMs / 1000 : 0), 0);

    const u = state && state.usage ? state.usage : { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCost: 0 };
    const detalle = aprobada ? 'aprobada' : (fallo ? fallo.mensaje : 'no superada');

    result = {
      id: tarea && tarea.id ? tarea.id : null,
      aprobada,
      intentos: (attempts.length > 0 ? attempts.length : (thrown ? 1 : 0)),
      segundos: seconds,
      tokens: {
        entrada: u.inputTokens ?? 0,
        salida: u.outputTokens ?? 0,
        cache: u.cacheReadTokens ?? 0,
      },
      coste: u.estimatedCost ?? 0,
      violacionAlcance: scope.length > 0,
      fallo,
      detalle,
    };
  } catch (err) {
    result = {
      id: tarea && tarea.id ? tarea.id : null,
      aprobada: false,
      intentos: 1,
      segundos: 0,
      tokens: { entrada: 0, salida: 0, cache: 0 },
      coste: 0,
      violacionAlcance: false,
      fallo: { tipo: 'infraestructura', causa: 'otro', mensaje: asText(err && err.message ? err.message : err) },
      detalle: asText(err && err.message ? err.message : err),
    };
  } finally {
    ACTIVE_TEMP_DIRS.delete(dir);
    ACTIVE_TEMP_DIRS.delete(diffTmp);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* se ignora */ }
    try { rmSync(diffTmp, { recursive: true, force: true }); } catch { /* se ignora */ }
  }
  return result;
}

export function puntuarModelo(runs) {
  const repArray = Array.isArray(runs) ? runs : [];
  let infra = false;
  let motivoInfra = null;
  for (const rep of repArray) {
    const list = Array.isArray(rep) ? rep : [];
    for (const r of list) {
      if (r && r.fallo && r.fallo.tipo === 'infraestructura') {
        infra = true;
        motivoInfra = r.fallo.causa;
        break;
      }
    }
    if (infra) break;
  }

  const perRepApproved = repArray.map((rep) => {
    const list = Array.isArray(rep) ? rep : [];
    return list.filter((r) => r && r.aprobada).length;
  });
  const avgApproved = perRepApproved.length ? perRepApproved.reduce((a, b) => a + b, 0) / perRepApproved.length : 0;
  const avgIntentos = repArray.length ? repArray.map((rep) => {
    const list = Array.isArray(rep) ? rep : [];
    return list.reduce((s, r) => s + (r && typeof r.intentos === 'number' ? r.intentos : 0), 0);
  }).reduce((a, b) => a + b, 0) / repArray.length : 0;
  const avgTokens = repArray.length ? repArray.map((rep) => {
    const list = Array.isArray(rep) ? rep : [];
    return list.reduce((s, r) => s + ((r && r.tokens ? (r.tokens.entrada || 0) + (r.tokens.salida || 0) : 0)), 0);
  }).reduce((a, b) => a + b, 0) / repArray.length : 0;
  const avgSeconds = repArray.length ? repArray.map((rep) => {
    const list = Array.isArray(rep) ? rep : [];
    return list.reduce((s, r) => s + (r && typeof r.segundos === 'number' ? r.segundos : 0), 0);
  }).reduce((a, b) => a + b, 0) / repArray.length : 0;

  const violaciones = repArray.reduce((acc, rep) => {
    const list = Array.isArray(rep) ? rep : [];
    return acc + list.filter((r) => r && r.violacionAlcance).length;
  }, 0);
  const anyViolation = violaciones > 0;

  const dispersion = {
    min: perRepApproved.length ? Math.min(...perRepApproved) : 0,
    max: perRepApproved.length ? Math.max(...perRepApproved) : 0,
  };

  let estado;
  if (infra) estado = 'no-evaluado';
  else if (avgApproved >= 3 && !anyViolation) estado = 'apto';
  else estado = 'suspendido';

  let motivo = null;
  if (infra) motivo = motivoInfra;
  else if (estado === 'suspendido') motivo = anyViolation ? 'violación de alcance' : 'menos de 3 tareas aprobadas';

  return {
    estado,
    aprobadas: round1(avgApproved),
    intentos: avgIntentos,
    tokens: round1(avgTokens),
    segundos: round1(avgSeconds),
    violaciones,
    dispersion,
    motivo,
  };
}

function stripPrefix(id) {
  return String(id).replace(/^opencode:/, '');
}

function relDiff(a, b) {
  const A = Number(a) || 0;
  const B = Number(b) || 0;
  const max = Math.max(Math.abs(A), Math.abs(B));
  if (max === 0) return 0;
  return Math.abs(A - B) / max;
}

export function ordenarAptos(puntuaciones, freeOrderPrevio = []) {
  const mapPrev = new Map();
  const arrPrev = Array.isArray(freeOrderPrevio) ? freeOrderPrevio : [];
  arrPrev.forEach((id, idx) => {
    mapPrev.set(stripPrefix(id), idx);
  });

  const items = Object.entries(puntuaciones || {})
    .filter(([, p]) => p && p.estado === 'apto')
    .map(([id, p]) => {
      const stripped = stripPrefix(id);
      const prevRank = mapPrev.has(stripped) ? mapPrev.get(stripped) : Number.POSITIVE_INFINITY;
      return { id, ...p, empateTecnico: false, __prevRank: prevRank };
    });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].aprobadas === items[j].aprobadas && items[i].intentos === items[j].intentos) {
        const rdTok = relDiff(items[i].tokens, items[j].tokens);
        const rdSec = relDiff(items[i].segundos, items[j].segundos);
        if (rdTok < 0.2 && rdSec < 0.2) {
          items[i].empateTecnico = true;
          items[j].empateTecnico = true;
        }
      }
    }
  }

  items.sort((a, b) => {
    if (b.aprobadas !== a.aprobadas) return b.aprobadas - a.aprobadas;
    if (a.intentos !== b.intentos) return a.intentos - b.intentos;
    const pairTie = a.aprobadas === b.aprobadas && a.intentos === b.intentos
      && relDiff(a.tokens, b.tokens) < 0.2 && relDiff(a.segundos, b.segundos) < 0.2;
    if (pairTie) {
      if (a.__prevRank !== b.__prevRank) return a.__prevRank - b.__prevRank;
      return String(a.id).localeCompare(String(b.id));
    }
    if (a.tokens !== b.tokens) return a.tokens - b.tokens;
    return a.segundos - b.segundos;
  });

  return items.map(({ __prevRank, ...rest }) => rest);
}

export function seleccionarFreeOrder(ordenados) {
  if (!Array.isArray(ordenados) || ordenados.length === 0) return [];
  const out = ordenados.slice(0, 2).map((x) => x.id);
  if (ordenados.length >= 3) {
    const second = ordenados[1];
    const third = ordenados[2];
    if (third.aprobadas === 4 && third.intentos === 4) {
      if ((typeof second.segundos === 'number' && third.segundos < second.segundos)
        || (typeof second.tokens === 'number' && third.tokens < second.tokens)) {
        out.push(third.id);
      }
    }
  }
  return out;
}

function defaultFreeOrderPrevio(home) {
  try {
    const { config } = loadConfig({ home, cwd: process.cwd() });
    return Array.isArray(config?.routing?.freeOrder) ? config.routing.freeOrder : [];
  } catch {
    return Array.isArray(DEFAULT_CONFIG.routing.freeOrder) ? [...DEFAULT_CONFIG.routing.freeOrder] : [];
  }
}

export function renderInforme({ fecha = new Date(), descubrimiento = {}, sondeos = {}, resultados = {}, puntuaciones = {}, ordenados = [], seleccion = [], freeOrderPrevio = [], runs = 1, diferencias = [], avisos = [] } = {}) {
  const d = (fecha instanceof Date) ? fecha : new Date(fecha);
  const pad = (n) => String(n).padStart(2, '0');
  const fechaStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const desc = (descubrimiento && typeof descubrimiento === 'object') ? descubrimiento : {};
  const cuenta = Array.isArray(desc.cuenta) ? desc.cuenta : [];
  const publico = Array.isArray(desc.publico) ? desc.publico : null;
  const nuevos = Array.isArray(desc.nuevos) ? desc.nuevos : [];
  const retirados = Array.isArray(desc.retirados) ? desc.retirados : [];
  const avisosDesc = Array.isArray(desc.avisos) ? desc.avisos : [];
  const avisosAll = [...avisosDesc, ...(Array.isArray(avisos) ? avisos : [])];

  const puntuacionesObj = (puntuaciones && typeof puntuaciones === 'object' && !Array.isArray(puntuaciones)) ? puntuaciones : {};
  const resultadosObj = (resultados && typeof resultados === 'object' && !Array.isArray(resultados)) ? resultados : {};
  const sondeosObj = (sondeos && typeof sondeos === 'object' && !Array.isArray(sondeos)) ? sondeos : {};

  let costeTotal = 0;
  for (const [id, r] of Object.entries(resultadosObj)) {
    const arr = Array.isArray(r) ? r : Object.values(r || {});
    for (const t of arr) {
      if (t && typeof t.coste === 'number') costeTotal += t.coste;
    }
  }
  for (const s of Object.values(sondeosObj)) {
    if (s && typeof s.coste === 'number') costeTotal += s.coste;
  }

  const errSet = new Set();
  for (const [id, r] of Object.entries(resultadosObj)) {
    const arr = Array.isArray(r) ? r : Object.values(r || {});
    for (const t of arr) {
      if (t && t.fallo && t.fallo.mensaje) errSet.add(String(t.fallo.mensaje));
    }
  }
  for (const [id, s] of Object.entries(sondeosObj)) {
    if (s && s.fallo && s.fallo.mensaje) errSet.add(String(s.fallo.mensaje));
  }

  const noEvalModels = new Set();
  for (const id of Object.keys(puntuacionesObj)) {
    if (puntuacionesObj[id] && puntuacionesObj[id].estado === 'no-evaluado') noEvalModels.add(id);
  }
  for (const id of Object.keys(sondeosObj)) {
    if (sondeosObj[id] && sondeosObj[id].ok === false) noEvalModels.add(id);
  }

  const lines = [];
  lines.push('# Evaluación de modelos gratuitos');
  lines.push('');
  lines.push(`Fecha: ${fechaStr}  Hora: ${horaStr}`);
  lines.push(`Repeticiones (runs): ${runs}`);
  lines.push('');

  lines.push('## Catálogo');
  lines.push(`- Cuenta: ${cuenta.length} modelos gratuitos`);
  lines.push(`- Público: ${publico === null ? 'no disponible' : publico.length} modelos gratuitos`);
  lines.push(`- Nuevos: ${nuevos.length ? nuevos.join(', ') : 'ninguno'}`);
  lines.push(`- Retirados: ${retirados.length ? retirados.join(', ') : 'ninguno'}`);
  if (avisosAll.length) {
    lines.push('- Avisos:');
    for (const a of avisosAll) lines.push(`  - ${a}`);
  } else {
    lines.push('- Avisos: ninguno');
  }
  lines.push('');

  lines.push('## Accesibles y no evaluados');
  if (noEvalModels.size === 0) {
    lines.push('Ninguno.');
  } else {
    for (const id of [...noEvalModels].sort()) {
      const motivo = (puntuacionesObj[id] && puntuacionesObj[id].motivo)
        || (sondeosObj[id] && sondeosObj[id].fallo ? sondeosObj[id].fallo.causa : '')
        || 'no-evaluado';
      lines.push(`- ${id}: ${motivo}`);
    }
  }
  lines.push('');

  lines.push('## Tareas');
  for (const t of TAREAS) {
    lines.push(`- ${t.id}: ${t.titulo}`);
  }
  lines.push('');

  lines.push('## Resultados medidos');
  lines.push(`Coste total: ${costeTotal}`);
  if (costeTotal > 0) {
    lines.push('Aviso: se gastó cupo (coste total mayor que 0).');
  }
  lines.push('');
  lines.push('| Modelo | Estado | Aprobadas | Intentos | Tokens | Segundos | Coste | Violaciones |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const id of Object.keys(puntuacionesObj)) {
    const p = puntuacionesObj[id];
    const arr = Array.isArray(resultadosObj[id]) ? resultadosObj[id] : Object.values(resultadosObj[id] || {});
    const costeModel = arr.reduce((s, t) => s + (t && typeof t.coste === 'number' ? t.coste : 0), 0);
    const aprob = (p && typeof p.aprobadas !== 'undefined') ? `${p.aprobadas}/4` : '';
    lines.push(`| ${id} | ${p ? p.estado : ''} | ${aprob} | ${p ? p.intentos : ''} | ${p ? p.tokens : ''} | ${p ? p.segundos : ''} | ${costeModel} | ${p ? p.violaciones : 0} |`);
  }
  lines.push('');
  for (const id of Object.keys(puntuacionesObj)) {
    const arr = Array.isArray(resultadosObj[id]) ? resultadosObj[id] : Object.values(resultadosObj[id] || {});
    lines.push(`### ${id}`);
    if (arr.length) {
      lines.push('Tareas:');
      for (const t of arr) {
        if (!t) continue;
        const estado = t.aprobada ? 'aprobada' : 'suspendida';
        const causa = t.fallo && t.fallo.mensaje ? ` (${t.fallo.mensaje})` : (t.detalle && t.detalle !== 'aprobada' ? ` (${t.detalle})` : '');
        lines.push(`- ${t.id}: ${estado}${causa}`);
      }
    } else {
      lines.push('Sin resultados de tareas.');
    }
    lines.push('');
  }

  lines.push('## Errores principales');
  if (errSet.size === 0) {
    lines.push('Ninguno.');
  } else {
    for (const e of errSet) lines.push(`- ${e}`);
  }
  lines.push('');

  lines.push('## Conclusión');
  lines.push(`Aptos: ${ordenados.length}`);
  for (const o of (Array.isArray(ordenados) ? ordenados : [])) {
    lines.push(`- ${o.id}: ${o.aprobadas}/4 aprobadas, ${o.intentos} intentos, ${o.tokens} tokens, ${o.segundos}s${o.empateTecnico ? ' (empate técnico)' : ''}`);
  }
  lines.push(`Selección propuesta: ${Array.isArray(seleccion) && seleccion.length ? seleccion.join(', ') : 'ninguna'}`);
  const empates = (Array.isArray(ordenados) ? ordenados : []).filter((o) => o && o.empateTecnico);
  if (empates.length) {
    lines.push(`Empates técnicos: ${empates.map((o) => o.id).join(', ')}`);
  } else {
    lines.push('Empates técnicos: ninguno');
  }
  lines.push(`freeOrder previo: ${Array.isArray(freeOrderPrevio) && freeOrderPrevio.length ? freeOrderPrevio.join(', ') : 'ninguno'}`);
  if (ordenados.length > 0) {
    lines.push('Justificación:');
    const ord = Array.isArray(ordenados) ? ordenados : [];
    for (let i = 0; i < ord.length; i++) {
      const o = ord[i];
      const partners = o && o.empateTecnico
        ? ord.filter((x) => x && x.id !== o.id && x.empateTecnico
          && x.aprobadas === o.aprobadas && x.intentos === o.intentos
          && relDiff(x.tokens, o.tokens) < 0.2 && relDiff(x.segundos, o.segundos) < 0.2)
        : [];
      const tie = partners.length ? ` empatado técnicamente con ${partners.map((x) => x.id).join(', ')}` : '';
      lines.push(`- ${o.id}: ${i + 1}ª posición por ${o.aprobadas}/4 aprobadas, ${o.intentos} intentos, ${o.tokens} tokens y ${o.segundos}s.${tie}`);
    }
  } else {
    lines.push('Justificación: no hay modelos aptos; no se propone ningún cambio.');
    const noAptos = [];
    for (const [id, p] of Object.entries(puntuacionesObj)) {
      if (p && (p.estado === 'suspendido' || p.estado === 'no-evaluado')) {
        noAptos.push(`${id}: ${p.estado} (${p.motivo ? p.motivo : 'sin motivo'})`);
      }
    }
    for (const id of Object.keys(sondeosObj)) {
      if (sondeosObj[id] && sondeosObj[id].ok === false && !puntuacionesObj[id]) {
        noAptos.push(`${id}: no-evaluado (${sondeosObj[id].fallo ? sondeosObj[id].fallo.causa : 'infraestructura'})`);
      }
    }
    for (const line of noAptos) lines.push(`- ${line}`);
  }
  lines.push('');

  lines.push('## Diferencias con la evaluación anterior');
  const diffs = Array.isArray(diferencias) ? diferencias : [];
  if (diffs.length === 0) {
    lines.push('Sin diferencias.');
  } else {
    for (const diff of diffs) lines.push(`- ${diff}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function guardarResultado({ home, ahora = new Date(), informe, entradaHistorial } = {}) {
  const dir = evaluarDir(home || agentrelayHome());
  mkdirSync(dir, { recursive: true });
  const d = (ahora instanceof Date) ? ahora : new Date(ahora);
  const pad = (n) => String(n).padStart(2, '0');
  const nombre = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;
  const ruta = path.join(dir, nombre);
  writeFileSync(ruta, String(informe ?? ''), 'utf8');

  const hist = cargarHistorial(home || agentrelayHome());
  const runs = Array.isArray(hist.runs) ? [...hist.runs] : [];
  if (entradaHistorial) runs.push(entradaHistorial);
  const trimmed = runs.slice(-20);
  writeFileSync(path.join(dir, 'history.json'), `${JSON.stringify({ runs: trimmed }, null, 2)}\n`, 'utf8');
  return ruta;
}

export async function evaluar({ executor, home = agentrelayHome(), modelos, runs = 1, ahora = new Date(), log = () => {}, deps = {} } = {}) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 3) {
    throw new Error('runs debe ser un entero entre 1 y 3');
  }

  const descubrirFn = (typeof deps.descubrirModelos === 'function') ? deps.descubrirModelos : descubrirModelos;
  const sondearFn = (typeof deps.sondear === 'function') ? deps.sondear : sondear;
  const ejecutarFn = (typeof deps.ejecutarTarea === 'function') ? deps.ejecutarTarea : ejecutarTarea;

  let freeOrderPrevio;
  if (typeof deps.freeOrderPrevio === 'function') freeOrderPrevio = deps.freeOrderPrevio();
  else if (deps.freeOrderPrevio !== undefined) freeOrderPrevio = deps.freeOrderPrevio;
  else freeOrderPrevio = defaultFreeOrderPrevio(home);

  const handler = () => {
    for (const dir of ACTIVE_TEMP_DIRS) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* se ignora */ }
    }
    process.exit(130);
  };
  process.once('SIGINT', handler);

  let puntuaciones = {};
  let ordenados = [];
  let seleccion = [];
  let informe = '';
  let rutaInforme = '';
  try {
    const descubrimiento = await descubrirFn({ executor, home });
    const seleccionados = seleccionarModelos(descubrimiento.cuenta, modelos);

    const sondeos = {};
    const resultados = {};
    const runsPorModelo = {};

    for (const modelo of seleccionados) {
      if (typeof log === 'function') log({ type: 'sondeo', modelo });
      const sondeo = await sondearFn({ executor, modelo });
      sondeos[modelo] = sondeo;
      if (!sondeo || sondeo.ok !== true) {
        puntuaciones[modelo] = {
          estado: 'no-evaluado',
          aprobadas: 0,
          intentos: 0,
          tokens: 0,
          segundos: 0,
          violaciones: 0,
          dispersion: { min: 0, max: 0 },
          motivo: (sondeo && sondeo.fallo ? sondeo.fallo.causa : 'infraestructura'),
        };
        resultados[modelo] = [];
        runsPorModelo[modelo] = [];
        continue;
      }

      const runsModelo = [];
      for (let r = 0; r < runs; r++) {
        const runResults = [];
        for (const tarea of TAREAS) {
          if (typeof log === 'function') log({ type: 'tarea', modelo, tarea: tarea.id, run: r + 1 });
          const res = await ejecutarFn({ executor, modelo, tarea });
          runResults.push(res);
        }
        runsModelo.push(runResults);
      }
      runsPorModelo[modelo] = runsModelo;
      resultados[modelo] = Array.isArray(runsModelo[0]) ? runsModelo[0] : [];
      puntuaciones[modelo] = puntuarModelo(runsModelo);
    }

    ordenados = ordenarAptos(puntuaciones, freeOrderPrevio);
    seleccion = seleccionarFreeOrder(ordenados);

    const diferencias = [];
    const hist = cargarHistorial(home);
    const prevRuns = Array.isArray(hist.runs) ? hist.runs : [];
    const prevRun = prevRuns.length ? prevRuns[prevRuns.length - 1] : null;
    if (prevRun && prevRun.modelos && typeof prevRun.modelos === 'object') {
      const prevModelos = prevRun.modelos;
      for (const id of Object.keys(puntuaciones)) {
        if (prevModelos[id]) {
          const prev = prevModelos[id];
          const cur = puntuaciones[id];
          if (prev.estado !== cur.estado) diferencias.push(`${id}: estado ${prev.estado} -> ${cur.estado}`);
          else if (prev.aprobadas !== cur.aprobadas || prev.intentos !== cur.intentos || prev.tokens !== cur.tokens || prev.segundos !== cur.segundos) {
            diferencias.push(`${id}: métricas cambiaron (${prev.aprobadas}/${prev.intentos}/${prev.tokens}/${prev.segundos} -> ${cur.aprobadas}/${cur.intentos}/${cur.tokens}/${cur.segundos})`);
          }
        } else {
          diferencias.push(`${id}: modelo nuevo`);
        }
      }
      for (const id of Object.keys(prevModelos)) {
        if (!puntuaciones[id]) diferencias.push(`${id}: retirado`);
      }
    }

    informe = renderInforme({
      fecha: ahora,
      descubrimiento,
      sondeos,
      resultados,
      puntuaciones,
      ordenados,
      seleccion,
      freeOrderPrevio,
      runs,
      diferencias,
      avisos: descubrimiento && Array.isArray(descubrimiento.avisos) ? descubrimiento.avisos : [],
    });

    const modelosHist = {};
    for (const [id, p] of Object.entries(puntuaciones)) {
      modelosHist[id] = {
        estado: p.estado,
        aprobadas: p.aprobadas,
        intentos: p.intentos,
        tokens: p.tokens,
        segundos: p.segundos,
      };
    }
    const entradaHistorial = {
      at: (ahora instanceof Date ? ahora.toISOString() : new Date(ahora).toISOString()),
      freeOrderPrevio,
      modelos: modelosHist,
      seleccion,
    };
    rutaInforme = guardarResultado({ home, ahora, informe, entradaHistorial });
  } finally {
    process.removeListener('SIGINT', handler);
  }

  return {
    informe,
    rutaInforme,
    seleccion,
    ordenados,
    puntuaciones,
    freeOrderPrevio,
    sinAptos: ordenados.length === 0,
  };
}
