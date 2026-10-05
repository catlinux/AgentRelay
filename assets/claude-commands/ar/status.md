---
description: Resume el estado del proyecto
argument-hint: [--write] [--json]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay status $ARGUMENTS 2>&1`

Resume en 8 líneas como máximo: rama y cambios, IA en uso, tareas por revisar y qué hacer ahora.

Mismo comando que en el terminal: agentrelay status.
