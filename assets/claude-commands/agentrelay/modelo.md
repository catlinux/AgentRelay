---
description: Muestra los modelos del ejecutor o cambia el modelo (AgentRelay)
argument-hint: [id del modelo]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay models; else agentrelay set model $ARGUMENTS; fi`

Muestra el resultado en español, tal cual y sin comentarios adicionales. Si aparece un "Aviso" o un "Ojo", menciónalo. No ejecutes otras acciones.
