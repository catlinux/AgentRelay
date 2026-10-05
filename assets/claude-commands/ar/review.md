---
description: Registra la decisión del orquestador sobre una ejecución
argument-hint: <id> --decision <accept|fix|escalate|reject> [--feedback <texto>]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay review $ARGUMENTS 2>&1`

Responde con la decisión registrada y el estado resultante, en 3 líneas como máximo.

Mismo comando que en el terminal: agentrelay review.
