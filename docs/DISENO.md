# AgentRelay — Contexto de diseño

Contexto de fondo del proyecto (propósito, objetivo económico, niveles, configuración, compatibilidad, fases, versionado). Las reglas de actuación del orquestador están en `AGENTS.md`. La numeración es la original.

## 1. Propósito

AgentRelay es un orquestador de agentes de IA para desarrollo de software. Su objetivo principal es reducir al mínimo el consumo de modelos premium manteniendo un modelo de alta capacidad como autoridad de planificación, supervisión y validación.

Por defecto, el orquestador es el modelo que hable con el usuario (por ejemplo, Claude Code) y el ejecutor es Codex con GPT-6 Luna. Cline (con DeepSeek u otros proveedores) es un ejecutor opcional. Debe poder escalarse una tarea concreta al orquestador cuando el ejecutor no pueda resolverla.

El proyecto debe ser sencillo de instalar, entender, ejecutar, mantener y ampliar. No convertirlo en una arquitectura innecesariamente compleja.

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

## 11. GitHub

Repositorio: `catlinux/AgentRelay`.

## 15. Resultados estructurados

Los agentes devuelven, cuando sea posible: estado, resumen, archivos modificados, tests ejecutados y resultado, problemas encontrados, dudas y necesidad de escalado. Evitar depender solo de texto libre.

## 17. Coste y uso

Cuando sea posible sin complicar el núcleo, registrar agente, modelo, tarea, intentos, escalados, duración y coste conocido. No inventar costes cuando el proveedor no los proporcione.

## 20. Criterio de finalización de una fase

Una fase está terminada cuando: la funcionalidad prevista funciona, existen tests adecuados, pasan los tests relevantes, la documentación afectada está actualizada, la versión está actualizada, existe un commit coherente, no quedan cambios accidentales sin explicar y el resultado se ha probado en el entorno disponible.

## 21. Regla de oro

El usuario dice qué quiere hacer y AgentRelay determina de forma eficiente quién debe hacerlo. El usuario no debería decidir manualmente en cada tarea qué modelo usar.
