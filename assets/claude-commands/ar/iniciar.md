---
description: Prepara el proyecto actual para trabajar con AgentRelay (sin --yes no cambia nada y explica qué haría)
argument-hint: [--yes]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay start $ARGUMENTS 2>&1`

Resume en 6 líneas como máximo: qué ha comprobado o preparado y qué falta. Si no se ha cambiado nada porque falta confirmación, explica en una línea qué haría (puede crear el repositorio git, los archivos de instrucciones y commits) y termina con esta línea independiente:

Para aplicarlo: /ar:iniciar --yes

Sin comentarios ni otras acciones.
