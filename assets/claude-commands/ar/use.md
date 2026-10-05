---
description: Cambia el ejecutor, el modelo y el esfuerzo de razonamiento
argument-hint: [ejecutor] [modelo] [esfuerzo]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay use $ARGUMENTS 2>&1`

Responde solo con el resultado, en 4 líneas como máximo (más un «Aviso»/«Ojo» si aparece); con --list muestra la lista completa sin resumirla.

Mismo comando que en el terminal: agentrelay use.
