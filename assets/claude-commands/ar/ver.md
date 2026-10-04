---
description: Muestra el informe de una ejecución de AgentRelay (por defecto, la última)
argument-hint: [id]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Informe de la ejecución:

!`agentrelay show $ARGUMENTS 2>&1`

Resume en 10 líneas como máximo: estado y motivos, objetivo, intentos y resultado de cada uno, archivos modificados, validaciones y, sin recortar, las incidencias y dudas del ejecutor. No muestres el diff. Termina con esta línea independiente:

Otras ejecuciones: /ar:lista

Sin comentarios ni otras acciones.
