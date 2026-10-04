---
description: Actualiza AgentRelay a la última versión (sin argumentos solo comprueba; con --yes aplica la actualización)
argument-hint: [--check] [--yes]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay update $ARGUMENTS 2>&1`

Resume en 5 líneas como máximo: si hay actualización disponible y qué cambia, o si no se ha tocado nada y por qué. Si hay una actualización pendiente de aplicar, termina con esta línea independiente:

Para aplicarla: /ar:actualizar --yes

Sin comentarios ni otras acciones.
