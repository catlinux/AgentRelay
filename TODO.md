# TODO

Hoja de ruta orientativa. Las versiones siguen [Semantic Versioning](https://semver.org/lang/es/): `0.0.x` prototipo y correcciones, `0.1.0` MVP, `1.0.0` primera versión estable.

## 0.0.x — Prototipo

- [x] Salida en directo y comando `watch` (0.0.2).
- [x] Cline CLI como dependencia: instalación en un solo paso (0.0.2).
- [ ] Errores de credenciales del ejecutor (p. ej. "Authentication Fails"): detenerse sin reintentos, marcar la ejecución como fallida (no escalada) y mostrar un mensaje claro con el comando para configurar el proveedor (`npx cline auth …`) (0.0.3).
- [ ] `agentrelay doctor`: comprobar que el ejecutor tiene un proveedor y una credencial configurados (0.0.3).
- [ ] Probar el flujo de un usuario nuevo (clon limpio, sin configuración de Cline) y dejarlo documentado. Windows: clon limpio probado (0.0.2). Linux (Debian): probado.
- [x] Linux (Debian, Node 20.20.2, npm 10.8.2): tras `npm install` no existía `node_modules/.bin/cline` y AgentRelay no encontraba el ejecutor («cline: not found»). AgentRelay localiza ahora Cline sin depender del enlace de `.bin` (ejecuta `node_modules/cline/bin/cline` con Node). Probado con una ejecución real. Pendiente: confirmar en una instalación limpia en Debian.
- [x] Aceptar archivos JSON con BOM (Windows).
- [ ] Versión mínima de Node: las dependencias de Cline piden Node >= 22 (avisos `EBADENGINE`). Comprobado: Cline 3.0.66 arranca con Node 20.20.2; solo avisa de que no puede leer el almacén de certificados del sistema (necesita >= 22.15; afecta a certificados corporativos o autofirmados). Decidir si se mantiene `engines` en Node 20 o se sube a 22, y documentar el aviso.
- [ ] Revisar las vulnerabilidades que `npm install` reporta (21 en 0.0.2: 6 bajas, 14 moderadas, 1 alta), procedentes de las dependencias de Cline; evaluar si afectan a AgentRelay y actualizar Cline cuando corresponda.
- [x] README: explicar que la tarea JSON la escribe el orquestador y que la conversación se hace con él (el JSON manual queda como prueba técnica). Pendiente: reordenar el README para empezar por el flujo con orquestador.
- [x] Segundo ejecutor: Codex CLI (`executor.type: "codex"`) usando la sesión de la cuenta de ChatGPT, sin API de pago por uso (0.0.3). Comprobado con Codex CLI 0.155 (el que incluye la extensión de VS Code `openai.chatgpt`): `codex exec` no interactivo, `--json` (eventos JSONL con uso de tokens), `--output-schema` (informe final estructurado), sandbox `workspace-write` y `-m`. Modelos visibles en la cuenta: `gpt-6-luna`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`. Localiza `codex` en el PATH o, si no está, el binario de la extensión. Valores por defecto de la configuración según el tipo de ejecutor. Sin coste en dólares (Codex no lo informa). Probado de principio a fin con `gpt-6-luna` en Windows (corrección de un fallo en 36 s, informe estructurado correcto). Pendiente: probarlo en Linux y macOS.
- [x] Codex + GPT-6 Luna como ejecutor por defecto e incluido en la instalación (0.0.3): `@openai/codex` como dependencia (un solo `npm install`, sin instalar nada más; binario por plataforma), usado antes que el del PATH o el de la extensión de VS Code; valor por defecto `executor.type: "codex"` y `gpt-6-luna` (Cline sigue disponible eligiéndolo en la configuración); `agentrelay login` (abre el navegador con la cuenta de ChatGPT; `--device` para entornos sin navegador, p. ej. SSH) y `agentrelay doctor` comprueba la sesión; `run` se detiene antes de empezar con un mensaje claro si no hay sesión. Documentar el flujo de conexión en README e INSTALL. Pendiente de decidir más adelante: si Cline deja de ser dependencia por defecto (pesa y arrastra vulnerabilidades).
- [ ] La prueba de timeout de procesos (`proc: termina los procesos que superan el tiempo máximo`) falla dentro del sandbox de Codex en Windows (tarda ~30 s porque `taskkill` está restringido) pero pasa en un entorno normal. Dos ejecuciones delegadas la han dado como fallo y en una Codex intentó «arreglar» `proc.js`. Hacer que la prueba no dependa de `taskkill` o que se omita de forma explícita en ese caso, y avisar en el prompt de que no toque `proc.js` por ello.
- [ ] Codex en Windows ejecuta los comandos con PowerShell; si la política de ejecución bloquea `npm.ps1`, recurre a `npm.cmd` y lo declara como incidencia. Valorar indicarlo en el prompt para evitar el intento fallido.
- [ ] Probar DeepSeek V4 Flash como ejecutor (`deepseek-v4-flash` en `agentrelay.config.local.json`) y compararlo con Pro en tareas reales. Primera tarea (ejecutor Codex, 8 archivos): código correcto y 88 tests en verde, pero 464 s, 5,46 M tokens de entrada (casi todos de caché) y sin el bloque JSON del informe final; Cline muestra coste 0 porque no conoce su precio.

### Mejoras acordadas el 2026-10-01

Conexión y primera experiencia:

- [x] Si el usuario no tiene cuenta de ChatGPT, `agentrelay login`, `doctor` y `run` (cuando no hay sesión) le avisan de que puede crear una cuenta gratuita, con el enlace, y de que GPT-6 Luna está incluido en el plan gratuito. También en INSTALL y README.
- [ ] Que la instalación conecte la cuenta de la forma más fácil posible: proponer `agentrelay login` al final de `npm install` o del instalador (sin bloquear instalaciones automáticas ni CI) y, si ya hay sesión de Codex (extensión de VS Code), reutilizarla sin preguntar.
- [x] Explicar mejor, al ejecutar `setup` e `init`, qué se va a hacer: sustituir el texto genérico «Se añadirá/actualizará el bloque de AgentRelay en C:\…» por una explicación de qué es ese bloque, para qué sirve, dónde queda y cómo retirarlo (`setup --uninstall`).
- [ ] Revisar los avisos de `npm install` en Windows y Linux. Windows: `node-domexception@1.0.0` deprecado, 329 paquetes, 47 piden financiación y 21 vulnerabilidades (6 bajas, 14 moderadas, 1 alta) que vienen de las dependencias de Cline (enlaza con la revisión de vulnerabilidades y con decidir si Cline sigue instalándose por defecto). En Linux también hay avisos: recogerlos, clasificarlos (los que se pueden corregir, los que no dependen de nosotros) y documentar o eliminar los que sea posible, incluidos los `EBADENGINE` de Node 20.
- [ ] Instalador para Windows (por ejemplo un `.exe`/`.msi` o un script guiado) que instale Node.js y Git si faltan, AgentRelay, el comando `agentrelay`, y conecte la cuenta; valorar winget, un `.cmd` de una sola línea o un empaquetado con `pkg`/instalador Inno Setup antes de decidir.

Instalación modular de ejecutores (acordado el 2026-10-01):

- [x] `npm install` instala solo el núcleo y Codex, el ejecutor por defecto (sin avisos ni vulnerabilidades: los 21 avisos y el de `node-domexception` vienen todos de las dependencias de Cline). Cline deja de ser dependencia por defecto.
- [x] Elegir los ejecutores al instalar: `agentrelay setup` (paso del asistente de instalación) ofrece la lista de ejecutores disponibles, instala los marcados y explica cómo conectar cada uno. Los ejecutores extra se guardan en una carpeta propia del usuario (`~/.agentrelay/executors/`), no en el repositorio, para que sobrevivan a `git pull`/`npm install` y no ensucien el repositorio. No preguntar desde `npm install` (los scripts de instalación no son interactivos, se ejecutan en CI y npm reciente los bloquea por defecto).
- [x] `agentrelay executors` (listar disponibles e instalados) y `agentrelay executors add <nombre>`. Si alguien elige en la configuración un ejecutor no instalado, AgentRelay indica el comando exacto para añadirlo.
- [x] Registro de ejecutores con la información de instalación de cada uno (paquete npm, cómo conectar la cuenta), para que los futuros ejecutores (Gemini, Qwen, etc.) se añadan sin aumentar el peso de la instalación base.
- [ ] Instalador gráfico multiplataforma: sustituir el script manual por paquetes nativos que hagan la misma pregunta de ejecutores con interfaz gráfica. Windows: instalador `.exe` (Inno Setup o NSIS). Linux: paquetes `.deb` y `.rpm` (con `nfpm` o `fpm`) y/o AppImage, con un asistente gráfico sencillo (p. ej. Zenity o una pequeña aplicación multiplataforma tipo Tauri) para la selección de ejecutores y la conexión de la cuenta. macOS: `.pkg`. Calamares, que se propuso como referencia, es un instalador de sistemas operativos (particiones, distribuciones) y no de aplicaciones: no encaja; se toma solo como inspiración de la experiencia de asistente paso a paso. Todos los instaladores llaman a los mismos comandos (`agentrelay executors`, `login`, `setup`).

Configuración y comandos:

- [ ] Centralizar toda la configuración en un solo archivo, fácil de modificar, entendible y explicado: plantilla con todas las opciones y comentarios en español (formato que admita comentarios, p. ej. JSONC o TOML; hoy es JSON sin comentarios), valores por defecto visibles, una sola ubicación para el usuario (y otra, opcional, por proyecto) y validación con mensajes claros. Incluir ejecutor, modelo, esfuerzo, nivel de orquestación, reintentos, timeouts, validaciones y política de revisión. `agentrelay config` para crearlo, mostrarlo y abrirlo.
- [ ] Sistema de comandos con `/`, al estilo de Claude Code (`/model`, `/config`, `/level`, `/status`…), para configurar y cambiar de modelo o de ejecutor sin editar archivos. Decidir dónde vive: en terminal (`agentrelay` interactivo o `agentrelay /model …`) y, más adelante, en el panel de VS Code.
- [ ] Investigar si, además del modelo, se puede cambiar el esfuerzo de razonamiento: Codex (`model_reasoning_effort`, ya soportado con `executor.thinking`; comprobar los valores válidos por modelo) y DeepSeek/Cline (`--thinking`). Exponerlo en la configuración central y en los comandos `/`.

Salida de `agentrelay watch`:

- [ ] Rutas clicables: la terminal de VS Code ya abre con Ctrl+clic las rutas que existen (relativas al directorio de la terminal). Emitir enlaces explícitos (OSC 8 o rutas absolutas) para que funcione aunque `watch` no se lance en la raíz del proyecto. Comprobar en terminales de Windows, Linux y macOS.
- [ ] Ctrl+clic sobre un archivo editado abre el **diff** de la tarea (archivo en el commit de partida frente al estado actual) en el editor de diferencias de VS Code. La terminal sola no puede; se hace con la extensión de VS Code registrando un proveedor de enlaces de terminal (`registerTerminalLinkProvider`) que llama a `vscode.diff`.

- [x] Hora en cada línea (hoy solo se ve el tiempo transcurrido `[mm:ss]`): mostrar la hora local, y opcionalmente el tiempo transcurrido.
- [x] Salida mucho más amigable (primera versión hecha; pendiente revisarla en terminales de Windows, Linux y macOS y refinar con el uso): agrupar por intento, resumir las acciones en lenguaje claro (qué archivo lee/edita, qué prueba ejecuta) en vez de mostrar el comando crudo (hoy, con Codex, aparece la llamada completa a PowerShell), colores y símbolos con opción para desactivarlos, y un resumen final. Comprobar que se ve bien en los terminales de VS Code, Windows, Linux y macOS.

Precios y tarifas de DeepSeek:

- [ ] Que los precios de DeepSeek sean reales: con Pro el coste mostrado no se parecía a la realidad y con Flash no se mostraba. Causa probable: Cline no tiene las tarifas de estos modelos y devuelve 0 o valores estimados. Calcularlo en AgentRelay con una tabla de precios propia y editable (entrada, entrada con caché y salida por millón de tokens), indicando que es una estimación y de dónde salen los precios.
- [ ] DeepSeek tiene horas valle y horas caras: avisar al lanzar una tarea de qué tarifa se aplica en ese momento y mostrar los horarios (con la zona horaria del usuario). Comprobar primero el esquema vigente de descuentos en la documentación oficial de DeepSeek, porque cambia con el tiempo; guardar los horarios en la configuración para poder actualizarlos.

Documentación y plataformas:

- [ ] Indicar en el README y en INSTALL (es/en) que no disponemos de un Mac, por lo que macOS no está probado, y pedir feedback a quien lo use mediante issues de GitHub (con enlace y qué datos aportar: versión de macOS, de Node, salida de `agentrelay doctor`).

Evaluar Qwen como ejecutor (investigado el 2026-10-01):

- [ ] El acceso gratuito de Qwen Code (OAuth) terminó el 2026-04-15, iFlow cerró el 2026-04-17 y Cerebras quitó su nivel gratuito el 2026-07-21. Vías que quedan: NVIDIA build.nvidia.com (Qwen3-Coder-480B, 256 K de contexto, 40 peticiones/minuto, sin tarjeta; condiciones «solo pruebas y evaluación»); Alibaba Model Studio Singapur (Qwen3.8 Max y otros, 1 M de tokens por modelo durante 90 días, con modo «Free Quota Only»); OpenRouter `qwen/qwen3.8-27b:free` (50 peticiones/día; 1.000/día tras una compra única de 10 $, que se mantiene aunque se gaste el saldo; comisión de tarjeta del 5,5 %). ModelScope exige teléfono chino. Local descartado (sin hardware).
- [ ] Primera prueba: NVIDIA + Qwen3-Coder-480B con Cline (proveedor compatible con OpenAI, `https://integrate.api.nvidia.com/v1`) en una tarea real, comparándolo con Codex + GPT-6 Luna. El usuario crea la clave gratuita en build.nvidia.com. Si convence: valorar OpenRouter con 10 $ y, más adelante, un adaptador nativo de Qwen Code (`qwen -p`, `--output-format stream-json`, `--json-schema`, `--approval-mode yolo`).

Uso desde el móvil (Android):

- [ ] Estudiar cómo usar AgentRelay desde el móvil. Hipótesis a comprobar: AgentRelay y Codex se ejecutan en el ordenador, así que basta controlar desde el móvil la sesión de Claude Code que lo orquesta (control remoto de Claude Code o de la extensión de VS Code, si el plan lo permite) con el ordenador encendido y con la sesión de ChatGPT iniciada. Probablemente haga falta además una forma de ver el estado en el móvil, porque `agentrelay watch` es una terminal: valorar una vista web o un resumen de estado enviado por el propio orquestador. Documentar requisitos, límites y condiciones de uso.

### Integración con VS Code (opción A: panel, sin chat propio)

La CLI sigue siendo el núcleo; la extensión es una capa fina que lee `.agentrelay/` y llama a la CLI. El chat con el orquestador sigue siendo el del propio orquestador (p. ej. Claude Code).

- [ ] Panel de AgentRelay en VS Code, solo lectura: lista de ejecuciones, actividad en directo (`events.ndjson`), informe y prompts, y diff archivo a archivo en el editor de diferencias nativo (0.0.4).
- [ ] Botones de revisión (aceptar, corregir, escalar, rechazar) que llaman a `agentrelay review` y registran **quién decide**: el usuario o el orquestador (0.0.5).
- [ ] Barra de estado con la ejecución en curso (intento, coste acumulado).
- [ ] Empaquetado como `.vsix` que incluya el motor y Cline CLI, sin necesidad de clonar ni usar npm.
- [ ] Clave del proveedor guardada en el almacén seguro de VS Code y configuración guiada la primera vez.
- [ ] Extensión de VS Code: ejecutar `agentrelay init` automáticamente al abrir una carpeta.
- [ ] Decidir si la extensión vive en el mismo repositorio (`vscode/`) o en uno separado.
- [ ] Aparcado: chat propio (`agentrelay chat` en terminal o pestaña de VS Code) para hablar con el orquestador a través de AgentRelay. Restricción: solo con la suscripción del usuario, sin API de pago por uso. Requiere el agente del orquestador en modo sin interfaz (comprobando antes las condiciones de uso de la suscripción), elegir el modo de permisos y depender de su instalación. Retomar cuando el resto esté estable.

### Seguridad y control del repositorio

- [x] Automatizar la preparación de proyectos y del orquestador (0.0.3):
  - [x] `agentrelay setup`: añade, con confirmación, un bloque delimitado con marcas al archivo de instrucciones global del orquestador (`~/.claude/CLAUDE.md`), de modo que en cualquier proyecto sepa delegar con AgentRelay sin pegar nada a mano. Reversible (`--uninstall`); solo modifica el contenido entre sus marcas.
  - [x] `agentrelay init`: prepara el proyecto. Crea `CLAUDE.md` con el bloque de AgentRelay o, si existe, lo añade sin tocar el resto; al repetirlo solo actualiza lo que hay entre las marcas. Obligatorio por ahora. (La creación de `agentrelay.config.json` pasa a `init --with-config`.)
  - [x] `init` en una carpeta sin git: `git init`, `.gitignore` con patrones de secretos si no existe y primer commit, pidiendo confirmación y mostrando qué archivos entrarán; avisar si la carpeta parece servida públicamente (`/var/www`, `public_html`…) porque `.agentrelay/` no debe quedar expuesto. Sin confirmación interactiva (p. ej. lo ejecuta el orquestador) requiere `--yes`.
  - [x] `run`, `watch`, `show`, `review`, `check` y `list` en una carpeta sin git: mensaje que indique ejecutar `agentrelay init`.
- [x] Guías de instalación paso a paso (`INSTALL.md` / `INSTALL.en.md`) para Windows, Linux y macOS. Pendiente: verificar la de macOS y la de Linux con una instalación limpia.
- [ ] Avisar si el usuario modifica archivos mientras el ejecutor trabaja (evita mezclar sus cambios con el diff de la tarea).
### Otros

- [x] Probar el flujo completo en Linux: Debian (Node 20.20.2) con Claude Code en VS Code y DeepSeek, proyecto de prueba (calculadora) completado.
- [ ] Probar el flujo completo en macOS.
- [ ] Integración continua con tests en Windows, Linux y macOS.
- [ ] Reanudar la sesión del ejecutor en la self-review y en las correcciones (si Cline expone el identificador de sesión de forma fiable), para aprovechar su contexto y su caché.
- [ ] Recuperación de ejecuciones interrumpidas (estado `running` huérfano).
- [ ] Mejorar el aviso cuando el ejecutor no devuelve el informe estructurado.

## 0.1.0 — MVP

- [ ] Ajustar los valores por defecto de los niveles con datos de uso reales.
- [ ] Decisión de self-review y revisión basada también en el tamaño del diff y el tipo de tarea.
- [ ] Registro de consumo por proveedor y modelo (solicitudes, tokens y coste cuando el proveedor lo informe), sin inventar costes.
- [ ] Resumen de consumo acumulado (`agentrelay usage`).
- [ ] Plantillas de tareas por tipo (feature, fix, refactor, docs, test).
- [ ] Modo silencioso y modo detallado en todos los comandos.

## Posteriores

- [ ] Instrucciones independientes del orquestador: hoy el bloque global es para Claude Code (`~/.claude/CLAUDE.md`). Cuando se admitan otros orquestadores o agentes (Codex, Cline…), decidir cómo darles las instrucciones de delegación (cada uno tiene su propio archivo o mecanismo).
- [ ] Bloque por proyecto opcional: detectar que el proyecto no tiene las instrucciones de AgentRelay y preguntar si se quieren añadir (ahora `init` siempre las añade). Tener en cuenta que un `CLAUDE.md` versionado haría públicas esas instrucciones.
- [ ] `init`: preguntar si se quiere subir el proyecto a un repositorio remoto y si se crea el `.gitignore`.
- [ ] Interfaz estable de ejecutores y adaptadores adicionales (Codex, Continue, otros CLIs).
- [ ] Proveedores adicionales (OpenAI, Anthropic, Qwen, Gemini…) a través de los ejecutores.
- [ ] Integración opcional para que el orquestador reciba el informe sin pasar por la terminal.
- [ ] Varias tareas en paralelo en worktrees separados.
- [ ] Registro de saldo y límites cuando el proveedor ofrezca esa información.

## 1.0.0 — Versión estable

- [ ] Revisión integral, documentación completa, ejemplos y revisión de seguridad.

## Donaciones

Cuando AgentRelay tenga suficiente madurez y utilidad podrán estudiarse donaciones voluntarias. Nunca desbloquearán funcionalidades.
