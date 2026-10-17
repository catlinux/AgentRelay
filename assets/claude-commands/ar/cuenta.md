---
description: Muestra y cambia las cuentas gratuitas de Luna y Gemini
argument-hint: [luna|gemini [use|remove <nombre>]]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
!`agentrelay cuenta $ARGUMENTS 2>&1`
