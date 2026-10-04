---
description: Comprueba el entorno de AgentRelay (Node, git, ejecutor, sesión, instrucciones); con --fix --yes aplica los arreglos seguros
argument-hint: [--fix --yes]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado del diagnóstico:

!`agentrelay doctor $ARGUMENTS 2>&1`

Resume en 6 líneas como máximo: qué está bien y, con detalle, cada [aviso] o [fallo] y el comando que lo arregla. Si aparece «Puedes arreglar N problema(s)», termina con esta línea independiente:

Para aplicar los arreglos seguros: /ar:doctor --fix --yes

Sin comentarios ni otras acciones.
