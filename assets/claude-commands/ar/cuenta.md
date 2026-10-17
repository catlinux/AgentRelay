---
description: Muestra y cambia las cuentas de ChatGPT que usa Luna
argument-hint: [número | nueva | quitar número]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
!`agentrelay cuenta $ARGUMENTS 2>&1`
