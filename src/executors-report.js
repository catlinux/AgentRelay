// Generación del informe diario de ejecutores.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXECUTOR_DEFAULTS, agentrelayHome, loadConfig } from './config.js';
import { CATALOG, isInstalled } from './executors/catalog.js';
import { getExecutor } from './executors/index.js';
import { loadChecks } from './model-check.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dateOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const errorText = (error) => String(error?.message || error || 'error desconocido').replace(/[\r\n]+/g, ' ').slice(0, 160);

export function reportPath(root = packageRoot) { return path.join(root, '.agentrelay', 'EJECUTORES.md'); }

export async function fetchDeepSeekBalance({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const key = env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, text: 'saldo no consultado: define la variable DEEPSEEK_API_KEY' };
  try {
    const response = await fetchFn('https://api.deepseek.com/user/balance', {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data?.is_available !== 'boolean' || !Array.isArray(data.balance_infos)) throw new Error('respuesta JSON no válida');
    const balances = data.balance_infos.map((item) => {
      if (typeof item?.currency !== 'string' || !['total_balance', 'granted_balance', 'topped_up_balance'].every((k) => Number.isFinite(Number(item[k])))) throw new Error('respuesta JSON no válida');
      return `${item.total_balance} ${item.currency} (concedido ${item.granted_balance}, recargado ${item.topped_up_balance})`;
    });
    return { ok: true, text: balances.length ? balances.join('; ') : 'sin saldos disponibles' };
  } catch (error) {
    return { ok: false, text: `saldo no disponible: ${errorText(error).replaceAll(String(key), '[oculto]')}` };
  }
}

export async function collectReport({ current, home, now = new Date(), listModels, authStatuses = {}, isInstalled: installedFn = isInstalled, balances = {}, checks = { lastRun: null, models: {} } } = {}) {
  const config = current ? null : loadConfig({ cwd: packageRoot, home });
  current ||= config.config.executor;
  const date = dateOf(now);
  const entries = [];
  for (const entry of CATALOG) {
    let installed = entry.bundled;
    try { if (!entry.bundled) installed = await installedFn(entry.name); } catch { installed = false; }
    if (!installed) { entries.push({ ...entry, installed, models: [], auth: null }); continue; }
    const executor = entry.name === current.type ? current : { ...current, ...EXECUTOR_DEFAULTS[entry.name], type: entry.name, thinking: null };
    let models = [];
    let error = null;
    try {
      const adapter = getExecutor(entry.name);
      const list = listModels ? (args) => listModels(entry.name, args) : (args) => adapter.listModels?.(args);
      let timer;
      try { models = await Promise.race([Promise.resolve(list(executor)), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tiempo máximo de 20 s superado')), 20_000); })]) || []; }
      finally { clearTimeout(timer); }
    } catch (err) { error = errorText(err); }
    let auth = authStatuses[entry.name] ?? null;
    if (!auth && !listModels) {
      try { const adapter = getExecutor(entry.name); if (adapter.authStatus) auth = await adapter.authStatus(executor); } catch (err) { auth = { ok: false, message: errorText(err) }; }
    }
    entries.push({ ...entry, installed, models, error, auth });
  }
  return { current, now, date, balances, entries, checks };
}

function mark(model, checks, date) {
  if (!model.id?.endsWith('-free')) return '';
  const record = checks?.models?.[model.id];
  const checkedDate = record?.checkedAt ? dateOf(new Date(record.checkedAt)) : null;
  if (!record) return ' — · sin probar';
  if (record.status === 'approved') return ` — ✔ probado (${checkedDate}, ${record.seconds ?? 0} s)`;
  if (record.status === 'failed') return ` — ✘ no pasó la prueba: ${record.reason || 'motivo no indicado'}`;
  return ' — · sin probar';
}

export function renderReport(data) {
  const lines = [`# Ejecutores disponibles — ${data.date}`, `Generado: ${data.now.toLocaleString('es-ES')}`, '', '## Saldos',
    `DeepSeek: ${data.balances.deepseek?.text || 'saldo no consultado: define la variable DEEPSEEK_API_KEY'}`,
    'OpenAI: no consultable por API; míralo en https://platform.openai.com/settings/organization/billing/overview', '',
    '## Ejecutor en uso', `${data.current.type} · ${data.current.model || 'modelo por defecto'} · esfuerzo ${data.current.thinking || 'por defecto'}`, ''];
  for (const entry of data.entries) {
    lines.push(`## ${entry.title} (${entry.name})`, `Instalado: ${entry.installed ? 'sí' : 'no'}`, `Coste: ${entry.cost}`);
    if (entry.auth) lines.push(`Sesión: ${entry.auth.ok ? 'conectada' : (entry.auth.message || 'no conectada')}`);
    if (entry.error) lines.push(`Modelos: no se pudo leer la lista: ${entry.error}`);
    else if (!entry.installed) lines.push('Modelos: ejecutor no instalado');
    else if (!entry.models.length) lines.push('Modelos: modelo por defecto (sin lista disponible)');
    else for (const model of entry.models) {
      const efforts = model.efforts?.length ? ` — esfuerzos: ${model.efforts.join(', ')}${model.defaultEffort ? ` (predeterminado: ${model.defaultEffort})` : ''}` : '';
      lines.push(`- ${model.id}${efforts}${entry.name === 'opencode' ? mark(model, data.checks, data.date) : ''}`);
    }
    lines.push('');
    if (entry.name === 'opencode') {
      const today = Object.entries(data.checks?.models || {}).filter(([, record]) => record?.checkedAt && dateOf(new Date(record.checkedAt)) === data.date);
      lines.push('### Probados hoy', ...(today.length ? today.map(([id, record]) => `- ${id}: ${record.status === 'approved' ? '✔ probado' : `✘ no pasó la prueba: ${record.reason || 'motivo no indicado'}`} (${record.seconds ?? 0} s)`) : ['- Ninguno']), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function writeReport({ root = packageRoot, home = agentrelayHome(), now = new Date(), balances, checks, env = process.env, fetchFn = globalThis.fetch, ...deps } = {}) {
  const data = await collectReport({ ...deps, home, now, balances: balances || { deepseek: await fetchDeepSeekBalance({ env, fetchFn }) }, checks: checks || loadChecks(home) });
  const file = reportPath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(temp, renderReport(data), 'utf8');
  renameSync(temp, file);
  return { path: file };
}
