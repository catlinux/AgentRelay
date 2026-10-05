---
description: Repite las validaciones de una ejecución
argument-hint: [id]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay check $ARGUMENTS 2>&1`

Responde solo con el resultado, en 5 líneas como máximo, sin comentarios.

Mismo comando que en el terminal: agentrelay check.
