---
description: Prueba los modelos gratuitos de OpenCode Go y propone el orden de freeOrder
argument-hint: [--models a,b] [--runs N] [--no-apply] [--revert]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay evaluar $ARGUMENTS 2>&1`

Muestra el informe y la propuesta tal cual, sin resumirlos. Recuerda que la evaluación tarda varios minutos y que, salvo con --no-apply, ya ha aplicado el nuevo routing.freeOrder (se deshace con --revert).

Mismo comando que en el terminal: agentrelay evaluar.
