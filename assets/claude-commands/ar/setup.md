---
description: Instala las instrucciones globales y los comandos de Claude Code
argument-hint: [opciones]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay setup $ARGUMENTS 2>&1`

Responde solo con el resultado, en 5 líneas como máximo, sin comentarios. Si pide confirmación, explica en una línea qué haría y que se aplica añadiendo --yes (por ejemplo: /ar:setup --yes).

Mismo comando que en el terminal: agentrelay setup.
