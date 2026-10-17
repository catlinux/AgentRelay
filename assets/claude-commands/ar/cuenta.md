---
description: Muestra y cambia las cuentas gratuitas de Luna y Gemini
argument-hint: [número | nueva luna|gemini | quitar número]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
!`agentrelay cuenta $ARGUMENTS 2>&1`
