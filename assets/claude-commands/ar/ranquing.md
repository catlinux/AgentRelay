---
description: Muestra el último ranquing de los modelos gratuitos de OpenCode (de mejor a peor como ejecutor)
allowed-tools: Bash(agentrelay *)
disable-model-invocation: true
model: haiku
---
<!-- agentrelay:managed -->
Último ranquing guardado:

!`agentrelay executors rank --show 2>&1`

Muestra la tabla completa tal cual, sin resumirla. Después añade, en una o dos líneas, qué modelo recomiendas como ejecutor y por qué (el primero con ✔ en las dos pruebas y más rápido) y recuerda que la cuota restante no se puede consultar: se deduce de las pruebas. Termina con esta línea independiente:

Para recalcularlo (tarda varios minutos y consume cuota gratuita): /ar:ranquing-nuevo

Sin comentarios ni otras acciones.
