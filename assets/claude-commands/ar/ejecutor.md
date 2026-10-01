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

Responde solo con el resultado, en 3 líneas como máximo (más un "Aviso"/"Ojo" si aparece) y termina con la línea: Uso: /ar:ejecutor <codex|cline> (para instalar otros, en la terminal: agentrelay executors add <nombre>). Sin comentarios ni otras acciones.
