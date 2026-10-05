---
description: Prepara el proyecto para trabajar con AgentRelay
argument-hint: [--yes] [--with-config] [--fix]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay start $ARGUMENTS 2>&1`

Responde solo con el resultado, en 5 líneas como máximo, sin comentarios. Si pide confirmación, explica en una línea qué haría y que se aplica añadiendo --yes (por ejemplo: /ar:start --yes).

Mismo comando que en el terminal: agentrelay start.
