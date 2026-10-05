---
description: Comprueba el entorno y puede aplicar arreglos seguros
argument-hint: [--fix]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay doctor $ARGUMENTS 2>&1`

Resume en 6 líneas como máximo: qué está bien y, con detalle, cada [aviso] o [fallo] y el comando que lo arregla.

Mismo comando que en el terminal: agentrelay doctor.
