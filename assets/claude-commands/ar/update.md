---
description: Actualiza AgentRelay desde su repositorio de instalación
argument-hint: [--check] [--yes]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay update $ARGUMENTS 2>&1`

Responde solo con el resultado, en 5 líneas como máximo, sin comentarios. Si pide confirmación, explica en una línea qué haría y que se aplica añadiendo --yes (por ejemplo: /ar:update --yes).

Mismo comando que en el terminal: agentrelay update.
