# AgentRelay — Instrucciones del proyecto

Este archivo es neutral: lo lee cualquier orquestador (Claude Code, opencode, Codex u otro). `CLAUDE.md` solo lo importa.

## 1. Propósito

AgentRelay es un orquestador de agentes de IA para desarrollo de software. Su objetivo principal es reducir al mínimo el consumo de modelos premium manteniendo un modelo de alta capacidad como autoridad de planificación, supervisión y validación.

Por defecto, el orquestador es el modelo que hable con el usuario (por ejemplo, Claude Code) y el ejecutor es Codex con GPT-6 Luna. Cline (con DeepSeek u otros proveedores) es un ejecutor opcional. Debe poder escalarse una tarea concreta al orquestador cuando el ejecutor no pueda resolverla.

El proyecto debe ser sencillo de instalar, entender, ejecutar, mantener y ampliar. No convertirlo en una arquitectura innecesariamente compleja.

## 2. Flujo fundamental

1. **El orquestador piensa:** comprende la petición, inspecciona el contexto necesario, planifica y divide el trabajo cuando convenga.
2. **El ejecutor trabaja:** recibe una tarea autocontenida, modifica el repositorio, ejecuta las comprobaciones y devuelve el resultado.
3. **El orquestador comprueba:** revisa diff, tests y criterios de aceptación.
4. **El ejecutor corrige:** si el problema es razonablemente corregible, recibe una nueva instrucción. El número de intentos es configurable.
5. **El orquestador toma el control:** si el ejecutor supera el límite, se bloquea o la tarea requiere razonamiento superior, el orquestador asume esa tarea concreta.
6. **El orquestador valida finalmente:** comprueba el estado final y determina que la tarea está terminada.

La comunicación debe ser estructurada y orientada a tareas, no una conversación infinita entre modelos.

## 3. Objetivo económico

La prioridad estratégica es ahorrar consumo del modelo premium del orquestador.

Por defecto, AgentRelay favorece la delegación al ejecutor siempre que sea razonablemente segura. El orquestador interviene cuando aporta valor real: planificación, decisiones complejas, supervisión, resolución de bloqueos y validación final. El sistema permite configurar cuánto se sacrifica en consumo para obtener más supervisión.

## 4. Niveles de orquestación

Hay 5 niveles configurables, desde mínima dependencia del orquestador hasta máxima supervisión:

- **Nivel 1 — Máximo ahorro:** el ejecutor hace casi todo; el orquestador solo interviene ante bloqueos o fallos graves.
- **Nivel 2 — Ahorro:** el ejecutor es el habitual; el orquestador planifica y revisa solo lo necesario.
- **Nivel 3 — Equilibrado:** el orquestador planifica y supervisa; el ejecutor ejecuta y puede corregir; escalado al alcanzar el límite.
- **Nivel 4 — Calidad:** el orquestador participa más y tolera menos errores.
- **Nivel 5 — Máxima supervisión:** el orquestador planifica y revisa prácticamente cada tarea.

Los nombres y valores son una propuesta, no una especificación inmutable.

## 5. Configuración

Debe ser fácil cambiar sin modificar el motor: proveedor, modelo, agente/CLI, nivel de orquestación, máximo de reintentos, condiciones de escalado, nivel de revisión, timeouts, comandos de validación y opciones específicas de proveedor. La configuración está separada del código. El motor no debe quedar acoplado permanentemente a Claude, Cline, Codex o DeepSeek.

## 6. Compatibilidad futura

Las interfaces deben permitir futuros adaptadores para otros agentes y proveedores (Continue, OpenAI, Anthropic, Qwen, Gemini…). No implementarlos salvo que sean necesarios para una arquitectura correcta.

## 7. Multiplataforma

Debe funcionar en Windows, Linux y macOS. No asumir Bash, PowerShell, rutas POSIX ni comandos exclusivos de un sistema. Las diferencias de plataforma quedan aisladas en una capa pequeña y clara.

## 8. Desarrollo incremental

Cada etapa deja una versión funcional y utilizable. No construir primero una gran arquitectura para usarla solo al final. El estado actual y lo pendiente están en `TODO.md` y `CHANGELOG.md`.

## 9. Versionado

Semantic Versioning (`MAJOR.MINOR.PATCH`): `0.1.0` MVP, `0.2.0` nueva capacidad, `0.2.1` corrección, `1.0.0` primera versión estable completa. No inventar números de versión: una versión nueva se acuerda con el usuario y se refleja en `package.json`, `CHANGELOG.md` y la etiqueta.

## 10. Commits

Cada cambio lógico terminado tiene su propio commit: pequeño, coherente y descriptivo. Identidad git local CatLinux y sin atribución a IA. No hacer push automáticamente ni operaciones destructivas sin autorización explícita del usuario.

## 11. GitHub

Repositorio: `catlinux/AgentRelay`.

## 12. Idioma

El repositorio está en español: README, comentarios, documentación, ayuda, ejemplos, CHANGELOG y TODO. Existe además `README.en.md` en inglés; ambos README se enlazan mutuamente en la cabecera. El código puede conservar nombres técnicos/API en inglés.

## 13. Documentación viva

Existen como mínimo `README.md`, `README.en.md`, `CHANGELOG.md` y `TODO.md`. Actualizar en cada modificación todos los documentos afectados. No crear documentación redundante.

## 14. Tareas delegadas

