---
description: Muestra el informe de una ejecución
argument-hint: [id]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay show $ARGUMENTS 2>&1`

Resume en 10 líneas como máximo: estado, objetivo, intentos, archivos y, sin recortar, las incidencias y dudas del ejecutor. No muestres el diff.

Mismo comando que en el terminal: agentrelay show.
