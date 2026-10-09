// Informe en Markdown de una ejecución, pensado para la revisión del orquestador.

const STATUS_LABELS = {
  running: 'en curso',
  interrupted: 'interrumpida',
  awaiting_review: 'pendiente de revisión',
  accepted: 'aceptada',
  escalated: 'escalada al orquestador',
  rejected: 'rechazada',
  failed: 'error interno',
};

function list(items, empty = '_(ninguno)_') {
  return items?.length ? items.map((item) => `- ${item}`).join('\n') : empty;
}

function fmtSeconds(ms) {
  return ms ? `${Math.round(ms / 1000)} s` : '-';
}

function fmtCost(value) {
  return typeof value === 'number' ? `${value.toFixed(4)} USD` : '-';
}

function attemptsTable(attempts) {
  if (!attempts.length) return '_(ninguno)_';
  const rows = attempts.map((a) => {
    const tokens = a.usage ? `${a.usage.inputTokens ?? 0} / ${a.usage.outputTokens ?? 0}` : '-';
    const result = a.ok ? (a.report?.status ?? 'sin informe') : `error: ${a.error}`;
    return `| ${a.n} | ${a.route ? `${a.kind} · ${a.route}` : a.kind} | ${result} | ${fmtSeconds(a.durationMs)} | ${tokens} | ${fmtCost(a.usage?.totalCost)} |`;
  });
  return ['| # | Fase | Resultado | Duración | Tokens entrada / salida | Coste estimado |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

function routeSection(route, attempts) {
  const switches = route.switches?.length
    ? route.switches.map((change) => {
      const at = new Date(change.at);
      const time = Number.isFinite(at.getTime())
        ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
        : '--:--';
      const details = [change.paid ? 'de pago' : '', change.trainsOnData ? 'aviso: puede usar tus prompts para entrenar' : ''].filter(Boolean);
      return `- ${time} ${change.from} → ${change.to} (${change.reason})${details.length ? ` · ${details.join(' · ')}` : ''}`;
    }).join('\n') : '_(sin cambios de ejecutor)_';
  const skipped = [...new Map((route.skipped ?? []).map((entry) => [entry.key, entry])).values()]
    .map((entry) => `- ${entry.key}: ${entry.reason}`);
  const paid = attempts.some((attempt) => attempt.paid === true)
    ? '\n\n**Se ha usado un ejecutor de pago en esta ejecución.**' : '';
  return `## Enrutado\n\n${switches}\n\nEntradas descartadas al elegir:\n${skipped.length ? skipped.join('\n') : '_(ninguna)_'}${paid}`;
}

function validationsSection(check) {
  if (!check) return '_(sin validar)_';
  if (!check.validations.length) return '_No hay comandos de validación configurados._';
  return check.validations
    .map((v) => {
      const state = v.timedOut ? 'TIEMPO AGOTADO' : v.passed ? 'correcta' : `FALLA (código ${v.exitCode})`;
      const output = !v.passed && v.output ? `\n\n\`\`\`\n${v.output}\n\`\`\`` : '';
      return `- \`${v.command}\`: ${state}${output}`;
    })
    .join('\n');
}

function agentReportSection(attempt, id) {
  if (!attempt) return '_(sin intentos)_';
  const r = attempt.report;
  if (!r) {
    const warning = `**AVISO: el ejecutor no devolvió el informe estructurado (estado, archivos, incidencias). No te fíes del resumen: revisa el diff y las validaciones. Si falta información, pide una corrección con \`agentrelay review ${id ?? '<id>'} --decision fix --feedback "Termina con el bloque JSON del informe final"\`.**`;
    return `${warning}\n\n_El ejecutor no ha devuelto un informe estructurado._\n\n${attempt.finalText ? `> ${attempt.finalText.replace(/\n/g, '\n> ')}` : ''}`;
  }
  return [
    `- Estado declarado: **${r.status}**${r.needsEscalation ? ' · pide escalado' : ''}`,
    `- Resumen: ${r.summary || '-'}`,
    `- Comprobaciones declaradas: ${r.checks.length ? r.checks.map((c) => `\`${c.command ?? '?'}\` ${c.result ?? '?'}`).join(', ') : '-'}`,
    `- Incidencias:\n${list(r.issues).replace(/^/gm, '  ')}`,
    `- Dudas:\n${list(r.questions).replace(/^/gm, '  ')}`,
  ].join('\n');
}

function selfReviewLine(state) {
  const { mode, pass } = state.selfReview;
  if (mode !== 'pass') return mode === 'inline' ? 'incluida en el prompt de implementación' : 'no aplicada';
  if (!pass) return 'pasada separada pendiente';
  return pass.run ? 'pasada separada ejecutada' : `pasada separada omitida (${pass.reason})`;
}

function nextSteps(state) {
  const id = state.id;
  if (state.status === 'awaiting_review' || state.status === 'escalated' || state.status === 'interrupted') {
    return [
      `- Aceptar (ejecuta la validación final): \`agentrelay review ${id} --decision accept\``,
      `- Pedir corrección: \`agentrelay review ${id} --decision fix --feedback "..."\``,
      `- Asumir la tarea: \`agentrelay review ${id} --decision escalate\``,
      `- Rechazar: \`agentrelay review ${id} --decision reject\``,
    ].join('\n');
  }
  return '_(ninguno)_';
}