Las tareas para el ejecutor son autocontenidas e incluyen, cuando sea posible: objetivo, contexto relevante, restricciones, archivos o áreas afectadas, criterios de aceptación, tests esperados y condiciones que no deben modificarse.

## 15. Resultados estructurados

Los agentes devuelven, cuando sea posible: estado, resumen, archivos modificados, tests ejecutados y resultado, problemas encontrados, dudas y necesidad de escalado. Evitar depender solo de texto libre.

## 16. Seguridad y control del repositorio

AgentRelay no debe borrar trabajo del usuario, sobrescribir cambios no relacionados, hacer commits inesperados, hacer push automáticamente ni ejecutar comandos destructivos sin política explícita. Se comprueba el estado del repositorio antes de operaciones potencialmente peligrosas. Antes de crear o sobrescribir un archivo, comprobar que existe y que no está ignorado por `.gitignore`.

## 17. Coste y uso

Cuando sea posible sin complicar el núcleo, registrar agente, modelo, tarea, intentos, escalados, duración y coste conocido. No inventar costes cuando el proveedor no los proporcione.

## 18. Simplicidad

La solución más sencilla que cumpla correctamente el objetivo es preferible a una arquitectura sofisticada. Evitar bases de datos, microservicios, colas externas, servidores o sistemas de autorización complejos salvo necesidad demostrada.

## 19. Criterio técnico del orquestador

Estas instrucciones definen objetivos y restricciones, no una implementación cerrada. El orquestador debe cuestionar decisiones técnicas débiles, proponer alternativas y consultar al usuario cuando una decisión pueda cambiar sustancialmente diseño, coste, seguridad o comportamiento.

## 20. Criterio de finalización de una fase

Una fase está terminada cuando: la funcionalidad prevista funciona, existen tests adecuados, pasan los tests relevantes, la documentación afectada está actualizada, la versión está actualizada, existe un commit coherente, no quedan cambios accidentales sin explicar y el resultado se ha probado en el entorno disponible.

## 21. Regla de oro

El usuario dice qué quiere hacer y AgentRelay determina de forma eficiente quién debe hacerlo. El usuario no debería decidir manualmente en cada tarea qué modelo usar.

## 22. Modo de trabajo: delegación con AgentRelay

El desarrollo de este proyecto sigue el flujo de AgentRelay: el orquestador analiza, planifica, revisa y decide; el ejecutor implementa.

- Delegar las tareas de implementación bien acotadas con `agentrelay run - <<'EOF' … EOF` (tarea JSON con `objective`, `context`, `files`, `constraints`, `acceptanceCriteria`, `validation` y `doNotModify`).
- Usar siempre el comando `agentrelay` INSTALADO (una copia separada del código de desarrollo) y no `node bin/agentrelay.js` de esta carpeta: así, si una tarea delegada rompe el código de desarrollo, la herramienta con la que se orquesta sigue funcionando. Para probar cambios del código de desarrollo sí se usa `node bin/agentrelay.js`.
- La copia instalada se actualiza con `git pull` y `npm ci` (no `npm install`) solo con lo que esté en `main`; después `agentrelay doctor` avisa si hay que repetir `setup` o `init`.
- Antes de delegar, el árbol de trabajo debe estar limpio (commit previo) para que el diff sea solo de la tarea.
- Leer el informe (diff, validaciones, informe del ejecutor) y decidir con `agentrelay review <id> --decision accept|fix|escalate|reject`. La autorrevisión del ejecutor no sustituye esta revisión. Ejecutar `npm test` uno mismo antes de aceptar.
- El orquestador hace el trabajo directamente cuando delegar no compensa: cambios triviales, decisiones de diseño, documentación sensible, archivos internos o tareas escaladas. Si una tarea delegada rompe AgentRelay, el orquestador asume la corrección.
- Informar al usuario en el chat de qué se delega, por qué y qué se decide al revisar. El usuario puede seguir la ejecución con `agentrelay watch`.
- Informar con fidelidad: no decir que una ejecución está aceptada si `agentrelay list` no lo indica.
- Anotar el resultado del ejecutor con `agentrelay triage record --kind executor --run <id>`.

## 23. Mantener TODO.md al día

Cada mejora, corrección o decisión acordada con el usuario se anota en `TODO.md` en ese momento (con sus matices) y se marca `[x]` al completarla, junto con `CHANGELOG.md` y los README si quedan afectados.

<!-- agentrelay:start -->
## Delegación con AgentRelay

Este proyecto usa AgentRelay para delegar tareas de implementación a un agente ejecutor más económico (por defecto, Codex con GPT-6 Luna) mientras tú planificas, revisas y decides. No edites este bloque: `agentrelay init` lo actualiza.

- Delega las tareas de implementación bien acotadas con `agentrelay run -`, pasando por la entrada estándar una tarea JSON con `objective`, `context`, `files`, `constraints`, `acceptanceCriteria`, `validation` (comandos que deben pasar) y `doNotModify`. Por defecto, el repositorio debe estar limpio antes de delegar; `--allow-dirty` permite hacerlo con cambios sin confirmar.
- Haz tú directamente los cambios triviales, las decisiones de diseño y todo lo que no compense delegar.
- Lee el informe (diff, validaciones e informe del ejecutor). La autorrevisión del ejecutor no sustituye tu revisión. Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos).
- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.
- Antes de delegar, dile brevemente al usuario qué vas a delegar y por qué; el usuario puede seguir la ejecución en directo con `agentrelay watch` en otro terminal.
- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.
<!-- agentrelay:end -->
