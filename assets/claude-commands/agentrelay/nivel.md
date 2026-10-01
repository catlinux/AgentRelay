---
description: Muestra o cambia el nivel de orquestación de AgentRelay (1 a 5)
argument-hint: [1-5]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay config | grep -E "^(level|  level)" ; else agentrelay set level $ARGUMENTS; fi`

Muestra el resultado en español, tal cual y sin comentarios adicionales. Si aparece un "Ojo", menciónalo. No ejecutes otras acciones.
