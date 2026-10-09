---
description: Muestra los proveedores conectados y cómo conectar otros
argument-hint: [--json]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
!`agentrelay providers $ARGUMENTS 2>&1`