export function renderReport(state, patch = '', { maxDiffChars = 60000 } = {}) {
  const { task, policy, lastCheck: check } = state;
  const lastAttempt = state.attempts[state.attempts.length - 1];
  const usedApiFallback = state.attempts.some((attempt) => attempt.fellBackFromQuota || attempt.billing === 'api');
  const billingNotice = usedApiFallback
    ? state.attempts.some((attempt) => attempt.fellBackFromQuota)
      ? '**Aviso:** la cuota gratuita de ChatGPT se agotó y este trabajo se hizo con tu clave de API (de pago).'
      : '**Facturación:** este trabajo se hizo con tu clave de API (de pago), porque la cuota gratuita de ChatGPT sigue agotada.'
    : '';
  const resetAtValue = [...state.attempts].reverse().find((attempt) => attempt.quotaResetAt)?.quotaResetAt;
  const resetAt = resetAtValue ? new Date(resetAtValue) : null;
  const quotaRetryNotice = resetAt && Number.isFinite(resetAt.getTime())
    ? ` La cuota gratuita se vuelve a probar a las ${String(resetAt.getHours()).padStart(2, '0')}:${String(resetAt.getMinutes()).padStart(2, '0')} (hora local).`
    : '';
  const fullBillingNotice = billingNotice ? `${billingNotice}${quotaRetryNotice}` : '';
  const truncated = patch.length > maxDiffChars;
  const diff = truncated ? `${patch.slice(0, maxDiffChars)}\n... (diff truncado: ver diff.patch)` : patch;
  const executor = state.config.executor;

  return `# AgentRelay · ejecución ${state.id}

${fullBillingNotice ? `${fullBillingNotice}\n\n` : ''}**Estado:** ${STATUS_LABELS[state.status] ?? state.status}
${state.statusReasons?.length ? `\n**Motivos:**\n${list(state.statusReasons)}\n` : ''}
## Tarea

**${task.title}** (${task.type}, complejidad ${task.complexity})

${task.objective}

**Criterios de aceptación:**
${list(task.acceptanceCriteria)}

## Orquestación

- Revisión: ${policy.review} · reintentos: ${state.retriesUsed}/${policy.maxRetries}
- Ejecutor: ${state.route ? `enrutado automático · empezó con ${state.route.first} · ahora ${state.route.current?.key ?? '-'}` : `${executor.type} · ${[executor.provider, executor.model].filter(Boolean).join('/') || 'modelo por defecto del ejecutor'}`}
- Self-review: ${selfReviewLine(state)}

${state.route ? `${routeSection(state.route, state.attempts)}\n\n` : ''}## Intentos

${attemptsTable(state.attempts)}

Total: ${state.usage.inputTokens} tokens de entrada, ${state.usage.outputTokens} de salida · coste estimado por el ejecutor: ${fmtCost(state.attempts.some((a) => typeof a.usage?.totalCost === 'number') ? state.usage.estimatedCost : null)}

## Informe del ejecutor (último intento)

${agentReportSection(lastAttempt, state.id)}

## Archivos modificados

${check ? list(check.files.map((f) => `\`${f.status}\` ${f.path}`)) : '_(sin validar)_'}
${lastAttempt?.undeclaredFiles?.length ? `\n**AVISO: estos archivos han cambiado pero el ejecutor no los declaró (¿los modificaste tú mientras trabajaba, o los tocó sin decirlo?): ${lastAttempt.undeclaredFiles.map((file) => `\`${file}\``).join(', ')}. Revisa el diff antes de aceptar.**\n` : ''}
${check?.headMoved ? '\n**Aviso:** HEAD ha cambiado durante la ejecución (el ejecutor ha creado commits).\n' : ''}${check?.scopeViolations?.length ? `\n**Archivos protegidos modificados:**\n${list(check.scopeViolations)}\n` : ''}
## Validaciones

${validationsSection(check)}

## Diff

\`\`\`diff
${diff || '(sin cambios)'}
\`\`\`

## Siguientes pasos

${nextSteps(state)}
`;
}
