---
description: Muestra cuánto queda de cada IA gratuita y cuándo se renueva
argument-hint: [--json]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
!`agentrelay cuota $ARGUMENTS 2>&1`
