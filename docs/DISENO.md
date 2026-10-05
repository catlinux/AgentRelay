# AgentRelay — Diseño

Contexto de fondo del proyecto. Las reglas de actuación del orquestador están en `AGENTS.md`; lo pendiente, en `TODO.md`; lo hecho, en `CHANGELOG.md`.

## Propósito y objetivo económico

AgentRelay reduce el consumo del modelo premium: un modelo de alta capacidad (el **orquestador**, por defecto el que habla con el usuario, p. ej. Claude Code) planifica, revisa y decide, y un agente más barato (el **ejecutor**) escribe el código. Por defecto el ejecutor es Codex con GPT-6 Luna; Cline (DeepSeek u otros proveedores) y OpenCode (modelos gratuitos y de pago) son opcionales. El orquestador interviene donde aporta valor: planificar, decidir, supervisar y resolver bloqueos. Debe ser sencillo de instalar, entender, mantener y ampliar: nada de arquitecturas innecesarias.

## Política de orquestación

Una sola política, ajustable con la sección `policy` de la configuración (código en `src/policy.js`):

- el orquestador revisa siempre (`review: "always"`; también `selective` o `on-failure`);
- hasta 2 correcciones automáticas del ejecutor antes de escalar (`maxRetries`, `autoFix`);
- autorrevisión según la complejidad de la tarea: ninguna (trivial), en el propio prompt (normal) o en una segunda pasada (compleja) (`selfReview`);
- `requireValidation` exige validaciones objetivas.

Más ahorro o más supervisión se consiguen ajustando esos valores. El ejecutor devuelve un informe estructurado (estado, resumen, archivos, pruebas, problemas, dudas, escalado) en lugar de depender de texto libre; si falta, el informe lo avisa.

## Comandos

Cada comando se llama igual en el terminal (`agentrelay <comando>`) y en el chat de Claude Code (`/ar:<comando>`), con los mismos argumentos. Los archivos de `assets/claude-commands/ar/` se generan a partir de la ayuda (`src/help.js`), una por comando, salvo `watch` (no se puede seguir en directo en el chat) y `hook` (interno).

## Modelos gratuitos

La revisión diaria (`executors check`, lanzada en segundo plano el primer uso de cada día) calcula con `src/model-rank.js` el ranquing de los modelos gratuitos que la cuenta de OpenCode lista (dos pruebas sintéticas por modelo, clasificación de fallos por cuota o no disponible). Los gratuitos se detectan por los precios de models.dev (`src/free-models.js`), no solo por el sufijo `-free`. `src/free-ranking.js` ordena los utilizables y marca los agotados hasta el día siguiente. Nunca se cambia de ejecutor ni de modelo sin que lo decida el usuario, y nunca se envía código del usuario a un modelo gratuito: solo tareas de ejemplo.

## Configuración, plataformas y versiones

- **Configuración:** se cambia sin tocar el motor (ejecutor, modelo, esfuerzo, política, reintentos, tiempos, validaciones). Dos archivos con comentarios: `~/.agentrelay/config.json` (personal y perfiles) y `agentrelay.config.json` (proyecto, tiene prioridad).
- **Plataformas:** Windows, Linux y macOS; las diferencias se aíslan en una capa pequeña (`src/platform.js`, `src/proc.js`). macOS sin probar.
- **Compatibilidad futura:** las interfaces permiten adaptadores para otros agentes y proveedores; no se implementan hasta que hagan falta.
- **Versionado:** Semantic Versioning. Una versión nueva se acuerda con el usuario. Repositorio: `catlinux/AgentRelay`.
- **Costes:** se registran agente, modelo, intentos, duración y coste solo cuando el proveedor los informa; nunca se inventan.

## Regla de oro

El usuario dice qué quiere hacer y AgentRelay determina de forma eficiente quién debe hacerlo. El usuario no debería decidir a mano, tarea a tarea, qué modelo usar.
