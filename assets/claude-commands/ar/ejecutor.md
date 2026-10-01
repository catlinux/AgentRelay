---
description: Muestra los ejecutores o cambia de ejecutor (AgentRelay)
argument-hint: [codex|cline]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`if [ -z "$ARGUMENTS" ]; then agentrelay executors | grep -v "^Añade"; else agentrelay set executor $ARGUMENTS; fi`

Responde solo con el resultado, en 3 líneas como máximo (más un "Aviso"/"Ojo" si aparece). Termina con esta línea independiente para el chat:

Uso en el chat: /ar:ejecutor <codex|cline>

Si Cline no está instalado, indícalo por separado como comando de terminal: `agentrelay executors add cline`. Sin comentarios ni otras acciones.
