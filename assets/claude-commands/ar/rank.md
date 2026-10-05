---
description: Muestra o calcula el ranquing de modelos gratuitos de OpenCode
argument-hint: [--run] [--detach] [--max <N>] [--json]
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Resultado:

!`agentrelay rank $ARGUMENTS 2>&1`

Muestra la tabla completa tal cual, sin resumirla. Después añade una línea con el modelo recomendado (el primero con ✔ en las dos pruebas) y recuerda que la cuota restante no se puede consultar: se deduce de las pruebas. Con --run tarda varios minutos: usa --detach para lanzarlo en segundo plano.

Mismo comando que en el terminal: agentrelay rank.
