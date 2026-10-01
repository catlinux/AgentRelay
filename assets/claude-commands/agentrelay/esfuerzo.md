---
description: Muestra o cambia el esfuerzo de razonamiento del ejecutor (AgentRelay)
argument-hint: [bajo|medio|alto|extremo|máximo]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay models; else agentrelay set effort $ARGUMENTS; fi`

Muestra el resultado en español, tal cual y sin comentarios adicionales. Si aparece un "Aviso" o un "Ojo", menciónalo. No ejecutes otras acciones.
