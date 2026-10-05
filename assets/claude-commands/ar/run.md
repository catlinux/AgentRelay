---
description: Delega una tarea a un agente ejecutor
argument-hint: <tarea.json | ->
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay run $ARGUMENTS 2>&1`

Responde con el id de la ejecución y su estado, en 3 líneas como máximo. Para seguirla en directo, en otro terminal: agentrelay watch.

Mismo comando que en el terminal: agentrelay run.
