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

La revisión diaria (`executors check`, lanzada en segundo plano el primer uso de cada día) evalúa con tres pruebas los modelos gratuitos de todos los proveedores conectados de `src/free-providers.js`. El inventario está en `src/free-models.js`; `src/model-rank.js` calcula el ranquing y `src/free-ranking.js` ordena los utilizables. `src/quota-state.js` guarda la cuota agotada hasta la hora indicada por el error o reintenta a los 10, 30 y 60 minutos. Las pruebas usan tareas de ejemplo, nunca código del usuario. El cambio automático de ejecutor solo ocurre si el usuario activa `routing.mode: "auto"`.

## Enrutado

Con `routing.mode: "auto"`, `src/router.js` ordena primero Luna con cuota gratuita y los gratuitos aptos por nivel y nota; después añade las de pago de `routing.paidOrder`, sin tope de gasto.
`src/orchestrator.js` puede cambiar de entrada a mitad de tarea sin consumir reintentos, hasta `routing.maxSwitches` cambios.
Credenciales o un modelo no disponible también hacen pasar a la siguiente entrada, solo para esa ejecución.
Cada tarea nueva vuelve a probar las entradas gratuitas desde el principio.
El aviso de privacidad solo informa; no altera el orden.
Se usa una cuenta por proveedor: se rota entre proveedores, nunca entre cuentas del mismo proveedor.

## Configuración, plataformas y versiones

- **Configuración:** se cambia sin tocar el motor (ejecutor, modelo, esfuerzo, política, reintentos, tiempos, validaciones). Dos archivos con comentarios: `~/.agentrelay/config.json` (personal y perfiles) y `agentrelay.config.json` (proyecto, tiene prioridad).
- **Plataformas:** Windows, Linux y macOS; las diferencias se aíslan en una capa pequeña (`src/platform.js`, `src/proc.js`). macOS sin probar.
- **Compatibilidad futura:** las interfaces permiten adaptadores para otros agentes y proveedores; no se implementan hasta que hagan falta.
- **Versionado:** Semantic Versioning. Una versión nueva se acuerda con el usuario. Repositorio: `catlinux/AgentRelay`.
- **Costes:** se registran agente, modelo, intentos, duración y coste solo cuando el proveedor los informa; nunca se inventan.

## Regla de oro

El usuario dice qué quiere hacer y AgentRelay determina de forma eficiente quién debe hacerlo. El usuario no debería decidir a mano, tarea a tarea, qué modelo usar.
