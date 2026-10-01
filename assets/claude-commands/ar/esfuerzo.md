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

Responde solo con el resultado, en 3 líneas como máximo (más un "Aviso"/"Ojo" si aparece). Sin comentarios ni otras acciones.
