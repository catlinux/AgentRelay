---
description: Lista las ejecuciones de AgentRelay de este proyecto (estado, intentos y objetivo)
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Ejecuciones de este proyecto:

!`agentrelay list $ARGUMENTS 2>&1`

Resume en 8 líneas como máximo: cuántas hay en total, cuántas por estado y las 5 últimas (id, estado y objetivo corto). Destaca primero las que estén en `awaiting_review`, `running` o `failed`, porque necesitan atención. Termina con esta línea independiente:

Detalle de una ejecución: /ar:ver <id>

Sin comentarios ni otras acciones.
