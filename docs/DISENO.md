# AgentRelay — Contexto de diseño

Contexto de fondo del proyecto (propósito, objetivo económico, política de orquestación, configuración, compatibilidad, fases, versionado). Las reglas de actuación del orquestador están en `AGENTS.md`. La numeración es la original.

## 1. Propósito

AgentRelay es un orquestador de agentes de IA para desarrollo de software. Su objetivo principal es reducir al mínimo el consumo de modelos premium manteniendo un modelo de alta capacidad como autoridad de planificación, supervisión y validación.

Por defecto, el orquestador es el modelo que hable con el usuario (por ejemplo, Claude Code) y el ejecutor es Codex con GPT-6 Luna. Cline (con DeepSeek u otros proveedores) es un ejecutor opcional. Debe poder escalarse una tarea concreta al orquestador cuando el ejecutor no pueda resolverla.

El proyecto debe ser sencillo de instalar, entender, ejecutar, mantener y ampliar. No convertirlo en una arquitectura innecesariamente compleja.

## 3. Objetivo económico

La prioridad estratégica es ahorrar consumo del modelo premium del orquestador.

Por defecto, AgentRelay favorece la delegación al ejecutor siempre que sea razonablemente segura. El orquestador interviene cuando aporta valor real: planificación, decisiones complejas, supervisión, resolución de bloqueos y validación final. El sistema permite configurar cuánto se sacrifica en consumo para obtener más supervisión.

## 4. Política de orquestación

Hasta la 0.1.0 había 5 niveles configurables (de «máximo ahorro» a «máxima supervisión»). Se sustituyeron el 2026-10-03 por **una sola política** más sencilla de entender, que se puede ajustar con la sección `policy` de la configuración:

- el orquestador revisa siempre (`review: "always"`; también `selective` o `on-failure`);
- hasta 2 correcciones automáticas del ejecutor antes de escalar (`maxRetries`, `autoFix`);
- autorrevisión del ejecutor según la complejidad de la tarea: ninguna (trivial), en el propio prompt (normal) o en una segunda pasada (compleja) (`selfReview`);
- `requireValidation` exige que la tarea tenga validaciones objetivas.

Para más ahorro o más supervisión se ajustan esos valores, no un número de nivel. El código está en `src/policy.js`.

## 5. Configuración

Debe ser fácil cambiar sin modificar el motor: proveedor, modelo, agente/CLI, política de orquestación, máximo de reintentos, condiciones de escalado, nivel de revisión, timeouts, comandos de validación y opciones específicas de proveedor. La configuración está separada del código. El motor no debe quedar acoplado permanentemente a Claude, Cline, Codex o DeepSeek.

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
