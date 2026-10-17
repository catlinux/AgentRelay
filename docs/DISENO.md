# AgentRelay — Diseño

Contexto de fondo del proyecto. Las reglas de actuación del orquestador están en `AGENTS.md`; lo pendiente, en `TODO.md`; lo hecho, en `CHANGELOG.md`.

## Propósito y objetivo económico

AgentRelay reduce el consumo del modelo premium: un modelo de alta capacidad (el **orquestador**, por defecto el que habla con el usuario, p. ej. Claude Code) planifica, revisa y decide, y un agente más barato (el **ejecutor**) escribe el código. Por defecto el ejecutor es Codex con GPT-6 Luna; OpenCode (modelos gratuitos y de pago de varios proveedores, DeepSeek incluido) es opcional. El orquestador interviene donde aporta valor: planificar, decidir, supervisar y resolver bloqueos. Debe ser sencillo de instalar, entender, mantener y ampliar: nada de arquitecturas innecesarias.

## Política de orquestación

Una sola política, ajustable con la sección `policy` de la configuración (código en `src/policy.js`):

- el orquestador revisa siempre (`review: "always"`; también `selective` o `on-failure`);
- hasta 2 correcciones automáticas del ejecutor antes de escalar (`maxRetries`, `autoFix`);
- autorrevisión según la complejidad de la tarea: ninguna (trivial), en el propio prompt (normal) o en una segunda pasada (compleja) (`selfReview`);
- `requireValidation` exige validaciones objetivas.

Más ahorro o más supervisión se consiguen ajustando esos valores. El ejecutor devuelve un informe estructurado (estado, resumen, archivos, pruebas, problemas, dudas, escalado) en lugar de depender de texto libre; si falta, el informe lo avisa.

## Comandos

Cada comando se llama igual en el terminal (`agentrelay <comando>`) y en el chat de Claude Code (`/ar:<comando>`), con los mismos argumentos. Los archivos de `assets/claude-commands/ar/` se generan a partir de la ayuda (`src/help.js`), una por comando, salvo `watch` (no se puede seguir en directo en el chat) y `hook` (interno).

## IA gratuitas

Las gratuitas son de cuenta, no de proveedor anónimo: Luna (Codex con la cuenta de ChatGPT) y Antigravity (`agy` con la cuenta de Google, cupos semanales para Gemini y para Claude/GPT). Gemini CLI y los gratuitos de OpenCode Go se retiraron: el primero porque Google lo cerró para cuentas personales, los segundos por su mala calidad (con ellos se fue `agentrelay evaluar`, que los medía). `src/quota-state.js` guarda la cuota agotada en `~/.agentrelay/quota.json`, hasta la hora indicada por el error o con reintento a los 10, 30 y 60 minutos. La cuota de Luna se lee en directo de Codex (`src/cuota.js`); la de Antigravity no se puede consultar desde fuera. El cambio automático de ejecutor solo ocurre si el usuario activa `routing.mode: "auto"`.

## Enrutado

Con `routing.mode: "auto"`, `src/router.js` ordena primero Luna con cuota gratuita, después las gratuitas de `routing.freeOrder` (por defecto Antigravity con Gemini y con Claude Sonnet 4.6) y por último la de pago de `routing.paidOrder` (por defecto solo DeepSeek V4.1 Flash de OpenCode Go; se cambia con `agentrelay orden pago`). Cada gratuita se prueba dos veces seguidas (con 5 s de pausa) si falla por cuota, saldo, límite de velocidad o un fallo pasajero de conexión, y a la segunda salta a la siguiente; si el error ya dice cuándo se restablece la cuota, salta sin reintentar. La IA de pago se prueba hasta tres veces (pausas de 5 y 15 s) solo ante un fallo pasajero (límite de velocidad, red, 502/503/504, saturación); un error definitivo (saldo insuficiente, credenciales, modelo inexistente) la detiene a la primera. Si la IA de pago sigue fallando, la tarea se detiene y se te pregunta qué IA usar: nunca continúa sola con otra. El mensaje de parada pide al orquestador preguntar al usuario qué IA usar.
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
