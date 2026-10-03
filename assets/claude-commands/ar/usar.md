---
description: Muestra o cambia la IA ejecutora (ejecutor, modelo, esfuerzo o perfil) de AgentRelay
argument-hint: [ejecutor] [modelo] [esfuerzo] | [perfil]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay use $ARGUMENTS`

Responde solo con el resultado, en 4 líneas como máximo (más un "Aviso"/"Ojo" si aparece). Termina con esta línea independiente:

Ejemplos en el chat: /ar:usar opencode · /ar:usar codex alto · /ar:usar <perfil>

Sin comentarios ni otras acciones.
