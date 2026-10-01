---
description: Muestra los modelos del ejecutor o cambia el modelo (AgentRelay)
argument-hint: [id del modelo]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay models | grep -v "^Cambia"; else agentrelay set model $ARGUMENTS; fi`

Responde solo con el resultado, en 3 líneas como máximo (más un "Aviso"/"Ojo" si aparece) y termina con esta línea de uso en el chat: /ar:modelo <id>. Sin comentarios ni otras acciones.
