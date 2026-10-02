// Resumen legible del estado de un proyecto AgentRelay.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { isClean, pendingChanges } from './git.js';
import { blockStatus, PROJECT_BLOCK } from './instructions.js';
import { isOrphaned, lastActivityMs } from './orphans.js';
import { runProcess } from './proc.js';
import { listRunIds, loadState, workspaceDir } from './store.js';

const short = (value, max) => String(value || '').trim().slice(0, max);

export async function collectProjectState(root, { now = new Date() } = {}) {
  const absoluteRoot = path.resolve(root);
  const loaded = loadConfig({ cwd: absoluteRoot });
  const ids = listRunIds(absoluteRoot);
  const allRuns = ids.map((id) => {
    const state = loadState(absoluteRoot, id);
    const interrupted = state.status === 'interrupted'
      || isOrphaned(state, { now: now.getTime(), lastEventMs: lastActivityMs(absoluteRoot, id) });
    return { id, state, interrupted };
  });
  const pending = await pendingChanges(absoluteRoot);
  const clean = await isClean(absoluteRoot);
  const log = await runProcess('git', ['log', '-5', '--pretty=format:%h%x09%s'], { cwd: absoluteRoot, windowsShell: false });
  if (log.code !== 0) throw new Error(`git log ha fallado: ${log.stderr.trim()}`);
  const agentsFile = path.join(absoluteRoot, 'AGENTS.md');
  const claudeFile = path.join(absoluteRoot, 'CLAUDE.md');
  const claudeText = existsSync(claudeFile) ? readFileSync(claudeFile, 'utf8').trim() : '';
  const instructions = {
    agents: blockStatus(agentsFile, PROJECT_BLOCK),
    claude: claudeText === '@AGENTS.md' ? 'importa AGENTS.md' : blockStatus(claudeFile, PROJECT_BLOCK),
  };
  const recent = [...allRuns].reverse().slice(0, 5).map(({ id, state, interrupted: isInterrupted }) => ({
    id,
    status: isInterrupted ? 'interrupted' : state.status,
    attempts: Array.isArray(state.attempts) ? state.attempts.length : 0,
    objective: short(state.task?.objective || state.task?.title || '', 100),
  }));
  const todoFile = path.join(absoluteRoot, 'TODO.md');
  const todo = existsSync(todoFile)
    ? readFileSync(todoFile, 'utf8').split(/\r?\n/).filter((line) => /^\s*- \[ \]/.test(line)).slice(0, 10).map((line) => short(line.replace(/^\s*- \[ \]\s*/, ''), 140))
    : [];
  const branchResult = await runProcess('git', ['branch', '--show-current'], { cwd: absoluteRoot, windowsShell: false });
  if (branchResult.code !== 0) throw new Error(`git branch ha fallado: ${branchResult.stderr.trim()}`);
  const awaitingReview = allRuns.filter(({ state }) => state.status === 'awaiting_review').map(({ id }) => id);
  const interrupted = allRuns.filter(({ interrupted: value }) => value).map(({ id }) => id);
  const running = allRuns.filter(({ state, interrupted: value }) => state.status === 'running' && !value).map(({ id }) => id);
  const next = [];
  if (awaitingReview.length) next.push(`Revisa la ejecución ${awaitingReview[0]} con agentrelay show ${awaitingReview[0]} y decide con agentrelay review`);
  else if (interrupted.length) next.push(`Recupera con agentrelay recover ${interrupted[0]}`);
  else if (running.length) next.push('Hay una ejecución en curso: sigue con agentrelay watch');
  else if (!clean) next.push(`Hay ${pending.length} cambios sin confirmar: confírmalos antes de delegar`);
  else if ([instructions.agents, instructions.claude].some((status) => ['missing', 'outdated', 'nofile'].includes(status))) next.push('Ejecuta agentrelay init');
  else next.push('Todo en orden: continúa con lo primero pendiente de TODO.md');

  return {
    name: path.basename(absoluteRoot), root: absoluteRoot, date: now.toISOString(),
    git: {
      branch: branchResult.stdout.trim() || '(sin rama)', clean, pendingCount: pending.length,
      lastCommits: log.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
        const [hash, ...subject] = line.split('\t');
        return { hash, subject: subject.join('\t') };
      }),
    },
    executor: {
      type: loaded.config.executor.type, model: loaded.config.executor.model,
      thinking: loaded.config.executor.thinking, level: loaded.config.level,
      origin: loaded.origins['executor.type'] || 'defecto',
    },
    instructions, runs: { total: allRuns.length, awaitingReview, running, interrupted, recent }, todo, next,
  };
}

const ES_BLOCK = { current: 'al día', outdated: 'desactualizado', missing: 'sin el bloque de AgentRelay', nofile: 'no existe' };
const ES_EFFORT = { none: 'ninguno', low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'extremo', max: 'máximo' };
const esBlock = (value) => ES_BLOCK[value] || value;

export function renderProjectState(state) {
  const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(state.date));
  const git = `${state.git.branch} · ${state.git.clean ? 'limpio' : `${state.git.pendingCount} cambios pendientes`}`;
  const executor = `${state.executor.type} · ${state.executor.model || 'sin modelo'} · esfuerzo ${ES_EFFORT[state.executor.thinking] || state.executor.thinking || 'predeterminado'} · nivel ${state.executor.level} (${state.executor.origin})`;
  const runs = `${state.runs.total} total; ${state.runs.awaitingReview.length} por revisar; ${state.runs.running.length} en curso; ${state.runs.interrupted.length} interrumpidas`;
  const lines = [
    `# Estado de ${state.name}`, '', `Actualizado: ${date}`, '', '## Resumen', '',
    `- Carpeta: ${state.root}`, `- Git: ${git}`, `- Ejecutor: ${executor}`,
    `- Instrucciones: AGENTS.md ${esBlock(state.instructions.agents)}; CLAUDE.md ${esBlock(state.instructions.claude)}`,
    `- Ejecuciones: ${runs}`, '', '## Últimas ejecuciones', '',
  ];
  if (state.runs.recent.length) {
    lines.push('| ID | Estado | Intentos | Objetivo |', '|---|---|---:|---|');
    for (const run of state.runs.recent) lines.push(`| ${run.id} | ${run.status} | ${run.attempts} | ${run.objective.replaceAll('|', '\\|')} |`);
  } else lines.push('No hay ejecuciones.');
  lines.push('', '## Últimos commits', '');
  if (state.git.lastCommits.length) for (const commit of state.git.lastCommits) lines.push(`- ${commit.hash} ${commit.subject}`);
  else lines.push('No hay commits.');
  lines.push('', '## Pendiente (TODO.md)', '');
  if (state.todo.length) lines.push(...state.todo.map((item) => `- ${item}`));
  else lines.push('No hay tareas pendientes.');
  lines.push('', '## Qué hacer ahora', '', ...state.next.map((item) => `- ${item}`), '');
  return lines.join('\n');
}

export async function writeProjectState(root, options) {
  const state = await collectProjectState(root, options);
  const dir = workspaceDir(path.resolve(root));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ESTADO.md');
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, renderProjectState(state), 'utf8');
  renameSync(temp, file);
  return file;
}
