# Changelog

Todos los cambios relevantes de AgentRelay se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **Ejecutor Antigravity CLI (`agy`)**, el sustituto de Gemini CLI para cuentas personales de Google: Gemini 3.8 Flash y, en un cupo aparte, Claude Opus, Claude Sonnet y GPT-OSS, con cuota semanal gratuita («Antigravity Starter Quota») y sin clave de API. Probado a mano en Linux con una cuenta gratuita (`agy -p … --output-format json` responde sin ventana). Se instala aparte (`curl -fsSL https://antigravity.google/cli/install.sh | bash`) y se conecta con `agentrelay login antigravity`, que lo abre en una carpeta vacía de AgentRelay. Por defecto `routing.freeOrder` es `["antigravity:auto", "antigravity:claude-sonnet-4-6"]`: orden Luna → Antigravity Gemini → Antigravity Claude Sonnet 4.6 → pago; cada grupo de modelos lleva su propio registro de cuota. `agentrelay cuota` lo muestra (el porcentaje exacto solo se ve con `/usage` dentro de `agy`). Como `agy` no informa de sus pasos hasta terminar, `watch` muestra cada 20 s los archivos que va cambiando en el repositorio (con `git status`, sin gastar tokens) y, si no cambia nada, cada 2 min cuánto lleva trabajando.
- **`docs/COMANDOS.md`**: todos los comandos explicados con su uso, opciones y ejemplos (generados de la misma ayuda que `agentrelay help`), con una tabla de lo esencial, los primeros pasos y los problemas habituales.
- **Varias cuentas de ChatGPT para Luna: `agentrelay cuenta` (y `/ar:cuenta`).** Lista numerada con el correo, lo que queda de cuota y cuál se usa, y pregunta cuál usar; `cuenta 2` cambia directamente (si no tiene sesión, abre el inicio de sesión), `cuenta nueva` añade otra en una carpeta propia (`~/.agentrelay/cuentas/luna/…`, con `CODEX_HOME`) y `cuenta quitar 2` la borra. Cada cuenta tiene su propio registro de cuota. Las sesiones de OpenCode y Antigravity no se tocan.
- **`agentrelay cuota` (y `/ar:cuota`)**: estado de las IA gratuitas. Luna: porcentaje que queda de cada ventana y cuándo se renueva, leído en directo del servidor local de Codex (`account/rateLimits/read`) sin gastar peticiones. Antigravity: si está agotada según el último error (su porcentaje exacto solo se ve con `/usage` dentro de `agy`).
- **Campo `references` en las tareas**: rutas de guías del proyecto (diseño, estilo, convenciones) que el ejecutor debe leer y seguir en esa tarea, sin que el orquestador copie su contenido. Se protegen como `doNotModify` y una ruta inexistente se rechaza antes de crear la ejecución. El bloque de instrucciones explica al orquestador cuándo usarlo.
- **`agentrelay orden` (y `/ar:orden`)** para ver y cambiar el orden del enrutado con nombres claros, sin editar JSON: `orden` muestra el orden actual con el estado de cada IA; `orden pago <nombre>` fija la principal de pago (las demás siguen detrás) o, con varios nombres, la lista exacta; `orden gratis <modelos>` fija los gratuitos de OpenCode Go; `orden reset` vuelve al valor por defecto. Catálogo de nombres: `luna-chatgpt`, `luna-go`, `luna-api`, `deepseek-flash-go`, `deepseek-pro-go`, `deepseek-flash-api`, `deepseek-pro-api`; los mismos sirven como atajos de `agentrelay use`. Solo escribe en la configuración de usuario y avisa si un proyecto la anula.
- **El bloque de `agentrelay init` pide valorar un script antes de delegar.** Si la tarea es repetitiva, masiva o mecánica y un script la resuelve de forma fiable y más barata, el orquestador lo escribe y lo ejecuta en lugar de gastar tokens.
- **Instalador de Windows en GitHub.** El flujo `.github/workflows/release-windows.yml` compila `AgentRelay-Setup.exe` con Inno Setup al subir una etiqueta `v*` y lo adjunta a la release (enlace fijo a la última: `releases/latest/download/AgentRelay-Setup.exe`); a mano (Actions → «Instalador de Windows») lo deja como artefacto sin crear release. El `.exe` no está firmado.
- **`docs/GUIA.md`**: guía corta de qué hace AgentRelay y cómo se usa (ejecutores, IA gratuitas, uso diario, enrutado automático, mantenimiento y problemas habituales).
- **Cline retirado.** DeepSeek rinde igual por OpenCode (`deepseek/deepseek-flash` y `deepseek/deepseek-v4-pro`, comprobado con las mismas tareas en las cuatro combinaciones), así que AgentRelay ya no incluye el ejecutor Cline. Una configuración o un perfil con `executor.type: "cline"` se lee como OpenCode con DeepSeek y avisa para que cambies el archivo; `agentrelay use cline` explica cómo pasar a OpenCode. Los instaladores de Windows y Debian ya no ofrecen Cline.
- **Enrutado automático de ejecutores** (`routing.mode: "auto"`, desactivado por defecto; actívalo con `agentrelay set routing auto`). Cada tarea empieza por el primer ejecutor disponible: Luna con la cuota gratuita de ChatGPT, los modelos gratuitos de `routing.freeOrder` y, al agotarse, la de pago de `routing.paidOrder` (por defecto DeepSeek V4.1 Flash de OpenCode Go). Cada **gratuita** se prueba dos veces seguidas (con 5 s de pausa) si falla por cuota, saldo, límite de velocidad o un fallo pasajero de conexión, y a la segunda salta a la siguiente; si el error ya dice cuándo se restablece la cuota, salta sin reintentar. La **IA de pago** se prueba hasta tres veces (pausas de 5 y 15 s) solo ante un fallo pasajero (límite de velocidad, red, 502/503/504, saturación); un error definitivo (saldo insuficiente, credenciales, modelo inexistente) la detiene a la primera. Si la IA de pago sigue fallando, la tarea **se detiene y se te pregunta qué IA usar**: nunca continúa sola con otra. `watch` muestra cada reintento (con su pausa) y cada cambio, y el informe tiene una sección «Enrutado» con los cambios, el aviso de privacidad y si se ha pagado. Un modelo fijado en la tarea desactiva el enrutado para esa tarea.
- **Estado de cuota generalizado** (`src/quota-state.js`, guardado en `~/.agentrelay/quota.json`): disponible, agotado hasta la hora que dice el error, o desconocido con reintento a 10, 30 y 60 minutos; por modelo y por proveedor. Lo usan OpenCode (antes: agotado hasta medianoche) y Codex, que mantiene su comportamiento.
- **Modelo retirado o inexistente.** Los errores 410/404 de modelo (`model not found`, retirado, obsoleto…) se clasifican como `unavailable` y la ejecución falla con un mensaje claro en lugar de reintentar o hablar de cuota.
- **Comandos iguales en el terminal y en el chat.** Cada comando de `agentrelay` tiene su `/ar:<comando>` con el mismo nombre y los mismos argumentos (sin `watch` ni `hook`). Los archivos se generan a partir de la ayuda. En el chat, los que cambian algo (`setup`, `init`, `start`, `update`) se aplican añadiendo `--yes`.
- **Protección de la configuración.** `run` y `doctor` comprueban que el modelo existe para el ejecutor antes de gastar intentos (evita el 404 de Codex con un modelo de DeepSeek), y `use` avisa si el archivo del proyecto vuelve a fijar el ejecutor, el modelo, el proveedor o el esfuerzo que acabas de cambiar.
- **Avisos en los informes:** ejecutor sin informe estructurado y archivos cambiados que no declaró (por ejemplo, ediciones tuyas durante la ejecución). Si una ejecución falla por cuota, se proponen alternativas con el comando exacto.
- **Luna con respaldo por API de pago.** El límite de uso del plan gratuito de ChatGPT («You've hit your usage limit») ahora se detecta como cuota agotada. Con `agentrelay login --api` guardas una clave de API de OpenAI en un perfil propio (`~/.agentrelay/codex-api/`, sin tocar tu sesión de ChatGPT) y, si se agota la cuota gratuita, el mismo intento continúa con la API de pago. Siempre se prueba primero la gratuita: se lee del error la hora de restablecimiento (o se reintenta cada 10 minutos), se registran agotamientos y restablecimientos, y se vuelve a la gratuita en cuanto esté disponible. `doctor` y el informe lo muestran; `executor.apiFallback: false` lo desactiva. `agentrelay set` ya no rompe un JSON escrito a mano al añadir una clave nueva.
- `agentrelay login opencode` conecta OpenCode sin necesidad de tenerlo en el PATH (abre su asistente y después muestra el estado de la sesión). La comprobación de sesión de OpenCode acepta cualquier cuenta guardada (Zen, Go, API, consola…) y, si falla, dice qué respondió OpenCode; todos los mensajes remiten ya a `agentrelay login opencode`. El instalador de Linux deja `~/.local/bin` en el PATH de forma permanente (`--no-path` lo evita).
- `agentrelay setup` avisa de que las instrucciones solo se cargan en sesiones nuevas de Claude Code y, si no puede escribir el archivo global, lo explica con claridad.
- **Instaladores** en `installer/` (sin probar en equipos reales): `install.ps1` y un asistente de Inno Setup para Windows; `install.sh`, un asistente con Zenity y `build-deb.sh` para Debian/Ubuntu.

- **Acceso a internet para los ejecutores.** Codex corre en un sandbox sin red por defecto; ahora AgentRelay añade `sandbox_workspace_write.network_access=true` (nuevo ajuste `executor.network`, activo por defecto; `false` lo desactiva) y el prompt del ejecutor indica que use Node (`fetch`) en lugar de `curl`/`Invoke-WebRequest`, que fallan por TLS dentro del sandbox de Windows. Probado en Windows con Luna y con Cline/DeepSeek extrayendo datos reales de Wowhead.

### Cambiado

- **`routing.freeOrder` pasa a `["antigravity:auto", "antigravity:claude-sonnet-4-6"]`** (antes Cat Jam y LongCat de OpenCode Go, que rendían mal). Orden por defecto del enrutado: Luna → Antigravity con Gemini → Antigravity con Claude Sonnet 4.6 → DeepSeek V4.1 Flash de pago.
- **`use --list` y el selector de OpenCode** muestran primero los modelos de `routing.freeOrder` (marcados «gratis» y, si la cuota lo indica, «agotado hasta HH:MM»), después los de `paidOrder` («de pago»); `--all` lista todo lo que devuelve `opencode models`. Las alternativas tras agotar la cuota sugieren las entradas de `freeOrder` y `opencode-go/deepseek-v4.1-flash` como opción de pago.
- **Triaje en un solo sitio.** El triaje sale del bloque de proyecto y queda solo en el bloque global: una vez por orden, recomienda modelo y esfuerzo para el orquestador; si es el actual sigue, y si hay que cambiarlo espera la confirmación del usuario. El esfuerzo del ejecutor lo fija el orquestador sin esperar. Ningún bloque supone un ejecutor concreto, y `init` se pregunta siempre antes de ejecutarlo.
- **Sin revisión diaria automática.** `run` y `start` ya no lanzan nada en segundo plano. La variable `AGENTRELAY_NO_MODEL_CHECK` deja de tener efecto.
- Documentación revisada y reducida: manual, instalación, README, diseño y TODO (solo lo pendiente).
- Los tests ya no dependen de la configuración personal del usuario.

### Eliminado

- **Gratuitos de OpenCode Go y sus herramientas, antes de publicarse:** `agentrelay evaluar` (medía los modelos `-free` de OpenCode Go), `agentrelay providers` y el catálogo de proveedores gratuitos (Zen, Mistral, OpenRouter, Z.AI). Los gratuitos de OpenCode rendían mal y se sustituyen por Antigravity. `setup` borra los `/ar:evaluar` y `/ar:providers` ya instalados.
- **Gemini CLI, antes de publicarse:** Google lo cerró en junio de 2026 para cuentas personales («This client is no longer supported for Gemini Code Assist for individuals»). Una configuración con `executor.type: "gemini"` o entradas `gemini:` en `routing.freeOrder` se lee sin fallar y avisa.
- **Ranquing antiguo, sin rastro:** `agentrelay rank` y `/ar:rank`, `agentrelay executors check`, el informe diario de ejecutores (`.agentrelay/EJECUTORES.md`, con el saldo de DeepSeek), las pruebas sintéticas, `model-checks.json` y las notas por revisiones (`review` ya no puntúa modelos). Los módulos `model-rank`, `free-ranking`, `model-check`, `free-models` y `executors-report` se borran. `setup` retira el `/ar:rank` ya instalado y `doctor` avisa de `model-checks.json`; `doctor --fix` lo borra.
- Los nombres en castellano de los comandos del chat (`/ar:estado`, `usar`, `ayuda`, `lista`, `ver`, `actualizar`, `iniciar`, `ranquing`, `ranquing-nuevo`): ahora se llaman como en el terminal (`/ar:status`, `use`, `help`, `list`, `show`, `update`, `start`, `rank`). `agentrelay setup` los retira.
- La antigua revisión diaria de 5 modelos nuevos, `executors rank` (ahora `rank`) y los documentos `docs/PLAN.md` y `docs/MODELOS.md`.

### Corregido

- **`update` y `setup` se cortaban en Windows al ofrecer instalar Antigravity**, que no se instala con npm («no se instala con AgentRelay»). Ahora no se ofrece: si falta, se explica cómo instalarlo con el instalador oficial de cada sistema (`irm https://antigravity.google/cli/install.ps1 | iex` en Windows, `curl … install.sh | bash` en Linux y macOS) y `setup` sigue. AgentRelay encuentra `agy` también donde lo deja su instalador en Windows (`%LOCALAPPDATA%\Antigravity\agy.exe`).
- **Al agotarse la cuota, las alternativas propuestas eran comandos inválidos** (`agentrelay use opencode antigravity:auto`) y no conocían Antigravity ni las cuentas de Luna: ahora proponen Antigravity con Gemini o con Claude según su cupo, otra cuenta de Luna y DeepSeek.
- **Codex: la hora de reinicio de la cuota con fecha y ordinal («try again at Oct 23rd, 2026 10:09 AM») ahora se entiende**, y el tope de espera pasa de 8 a 14 días. Antes se ignoraba y se volvía a probar Luna cada 10, 30 y 60 minutos aunque faltaran días; ahora queda agotada hasta esa fecha.
- **Enrutado: un límite de velocidad ya no agota los reintentos en el mismo modelo.** Con `routing.mode: "auto"`, un error «Rate limit exceeded» / 429 / «too many requests» se trata como cuota agotada: el modelo queda en espera unos minutos y la tarea sigue con el siguiente de la lista. Fuera del enrutado el comportamiento no cambia (el límite de velocidad no se toma por cuota agotada).
- **El ejecutor no recibía las normas del proyecto cuando solo existía CLAUDE.md.** Codex lee `AGENTS.md` y no `CLAUDE.md` (OpenCode sí recurre a él), y `init` solo escribía en CLAUDE.md si AGENTS.md no existía, así que las reglas del proyecto nunca llegaban al ejecutor. Ahora, con un ejecutor que no lee CLAUDE.md y un CLAUDE.md con normas propias, `init` crea un `AGENTS.md` con un bloque que remite a CLAUDE.md (sin copiar sus normas, para que no se queden anticuadas, y sin el bloque de orquestación); los siguientes `init` lo mantienen y no lo sustituyen por el de orquestación. Un AGENTS.md ya existente no se toca fuera de su bloque. Si aun así no hay AGENTS.md (por ejemplo, sin haber ejecutado `init`), AgentRelay incluye el contenido propio de CLAUDE.md en el prompt de cada intento, y `status` (y `ESTADO.md`) lo avisa con la línea «Instrucciones del ejecutor».
- **Codex en Windows: «apply deny-read ACLs».** En algunos equipos el sandbox elevado de Windows impedía a Codex crear ningún proceso. AgentRelay lanza ahora Codex con `windows.sandbox=unelevated` en Windows (no en Linux), salvo que `executor.extraArgs` ya fije `windows.sandbox`.
- `INSTALL.md` e `INSTALL.en.md` aún ofrecían Cline en el instalador de Windows y usaban `npm install` (que puede reescribir `package-lock.json` y hacer fallar `agentrelay update`); ahora indican OpenCode y `npm ci`.
- **Modelos inservibles para un agente.** Un error `Request too large … tokens per minute` (el plan gratuito permite menos tokens por minuto de los que ocupa el prompt del agente, p. ej. 2.000 frente a ~8.000 en `groq/gpt-oss-safeguard-20b`) se clasifica como modelo no disponible y ya no cuenta como cuota agotada; los modelos que generan imágenes o audio no se evalúan.
- **El informe del enrutado explica los modelos saltados por cuota agotada** (antes solo salían los no instalados o sin sesión).
- **Pruebas y tareas con OpenCode en otra carpeta.** OpenCode toma su carpeta de trabajo de la variable `PWD` que hereda (y las versiones nuevas envían `run` a un servicio en segundo plano con su propia carpeta). Resultado: las ejecuciones podían correr en la carpeta desde la que lanzaste AgentRelay, no encontraban `.prompt.md` y fallaban. Ahora se fija `PWD` a la carpeta real y se usa `--standalone` cuando la versión lo admite.
- El adaptador de OpenCode leía mal los errores (el mensaje viene en `error.message`), con lo que no se detectaban bien la cuota agotada ni el modelo no disponible.
- El prompt del ejecutor indica usar `npm.cmd` si PowerShell bloquea `npm.ps1`.

## [0.2.0] - 2026-10-04

Simplificación (menos comandos, una sola política de revisión), `agentrelay use`, comandos `/ar:` completos en Claude Code, ayuda por comando, `doctor --fix`, hook de delegación, OpenCode instalable y revisión diaria de modelos gratuitos. **Cambio incompatible:** se eliminan los niveles de orquestación 1-5, el triaje que aprende, `usage`, `pricing` y `models` (ver «Eliminado»).

### Añadido

- Ayuda por comando: `agentrelay help <comando>` y `agentrelay <comando> --help` muestran descripción, uso, opciones y ejemplos de cada comando; `agentrelay help` sin argumentos muestra la ayuda general.
- Seis comandos nuevos en el chat de Claude Code, para poder hacer desde allí lo mismo que en el terminal: `/ar:ayuda [comando]`, `/ar:doctor`, `/ar:lista`, `/ar:ver [id]`, `/ar:actualizar` y `/ar:iniciar`. Los que cambian algo (`/ar:actualizar`, `/ar:iniciar`, `/ar:doctor --fix`) no aplican nada sin `--yes`. Se instalan con `agentrelay setup`.

- Informe diario de ejecutores: el mismo disparo diario (o `agentrelay executors check`) escribe `.agentrelay/EJECUTORES.md` en la carpeta de AgentRelay, sobrescribiéndolo cada día (sin historial), aunque no haya OpenCode. Empieza por los saldos (DeepSeek, si defines `DEEPSEEK_API_KEY`; OpenAI no tiene API de saldo y se enlaza a su panel) y sigue con el ejecutor en uso y, por ejecutor, instalación, sesión y modelos con las marcas de la prueba diaria. `executors check` ya no falla si falta OpenCode: omite la prueba de modelos y genera el informe.

- Revisión diaria de los modelos gratuitos de OpenCode: el primer uso de cada día (`run` o `start`), en segundo plano y sin bloquear nada, AgentRelay prueba con una tarea sintética mínima los modelos `-free` que aún no conoce (nunca se envía código del usuario). El resultado se guarda en `~/.agentrelay/model-checks.json` y `agentrelay use --list` y el menú de `use` marcan cada modelo como `✔ probado`, `✘ no pasó la prueba` o `· sin probar`. Un modelo fallido se vuelve a probar a los 7 días. Nunca se cambia solo de modelo. Comando manual: `agentrelay executors check [--force]`; se desactiva con `AGENTRELAY_NO_MODEL_CHECK=1`.

- Hook de delegación para Claude Code: `agentrelay setup` añade a `settings.json` un hook PreToolUse que, al ir a editar código en un proyecto con AgentRelay, recuerda al orquestador delegar con `agentrelay run` (como mucho una vez cada 15 minutos por sesión). Respeta el resto de tu configuración, se omite con `--no-hook`, se retira con `setup --uninstall` y `doctor` comprueba su estado. Si `settings.json` no es JSON válido, no lo toca.

- OpenCode se instala desde AgentRelay como Cline (`agentrelay executors add opencode`, o al elegirlo con `agentrelay use opencode`): paquete npm oficial `opencode-ai` en `~/.agentrelay/executors`. Si ya lo tienes en el PATH, se sigue usando.

- La tarea JSON admite los campos opcionales `effort` y `model`, que sustituyen al esfuerzo y al modelo de la configuración solo en esa ejecución (el orquestador los elige según la dificultad).

- `agentrelay doctor --fix`: arregla lo que es seguro y reversible (instrucciones globales y comandos `/ar:` desactualizados, instrucciones del proyecto si el árbol está limpio, ejecuciones interrumpidas y entradas que faltan en `.gitignore`), preguntando antes de cada arreglo. Sin `--fix`, `doctor` avisa de cuántos arreglos hay. No arregla una sesión caducada: sigue indicando `agentrelay login`.

- `agentrelay init` y `agentrelay start` avisan y piden confirmación si se ejecutan dentro de la propia carpeta de AgentRelay (por ejemplo, la copia instalada, donde un commit impediría `agentrelay update`). Con `--yes` no preguntan.

- `agentrelay use`: cambia de IA con un solo comando. Sin argumentos y en un terminal es interactivo (elige ejecutor, modelo y esfuerzo con números, ofrece instalar el ejecutor y guardar la elección como perfil); con argumentos va directo en cualquier orden (`use opencode`, `use codex gpt-5.5 alto`, `use bajo`). `use --save <nombre>` guarda lo actual como perfil y `use <nombre>` lo aplica. `use --list` muestra todos los ejecutores y sus modelos (con el esfuerzo que admite cada uno, si están instalados y su coste). En el chat de Claude Code: `/ar:usar`.

- Manual de uso con ejemplos, organizado por tareas («quiero hacer X»): `docs/MANUAL.md`.
- Plan de trabajo paso a paso para cada punto pendiente, pensado para que lo siga un orquestador con un modelo pequeño: `docs/PLAN.md`.

### Cambiado

- Triaje del orquestador en AgentRelay (no depende de las instrucciones personales de cada usuario): el bloque global que instala `setup` ahora también pide decir con qué esfuerzo se lanza al ejecutor (campo `effort` de la tarea), y el bloque de cada proyecto (`init`) incluye un apartado «Triaje antes de trabajar» con el modelo y esfuerzo del orquestador, para quien no haya ejecutado `setup`. Tras actualizar: `agentrelay setup` (global) y `agentrelay init` (proyecto).

- README (es/en) reescrito y reducido de 494 a 119 líneas: qué es, ejecutores, instalación, empezar en 3 pasos y seguridad; la referencia de comandos pasa al manual. Estaba desfasado (decía 0.0.3 y no mencionaba OpenCode).
- INSTALL (es/en): «Cómo empezar» usa `agentrelay start`, se menciona `agentrelay update` para actualizar y los enlaces a secciones retiradas del README apuntan al manual.

### Eliminado

- Triaje adaptativo: `agentrelay triage record|advise|stats`, su historial `triage.jsonl` y `/ar:triaje`. Se mantiene la recomendación de modelo y esfuerzo para el orquestador en las instrucciones globales; solo se quita la parte que aprendía de los resultados.

- `agentrelay usage` y `agentrelay pricing` (resumen de consumo y tabla de precios y tarifas de DeepSeek), y el aviso de tarifa al lanzar una tarea. El informe de cada ejecución sigue mostrando los tokens de cada intento.

- Niveles de orquestación 1-5: `--level`, `set level`, `/ar:nivel` y la opción `level`. Se sustituyen por una sola política (revisión siempre, 2 reintentos, autorrevisión según la complejidad) que se ajusta con la sección `policy`. Una opción `level` antigua en la configuración se ignora con un aviso. Cambio incompatible: la próxima versión debería ser la 0.2.0 (a acordar).

- `agentrelay models`, el listado de `agentrelay executors` (queda `executors add <nombre>`), `config refresh` y la lista de modelos dentro del archivo de configuración; los sustituyen `agentrelay use` y `agentrelay use --list`.
- Comandos de chat `/ar:modelo`, `/ar:esfuerzo`, `/ar:ejecutor` y `/ar:nivel`; los sustituye `/ar:usar`. `agentrelay setup` los borra del equipo si llevan la marca de AgentRelay (los que sean tuyos se respetan).

### Corregido

- Las opciones que activan `set` y `use` dentro de un bloque de la configuración (`executor`, `policy`, `validation`, `report`) quedan con 2 espacios más de sangría que su bloque.

- Si el ejecutor falla por credenciales (clave inválida, 401, sesión caducada) o por cuota/saldo, AgentRelay se detiene sin reintentos ni escaladas, marca la ejecución como `failed` y explica qué revisar (`agentrelay doctor`, `agentrelay login`, saldo del proveedor o `agentrelay set`). Un 429 por límite de velocidad sigue el camino normal. Los errores guardados en el estado y en los eventos ocultan las claves de API.
- La prueba de timeout de `proc` ya no tarda 30 s cuando `taskkill` está restringido (sandbox de Codex).
- `agentrelay update` ya no devuelve error cuando `doctor` avisa de algo (por ejemplo, que no hay sesión iniciada): la actualización se considera hecha y `doctor` solo informa.
- Los tests no dependen de la identidad global de git (`start` hacía un primer commit y fallaba en los runners de Windows y Linux de GitHub Actions, que no la tienen) y son robustos frente a `safe.directory` y a los finales de línea. Confirmado con una ejecución real de CI en Windows, Linux y macOS.

## [0.1.0] - 2026-10-03

MVP: configuración en un solo archivo, ejecutores Codex y OpenCode, triaje adaptativo, `start`, `status`, `update` y comandos `/` de Claude Code.

### Añadido

- Ejecutor **OpenCode** (`agentrelay set executor opencode`): usa `opencode run --auto --format json` con los modelos gratuitos de OpenCode (por ejemplo `opencode/nemotron-3-ultra-free`) o los de Ollama en la nube (`ollama/...:cloud`). Lee los tokens y no inventa costes (los modelos gratuitos salen a 0). Tras una comparativa con la misma tarea en seis modelos gratuitos, `nemotron-3-ultra-free` fue el más fiable.
- Si `opencode models` falla o sale vacío en frío, se reintenta una vez antes de dar la lista por vacía.
- El bloque de instrucciones del proyecto incluye una nota para Windows: usar `agentrelay.cmd` y guardar la tarea JSON en un archivo temporal fuera del repositorio.
- `agentrelay set` y `unset` con `--local` (o `--project`): guardan un ajuste solo en el proyecto actual, en `agentrelay.config.json`, sin perder los comentarios del archivo.
- Rutas clicables en la salida en directo (`watch`, `run`, `review`): las rutas de lo que el ejecutor lee o edita son enlaces de terminal (OSC 8) a la ruta absoluta, que se abren con Ctrl+clic desde cualquier carpeta. Se activan solos en las terminales compatibles; `AGENTRELAY_LINKS=1` los fuerza y `=0` los desactiva.
- Precios reales de DeepSeek: `agentrelay pricing` (tabla oficial, tarifa vigente, próximo cambio y horas punta en hora local; archivo opcional `~/.agentrelay/pricing.json`), aviso de la tarifa al lanzar una tarea con DeepSeek y coste estimado por AgentRelay en `usage`, en lugar de la cifra inexacta de Cline (por ejemplo, 0,63 USD frente a 0,42 USD para las mismas ejecuciones; con Flash, que no tenía precio, 0,066 USD). Sin precio no hay coste: Codex sigue mostrando `-`. No se tienen en cuenta los festivos chinos.
- `agentrelay recover` detecta y permite recuperar ejecuciones interrumpidas que siguen en estado `running` sin proceso activo ni actividad reciente, sin tocar el repositorio.

- Opciones globales `-q`/`--quiet` para mostrar solo errores, avisos y resultados esenciales, y `-v`/`--verbose` para añadir detalles de diagnóstico; no se pueden combinar y no cambian los códigos de salida.

- `agentrelay usage` muestra el consumo acumulado por ejecutor y modelo, con filtros por fecha y ejecutor y salida JSON.
- Comandos `/` de Claude Code instalados por `agentrelay setup` en `~/.claude/commands/ar/`: `/ar:estado`, `/ar:modelo`, `/ar:esfuerzo`, `/ar:nivel`, `/ar:ejecutor` y `/ar:triaje`, con autocompletado en el chat (escribe `/ar`) y el prefijo `ar:` para no chocar con `/model` y `/effort` de Claude Code. Solo se modifican los archivos con la marca `<!-- agentrelay:managed -->`; `doctor` avisa si están desactualizados, `setup --uninstall` los retira y `setup --no-commands` los omite. Repite `agentrelay setup` para recibirlos: también retira los comandos `/agentrelay:…` de una versión anterior si los tenías (solo los que lleven la marca).
- Ajustes rápidos sin editar archivos: `agentrelay set <clave> <valor>` (`model`, `effort` con bajo/medio/alto/extremo/máximo, `level`, `executor`, `provider`, `timeout`), `agentrelay unset <clave>` y `agentrelay models` (modelos de la cuenta con los esfuerzos que admite cada uno, marcando el activo; Codex los lee de su caché local). Editan `~/.agentrelay/config.json` en su sitio, sin destruir los comentarios del archivo explicado. Se valida el resultado, se avisa si un archivo del proyecto lo sustituye o si el modelo no admite el esfuerzo, y cambiar de ejecutor olvida el modelo guardado del anterior.

### Cambiado

- **Configuración en un solo archivo.** Solo hay dos: `~/.agentrelay/config.json` (global) y `agentrelay.config.json` en la raíz del proyecto (tus preferencias, que `agentrelay init` añade al `.gitignore`). Desaparecen las capas `~/.agentrelay/settings.json` y `agentrelay.config.local.json`: al arrancar cualquier comando se migran solas a los dos archivos con una copia `.bak` (`agentrelay config migrate [--dry-run]` lo hace a mano) y, si queda alguno, solo se avisa.
- `agentrelay set` y `unset` editan el archivo de configuración línea a línea y conservan todos los comentarios; si el archivo no existe se crea desde la plantilla explicada.
- `agentrelay config init` crea el archivo con todas las opciones comentadas y, en el global, una lista de los modelos de cada ejecutor (Codex, Cline/DeepSeek y OpenCode) con el modelo en uso señalado. `agentrelay config refresh [--only <ejecutor>] [--dry-run]` actualiza esa lista sin tocar tus valores.
- `agentrelay init` añade `agentrelay.config.json` al `.gitignore` del proyecto y lo confirma junto a las instrucciones; `agentrelay config path` lista los dos archivos.
- Las instrucciones del proyecto son neutrales: viven en `AGENTS.md` (versionado) y `CLAUDE.md` solo lo importa. `agentrelay init` es neutral: en un proyecto nuevo crea `AGENTS.md` con el bloque de AgentRelay y un `CLAUDE.md` que solo lo importa (`@AGENTS.md`); si `AGENTS.md` ya existe, el bloque va también allí, y solo allí si `CLAUDE.md` lo importa.
- El bloque de instrucciones del proyecto es más claro y firme: delegar por defecto toda implementación no trivial (y explicar por qué si no se delega), cómo preparar el árbol de git, un ejemplo de tarea con `agentrelay run -`, y cómo revisar y aceptar. `agentrelay doctor` reconoce el bloque en `AGENTS.md`, también cuando `CLAUDE.md` solo lo importa.

## [0.0.3] - 2026-10-01

### Añadido

- Conectar la cuenta de ChatGPT forma parte de la instalación: `agentrelay setup` propone iniciar sesión al final (`--login` lo hace sin preguntar; `--yes` nunca abre el navegador por sí solo). `login` y `setup` detectan los equipos sin navegador (sesión SSH o Linux sin entorno gráfico) y usan por sí solos el código de dispositivo; `login --browser` fuerza el navegador. La detección está aislada en `src/platform.js`.
- `agentrelay doctor` comprueba si las instrucciones de AgentRelay del orquestador (globales) y del proyecto están al día y avisa con `[aviso]` de si hay que repetir `agentrelay setup` o `agentrelay init` tras actualizar. Procedimiento de actualización documentado (README e INSTALL): `git pull`, `npm ci`, `agentrelay doctor` y reiniciar `watch`.
- Triaje adaptativo: `agentrelay triage record | advise | stats` guarda en local (`~/.agentrelay/triage.jsonl`) cómo funcionó cada elección de modelo y esfuerzo para cada tipo y tamaño de tarea (resultado `over`: sobró, `ok` o `under`: se quedó corto) y recomienda para la siguiente el modelo (Haiku, Sonnet u Opus) y el esfuerzo (bajo, medio, alto o extremo) del orquestador, y el esfuerzo y el nivel del ejecutor. Sube un escalón tras quedarse corto y, tras varios aciertos seguidos, propone probar uno más barato. `record --run <id>` deriva el resultado de una ejecución delegada (intentos, correcciones, escaladas). Las instrucciones del orquestador (`agentrelay setup`) le indican consultarlo y anotar el resultado.
- Corregido en macOS: las rutas que muestran `run` y `watch` salían como `/private./archivo` cuando la carpeta de trabajo era un enlace simbólico (`/var` ↔ `/private/var`). La integración continua en macOS (Apple Silicon e Intel) ya pasa.
- Configuración central y explicada: los archivos de configuración admiten comentarios (JSON con comentarios) y hay un archivo personal (`~/.agentrelay/config.json`) además de los del proyecto. `agentrelay config init` lo crea con todas las opciones comentadas y explicadas, `agentrelay config` muestra la configuración efectiva con el origen de cada valor y `agentrelay config path` los archivos. Validación con mensajes claros y aviso de erratas en los nombres de las opciones (`config`, `doctor`, `run`). `init --with-config` crea la plantilla comentada del proyecto.
- Integración continua (GitHub Actions) en Windows, Linux (x64, arm64 y varias distribuciones) y macOS (Apple Silicon e Intel) con Node 20, 22, 24 y la última versión, en tres flujos separados por sistema.
- Triaje del orquestador: el bloque global de instrucciones (`agentrelay setup`) indica al orquestador que, ante peticiones de envergadura, haga en cada orden de trabajo una valoración antes de empezar y la compare con el modelo que tiene activo: una línea en las peticiones pequeñas y 3-5 en las de envergadura (tamaño y riesgo, reparto entre orquestador y ejecutor, nivel de orquestación), recomendando el modelo (Haiku, Sonnet u Opus) y el esfuerzo de razonamiento con los que trabajar, también para bajar de modelo cuando la tarea es liviana, y avisando antes para que el usuario pueda cambiarlo con `/model`. Repite `agentrelay setup` para recibirlo.
- README e INSTALL indican que macOS no está probado (no hay Mac disponible) y piden feedback mediante incidencias de GitHub.
- Instalación modular de ejecutores: `npm install` instala solo el núcleo y Codex (de 332 a 3 paquetes y 0 vulnerabilidades; los avisos venían de Cline). `agentrelay executors` lista los ejecutores y `agentrelay executors add <nombre>` instala los opcionales en `~/.agentrelay/executors` (fuera de la carpeta de AgentRelay). `agentrelay setup` ofrece instalarlos (`--executors cline` sin preguntas).
- Instrucciones de actualización con `npm ci` en lugar de `npm install` (no reescribe `package-lock.json`) y cómo resolver el error de `git pull` cuando `package-lock.json` tiene cambios locales (README, INSTALL).
- Salida en directo (`run`, `review` y `watch`) más amigable: hora local en cada línea, acciones en lenguaje claro («lee src/config.js», «ejecuta los tests») en lugar de la llamada cruda del intérprete de comandos, intentos agrupados, números abreviados, colores opcionales (`NO_COLOR` y salida redirigida los desactivan) y un estado final en español con el siguiente paso sugerido.
- `agentrelay setup`: instala (con confirmación) un bloque delimitado con marcas en las instrucciones globales de Claude Code (`~/.claude/CLAUDE.md`) para que delegue con AgentRelay en cualquier proyecto; `--uninstall` lo retira. Solo modifica lo que hay entre las marcas.
- `agentrelay init`: prepara el proyecto añadiendo el bloque de instrucciones al `CLAUDE.md` (lo crea o lo añade sin tocar el resto, conservando finales de línea y BOM) y ofrece confirmar solo ese archivo.
- `init` en una carpeta sin repositorio git: `git init`, `.gitignore` con patrones de secretos (si no existía) y primer commit, con plan y confirmación previos, detección de archivos sensibles y aviso de carpetas servidas públicamente. Nunca modifica un `.gitignore` existente.
- `run`, `watch`, `show`, `review`, `check` y `list` fuera de un repositorio indican ejecutar `agentrelay init`.
- Codex con GPT-6 Luna es ahora el ejecutor por defecto, y `@openai/codex` se instala con AgentRelay (un solo `npm install`; se usa antes que el del `PATH` o el de la extensión de VS Code). Cline sigue disponible con `executor.type: "cline"`.
- Si no hay sesión de ChatGPT, `login`, `doctor` y `run` avisan de que se puede crear una cuenta gratuita en chatgpt.com (GPT-6 Luna está incluido en el plan gratuito).
- `agentrelay setup` e `init` explican qué es el bloque de instrucciones, dónde se instala, que solo se toca lo que hay entre las marcas y cómo retirarlo.
- `agentrelay login [--device]`: conecta la cuenta de ChatGPT con Codex (abre el navegador; `--device` para equipos sin navegador). Si ya hay sesión, lo indica y no hace nada.
- `agentrelay doctor` muestra el estado de la sesión del ejecutor y `agentrelay run` se detiene antes de empezar, con un aviso claro, si no hay sesión iniciada.
- Ejecutor Codex (`executor.type: "codex"`): usa Codex CLI de OpenAI con la sesión de la cuenta de ChatGPT, sin clave de API. Lo localiza en el `PATH` o en la extensión de OpenAI para VS Code, pide el informe final con un esquema JSON (`--output-schema`), trabaja en el sandbox `workspace-write` y registra los tokens sin inventar coste. Probado con `gpt-6-luna` en una tarea real.
- Valores por defecto de `executor` según el tipo elegido: basta `{"executor": {"type": "codex"}}` para cambiar de ejecutor.
- Guías de instalación paso a paso para Windows, Linux y macOS (`INSTALL.md` e `INSTALL.en.md`), enlazadas desde los README.
- Documentado que, al actualizar, hay que reiniciar `agentrelay watch` si estaba abierto y que no hace falta repetir `init` ni `setup` salvo indicación del CHANGELOG (README, INSTALL y CLAUDE.md).

### Corregido

- El informe y la vista en directo ya no muestran `null/null` cuando el ejecutor no tiene proveedor o modelo configurado, y el coste total aparece como desconocido (`-`) si el ejecutor no lo informa, en lugar de `0.0000 USD`.
- AgentRelay localiza Cline por sí mismo aunque falte el enlace `node_modules/.bin/cline`, que con npm 10 en Linux no se creaba tras `npm install` («cline: not found»). Si no hay enlace, ejecuta el lanzador del paquete con el propio Node.
- Los archivos JSON de configuración y de tarea con BOM (los que guardan el Bloc de notas o PowerShell en Windows) ya se aceptan.

### Cambiado

- Cline deja de instalarse con AgentRelay: quien lo use debe instalarlo una vez con `agentrelay executors add cline` (una copia instalada antes dentro de AgentRelay se sigue encontrando).
- Cambio de comportamiento: el ejecutor por defecto pasa de Cline con DeepSeek a Codex con GPT-6 Luna. Quien use Cline debe indicar `{ "executor": { "type": "cline" } }` en su configuración. Los proyectos que ya tenían el bloque de instrucciones lo actualizan con `agentrelay init`.
- `agentrelay init` ya no crea `agentrelay.config.json` por defecto: ahora se hace con `init --with-config`.
- Validado el flujo completo en Linux (Debian, Node 20) con un proyecto real.
- README: aclarado que la tarea JSON la redacta el orquestador y que la conversación se hace con él; indicada la versión de Node recomendada.

## [0.0.2] - 2026-09-30

Actividad en directo e instalación en un solo paso.

### Añadido

- Instalación modular de ejecutores: `npm install` instala solo el núcleo y Codex (de 332 a 3 paquetes y 0 vulnerabilidades; los avisos venían de Cline). `agentrelay executors` lista los ejecutores y `agentrelay executors add <nombre>` instala los opcionales en `~/.agentrelay/executors` (fuera de la carpeta de AgentRelay). `agentrelay setup` ofrece instalarlos (`--executors cline` sin preguntas).
- Salida en directo en `run` y `review`: fases, archivos que el ejecutor lee o edita, comandos que ejecuta, razonamiento resumido, tokens, coste estimado y validaciones, con marca de tiempo `[mm:ss]`. `--quiet` la desactiva.
- Registro de eventos estructurados por ejecución en `.agentrelay/runs/<id>/events.ndjson`.
- Comando `agentrelay watch [id]` para seguir en directo, desde otro terminal, las ejecuciones lanzadas por otro proceso.
- Proyecto de demostración (`examples/demo`) y tarea de ejemplo (`examples/demo-task.json`) con una guía para probar AgentRelay en pocos minutos.

### Cambiado

- Cline deja de instalarse con AgentRelay: quien lo use debe instalarlo una vez con `agentrelay executors add cline` (una copia instalada antes dentro de AgentRelay se sigue encontrando).
- Cline CLI pasa a ser una dependencia de AgentRelay (versión fijada 3.0.66): `npm install` instala todo lo necesario y AgentRelay usa esa copia por defecto.
- `examples/task.example.json` se sustituye por `examples/demo-task.json`.

### Corregido

- Con Ctrl+C en Linux y macOS, los procesos hijos se terminan sin impedir que otros comandos (como `watch`) salgan limpiamente.

## [0.0.1] - 2026-09-30

Primera versión: prototipo funcional del flujo de delegación.

### Añadido

- Instalación modular de ejecutores: `npm install` instala solo el núcleo y Codex (de 332 a 3 paquetes y 0 vulnerabilidades; los avisos venían de Cline). `agentrelay executors` lista los ejecutores y `agentrelay executors add <nombre>` instala los opcionales en `~/.agentrelay/executors` (fuera de la carpeta de AgentRelay). `agentrelay setup` ofrece instalarlos (`--executors cline` sin preguntas).
- CLI `agentrelay` con los comandos `run`, `show`, `review`, `check`, `list`, `doctor` e `init`.
- Ejecutor Cline CLI en modo headless (`--json`), con proveedor y modelo configurables (por defecto, DeepSeek `deepseek-v4-pro`).
- Tareas autocontenidas en JSON: objetivo, contexto, archivos, restricciones, criterios de aceptación, comandos de validación y archivos protegidos.
- Validaciones objetivas: comandos de validación, control de archivos protegidos y detección de commits creados por el ejecutor.
- Corrección automática con límite de reintentos y escalado al orquestador.
- Self-review configurable del ejecutor (`none`, `inline`, `pass`) según nivel y complejidad, con omisión de la pasada separada cuando es redundante.
- Revisión del orquestador: `accept` (con validación final), `fix`, `escalate` y `reject`.
- Cinco niveles de orquestación, del máximo ahorro a la máxima supervisión, con ajustes sustituibles.
- Informe por ejecución (Markdown y JSON) con diff, validaciones, informe del ejecutor, tokens y coste estimado por el ejecutor.
- Estado de cada ejecución en `.agentrelay/runs/<id>/`, ignorado por git.
- Configuración en `agentrelay.config.json` y `agentrelay.config.local.json`.
- Soporte multiplataforma: las diferencias entre Windows y Linux/macOS se limitan a `src/proc.js`.
- Tests automáticos con un simulador del ejecutor.
