---
description: Lanza en segundo plano un ranquing nuevo de los modelos gratuitos de OpenCode (opciones: --max N, --all)
argument-hint: [--max N | --all]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay executors rank --detach $ARGUMENTS 2>&1`

Responde solo con el resultado, en 3 líneas como máximo. Termina con esta línea independiente:

Cuando pasen unos minutos, mira el resultado con: /ar:ranquing

Sin comentarios ni otras acciones.
