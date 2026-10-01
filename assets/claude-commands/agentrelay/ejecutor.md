---
description: Muestra los ejecutores o cambia de ejecutor (AgentRelay)
argument-hint: [codex|cline]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay executors; else agentrelay set executor $ARGUMENTS; fi`

Muestra el resultado en español, tal cual y sin comentarios adicionales. Si aparece un "Aviso" o un "Ojo", menciónalo. No ejecutes otras acciones.
