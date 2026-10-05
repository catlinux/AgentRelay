---
description: Lista las ejecuciones del repositorio
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay list $ARGUMENTS 2>&1`

Resume en 8 líneas como máximo: total por estado y las 5 últimas; destaca primero las que necesitan atención (awaiting_review, running, failed).

Mismo comando que en el terminal: agentrelay list.
