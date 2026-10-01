# TODO

Hoja de ruta orientativa. Las versiones siguen [Semantic Versioning](https://semver.org/lang/es/): `0.0.x` prototipo y correcciones, `0.1.0` MVP, `1.0.0` primera versión estable.

## 0.0.x — Prototipo

- [x] Salida en directo y comando `watch` (0.0.2).
- [x] Cline CLI como dependencia: instalación en un solo paso (0.0.2).
- [ ] Errores de credenciales del ejecutor (p. ej. "Authentication Fails"): detenerse sin reintentos, marcar la ejecución como fallida (no escalada) y mostrar un mensaje claro con el comando para configurar el proveedor (`npx cline auth …`) (0.0.3).
- [ ] `agentrelay doctor`: comprobar que el ejecutor tiene un proveedor y una credencial configurados (0.0.3). (Parcial: comprueba la sesión de Codex mediante `authStatus` en `src/cli.js` y `test/login.test.js`; el adaptador opcional de Cline no expone esa comprobación.)
- [ ] Probar el flujo de un usuario nuevo (clon limpio, sin configuración de Cline) y dejarlo documentado. Windows: clon limpio probado (0.0.2). Linux (Debian): probado.
- [x] Linux (Debian, Node 20.20.2, npm 10.8.2): tras `npm install` no existía `node_modules/.bin/cline` y AgentRelay no encontraba el ejecutor («cline: not found»). AgentRelay localiza ahora Cline sin depender del enlace de `.bin` (ejecuta `node_modules/cline/bin/cline` con Node). Probado con una ejecución real. Pendiente: confirmar en una instalación limpia en Debian.
- [x] Aceptar archivos JSON con BOM (Windows).
- [x] Versión mínima de Node: las dependencias de Cline piden Node >= 22 (avisos `EBADENGINE`). Comprobado: Cline 3.0.66 arranca con Node 20.20.2; solo avisa de que no puede leer el almacén de certificados del sistema (necesita >= 22.15; afecta a certificados corporativos o autofirmados). Decidir si se mantiene `engines` en Node 20 o se sube a 22, y documentar el aviso. (Obsoleto: Cline es opcional y no forma parte de la instalación por defecto; ver `CHANGELOG.md`.)
- [x] Revisar las vulnerabilidades que `npm install` reporta (21 en 0.0.2: 6 bajas, 14 moderadas, 1 alta), procedentes de las dependencias de Cline; evaluar si afectan a AgentRelay y actualizar Cline cuando corresponda. (Obsoleto: Cline es opcional; `CHANGELOG.md` confirma que la instalación base tiene 0 vulnerabilidades.)
- [x] README: explicar que la tarea JSON la escribe el orquestador y que la conversación se hace con él (el JSON manual queda como prueba técnica). Pendiente: reordenar el README para empezar por el flujo con orquestador.
- [x] Segundo ejecutor: Codex CLI (`executor.type: "codex"`) usando la sesión de la cuenta de ChatGPT, sin API de pago por uso (0.0.3). Comprobado con Codex CLI 0.155 (el que incluye la extensión de VS Code `openai.chatgpt`): `codex exec` no interactivo, `--json` (eventos JSONL con uso de tokens), `--output-schema` (informe final estructurado), sandbox `workspace-write` y `-m`. Modelos visibles en la cuenta: `gpt-6-luna`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`. Localiza `codex` en el PATH o, si no está, el binario de la extensión. Valores por defecto de la configuración según el tipo de ejecutor. Sin coste en dólares (Codex no lo informa). Probado de principio a fin con `gpt-6-luna` en Windows (corrección de un fallo en 36 s, informe estructurado correcto). Pendiente: probarlo en Linux y macOS.
- [x] Codex + GPT-6 Luna como ejecutor por defecto e incluido en la instalación (0.0.3): `@openai/codex` como dependencia (un solo `npm install`, sin instalar nada más; binario por plataforma), usado antes que el del PATH o el de la extensión de VS Code; valor por defecto `executor.type: "codex"` y `gpt-6-luna` (Cline sigue disponible eligiéndolo en la configuración); `agentrelay login` (abre el navegador con la cuenta de ChatGPT; `--device` para entornos sin navegador, p. ej. SSH) y `agentrelay doctor` comprueba la sesión; `run` se detiene antes de empezar con un mensaje claro si no hay sesión. Documentar el flujo de conexión en README e INSTALL. Pendiente de decidir más adelante: si Cline deja de ser dependencia por defecto (pesa y arrastra vulnerabilidades).
- [ ] La prueba de timeout de procesos (`proc: termina los procesos que superan el tiempo máximo`) falla dentro del sandbox de Codex en Windows (tarda ~30 s porque `taskkill` está restringido) pero pasa en un entorno normal. Dos ejecuciones delegadas la han dado como fallo y en una Codex intentó «arreglar» `proc.js`. Hacer que la prueba no dependa de `taskkill` o que se omita de forma explícita en ese caso, y avisar en el prompt de que no toque `proc.js` por ello.
- [ ] Codex en Windows ejecuta los comandos con PowerShell; si la política de ejecución bloquea `npm.ps1`, recurre a `npm.cmd` y lo declara como incidencia. Valorar indicarlo en el prompt para evitar el intento fallido.
- [ ] Probar DeepSeek V4 Flash como ejecutor (`deepseek-v4-flash` en `agentrelay.config.local.json`) y compararlo con Pro en tareas reales. Primera tarea (ejecutor Codex, 8 archivos): código correcto y 88 tests en verde, pero 464 s, 5,46 M tokens de entrada (casi todos de caché) y sin el bloque JSON del informe final; Cline muestra coste 0 porque no conoce su precio.

### Mejoras acordadas el 2026-10-01

Conexión y primera experiencia:

- [x] Si el usuario no tiene cuenta de ChatGPT, `agentrelay login`, `doctor` y `run` (cuando no hay sesión) le avisan de que puede crear una cuenta gratuita, con el enlace, y de que GPT-6 Luna está incluido en el plan gratuito. También en INSTALL y README.
- [x] `agentrelay doctor` avisa cuando las instrucciones globales o las del proyecto están desactualizadas y dice qué repetir (`setup` o `init`), para que actualizar no dependa de recordar los pasos.
- [x] (Hecho en `agentrelay setup`, que es el último paso de la instalación; pendiente integrarlo en el futuro instalador gráfico.) Que la instalación conecte la cuenta de la forma más fácil posible: proponer `agentrelay login` al final de `npm install` o del instalador (sin bloquear instalaciones automáticas ni CI) y, si ya hay sesión de Codex (extensión de VS Code), reutilizarla sin preguntar.
- [x] Explicar mejor, al ejecutar `setup` e `init`, qué se va a hacer: sustituir el texto genérico «Se añadirá/actualizará el bloque de AgentRelay en C:\…» por una explicación de qué es ese bloque, para qué sirve, dónde queda y cómo retirarlo (`setup --uninstall`).
- [ ] Revisar los avisos de `npm install` en Windows y Linux. Windows: `node-domexception@1.0.0` deprecado, 329 paquetes, 47 piden financiación y 21 vulnerabilidades (6 bajas, 14 moderadas, 1 alta) que vienen de las dependencias de Cline (enlaza con la revisión de vulnerabilidades y con decidir si Cline sigue instalándose por defecto). En Linux también hay avisos: recogerlos, clasificarlos (los que se pueden corregir, los que no dependen de nosotros) y documentar o eliminar los que sea posible, incluidos los `EBADENGINE` de Node 20. (Parcial: Cline ya es opcional; la instalación base tiene 0 vulnerabilidades, según `CHANGELOG.md`.)
- [ ] Instalador para Windows (por ejemplo un `.exe`/`.msi` o un script guiado) que instale Node.js y Git si faltan, AgentRelay, el comando `agentrelay`, y conecte la cuenta; valorar winget, un `.cmd` de una sola línea o un empaquetado con `pkg`/instalador Inno Setup antes de decidir.

Instalación modular de ejecutores (acordado el 2026-10-01):

- [x] `npm install` instala solo el núcleo y Codex, el ejecutor por defecto (sin avisos ni vulnerabilidades: los 21 avisos y el de `node-domexception` vienen todos de las dependencias de Cline). Cline deja de ser dependencia por defecto.
- [x] Elegir los ejecutores al instalar: `agentrelay setup` (paso del asistente de instalación) ofrece la lista de ejecutores disponibles, instala los marcados y explica cómo conectar cada uno. Los ejecutores extra se guardan en una carpeta propia del usuario (`~/.agentrelay/executors/`), no en el repositorio, para que sobrevivan a `git pull`/`npm install` y no ensucien el repositorio. No preguntar desde `npm install` (los scripts de instalación no son interactivos, se ejecutan en CI y npm reciente los bloquea por defecto).
- [x] `agentrelay executors` (listar disponibles e instalados) y `agentrelay executors add <nombre>`. Si alguien elige en la configuración un ejecutor no instalado, AgentRelay indica el comando exacto para añadirlo.
- [x] Registro de ejecutores con la información de instalación de cada uno (paquete npm, cómo conectar la cuenta), para que los futuros ejecutores (Gemini, Qwen, etc.) se añadan sin aumentar el peso de la instalación base.
- [ ] Instalador gráfico multiplataforma: sustituir el script manual por paquetes nativos que hagan la misma pregunta de ejecutores con interfaz gráfica. Windows: instalador `.exe` (Inno Setup o NSIS). Linux: paquetes `.deb` y `.rpm` (con `nfpm` o `fpm`) y/o AppImage, con un asistente gráfico sencillo (p. ej. Zenity o una pequeña aplicación multiplataforma tipo Tauri) para la selección de ejecutores y la conexión de la cuenta. macOS: `.pkg`. Calamares, que se propuso como referencia, es un instalador de sistemas operativos (particiones, distribuciones) y no de aplicaciones: no encaja; se toma solo como inspiración de la experiencia de asistente paso a paso. Todos los instaladores llaman a los mismos comandos (`agentrelay executors`, `login`, `setup`).

Triaje del orquestador (prioridad alta):

- [x] Fase A: bloque «Triaje en cada petición» en las instrucciones globales (`agentrelay setup`): en cada orden de trabajo, valoración antes de empezar comparada con el modelo activo (una línea si es pequeña, 3-5 si es de envergadura), con recomendación de modelo (Haiku, Sonnet u Opus) y esfuerzo de razonamiento tanto para subir como para bajar, avisando antes para que el usuario lo cambie con `/model`, y subagentes de modelo más barato para las partes mecánicas. Se tiene en cuenta que cambiar de modelo a mitad de conversación pierde la caché del contexto. Se aplica ahora a Claude; las estimaciones no inventan costes.
- [x] Fase B (primera versión hecha: registro, recomendación y estadísticas): **triaje adaptativo** (pedido el 2026-10-01). El triaje debe aprender de sus aciertos y errores («me pasé» o «me quedé corto») y escoger cada vez mejor **el modelo y el esfuerzo**. Esfuerzo en cuatro escalones: **bajo, medio, alto y extremo** (se corresponden con `low`, `medium`, `high` y `xhigh` del ejecutor; para Claude, con los que ofrezca su selector). Diseño:
  - [x] Registro local `~/.agentrelay/triage.jsonl` (solo en el equipo del usuario): por cada petición, tipo de tarea (consulta, mecánica, documentación, implementación, depuración, diseño, revisión), tamaño (pequeña, normal, grande), modelo y esfuerzo activos, recomendación dada y resultado (`over`: sobraba, `ok`, `under`: se quedó corto), con las señales que lo justifican.
  - [ ] (Parcial: `record --run` las deriva; falta enlazarlo solo) Señales **automáticas** en lo delegado: intentos, correcciones, escaladas, validaciones fallidas y tokens de la ejecución (ya se guardan en `.agentrelay/runs`); enlazarlas con la petición. Señales **explícitas**: el usuario dice «se pasó» o «se quedó corto»; **implícitas**: cambia de modelo a mitad, pide rehacer, o el orquestador tuvo que rehacer el trabajo.
  - [x] Comandos: `agentrelay triage record` (anota resultado), `agentrelay triage advise --tipo … --tamaño …` (recomienda modelo y esfuerzo para el orquestador y nivel y esfuerzo para el ejecutor, con número de muestras y confianza) y `agentrelay triage stats` (aciertos por tipo, modelo y esfuerzo).
  - [x] Algoritmo sencillo y explicable: escalera de configuraciones ordenadas por coste (Haiku/Sonnet/Opus × bajo/medio/alto/extremo); recomendar la más barata cuya tasa de `under` sea baja (con mínimo de muestras); subir un peldaño tras un `under` y bajar uno tras varios `ok` seguidos; valores iniciales razonados mientras no haya datos.
  - [x] **Exploración hacia abajo:** el exceso es difícil de notar (nadie se queja de que sobre potencia). Tras varios `ok` seguidos, proponer probar un escalón más barato en la siguiente tarea parecida y anotar el resultado.
  - [x] Que el orquestador lo consulte al hacer el triaje y anote el resultado al terminar (actualizar el bloque de instrucciones), con coste mínimo de tokens.
  - [ ] Triaje del ejecutor **por ejecutor y modelo** (acordado el 2026-10-01): con Codex + GPT-6 Luna el modelo del ejecutor es fijo (solo se ajustan esfuerzo y nivel), y cambiar a DeepSeek Pro, DeepSeek Flash u otro ejecutor es otro caso distinto. Guardar `executor` y `model` en cada registro del ejecutor, usar solo los registros de la combinación configurada al recomendar (empezando de cero con valores iniciales si no hay datos), marcar los registros anteriores como `codex` + `gpt-6-luna` y, cuando un ejecutor ofrezca varios modelos con datos, permitir que la escalera del ejecutor incluya el cambio de modelo. (Parcial: `src/triage.js` y `test/triage.test.js` aíslan recomendaciones por ejecutor/modelo y admiten registros antiguos opcionalmente; falta etiquetar esos registros y comparar modelos en la escalera.)
  - [ ] Mejora del algoritmo: con menos de 3 registros de un tamaño, hoy usa los de otros tamaños del mismo tipo y puede proponer una prueba hacia abajo para una tarea grande basándose en tareas normales. No explorar un escalón más barato con datos de un tamaño menor; usar esos datos solo para no subir.
  - [ ] Límites a documentar: el modelo no puede medir su propio consumo ni cambiarse solo; el aprendizaje depende de que haya feedback; los datos son locales y por usuario.
- [ ] Extender el triaje a los demás orquestadores y ejecutores cuando se admitan (Codex, Cline, etc.), con sus propios modelos y niveles de esfuerzo.
- [ ] Medir si el triaje compensa su propio coste en tokens y ajustar el umbral de envergadura a partir de los datos.

Configuración y comandos:

- [x] Centralizar toda la configuración en un solo archivo, fácil de modificar, entendible y explicado: plantilla con todas las opciones y comentarios en español (formato que admita comentarios, p. ej. JSONC o TOML; hoy es JSON sin comentarios), valores por defecto visibles, una sola ubicación para el usuario (y otra, opcional, por proyecto) y validación con mensajes claros. Incluir ejecutor, modelo, esfuerzo, nivel de orquestación, reintentos, timeouts, validaciones y política de revisión. `agentrelay config` para crearlo, mostrarlo y abrirlo.
- [ ] Sistema de comandos con `/`, al estilo de Claude Code (`/model`, `/effort`, `/level`, `/executor`, `/status`, `/config`, `/login`, `/triage`, `/help`…), para configurar y cambiar de modelo, esfuerzo, nivel o ejecutor sin editar archivos. Diseño acordado el 2026-10-01, en dos tareas:
  - [x] **Base:** nueva capa de ajustes `~/.agentrelay/settings.json` (JSON puro gestionado por los comandos, nunca a mano; así no se destruyen los comentarios del archivo explicado `config.json`), con prioridad justo por encima de `config.json` y por debajo de los archivos del proyecto; comandos de una sola orden `agentrelay set <clave> <valor>` y `unset <clave>` con alias (`model`, `effort`/`thinking` con bajo/medio/alto/extremo/máximo, `level`, `executor`); `agentrelay models` (modelos del ejecutor y esfuerzos que admite cada uno, marcando el actual; Codex los lee de su caché local de modelos); validación del esfuerzo contra el modelo; cambiar de ejecutor limpia el modelo, proveedor y comando guardados del anterior.
  - [x] **Comandos dentro del chat de Claude Code** (cambio de diseño acordado el 2026-10-01, en lugar de una consola propia): `agentrelay setup` instala comandos `/` personalizados de Claude Code en `~/.claude/commands/ar/` (archivos en `assets/claude-commands/`): `/ar:estado`, `/ar:modelo [id]`, `/ar:esfuerzo [bajo|medio|alto|extremo|máximo]`, `/ar:nivel [1-5]`, `/ar:ejecutor [codex|cline]` y `/ar:triaje`. Aparecen en el menú de `/` con autocompletado de nombre y pista de argumentos, y el prefijo `ar:` evita el choque con `/model` y `/effort` de Claude Code. Cada uno ejecuta `agentrelay` y consume un turno mínimo (`model: haiku`, `disable-model-invocation: true`). Solo se tocan los archivos con la marca `agentrelay:managed`; `doctor` avisa si están desactualizados y `setup --uninstall` los retira. Limitaciones: no completa valores dinámicamente (modelos de la cuenta) y solo sirve a quien use Claude Code.
  - [ ] Consola interactiva propia (`agentrelay` sin argumentos, con comandos sin prefijo en español y alias en inglés, `:` opcional, prompt `agentrelay ▸`) para quien no use Claude Code. Prioridad baja.
  - [ ] Después: `set --local` para escribir en `agentrelay.config.local.json`, y exponer los comandos en el panel de VS Code. (Hecho: `set --local`; falta exponer los comandos en el panel de VS Code.)
- [x] (Comprobado el 2026-10-01: Codex con GPT-6 Luna admite los esfuerzos `low`, `medium` (por defecto), `high`, `xhigh` y `max`, y no admite `none`; `executor.thinking` ya los acepta y AgentRelay no envía `none` a Codex. Falta exponerlo en los comandos `/`.) Investigar si, además del modelo, se puede cambiar el esfuerzo de razonamiento: Codex (`model_reasoning_effort`, ya soportado con `executor.thinking`; comprobar los valores válidos por modelo) y DeepSeek/Cline (`--thinking`). Exponerlo en la configuración central y en los comandos `/`.

Salida de `agentrelay watch`:

- [x] Rutas clicables: la terminal de VS Code ya abre con Ctrl+clic las rutas que existen (relativas al directorio de la terminal). Emitir enlaces explícitos (OSC 8 o rutas absolutas) para que funcione aunque `watch` no se lance en la raíz del proyecto. Comprobar en terminales de Windows, Linux y macOS.
- [ ] Ctrl+clic sobre un archivo editado abre el **diff** de la tarea (archivo en el commit de partida frente al estado actual) en el editor de diferencias de VS Code. La terminal sola no puede; se hace con la extensión de VS Code registrando un proveedor de enlaces de terminal (`registerTerminalLinkProvider`) que llama a `vscode.diff`.

- [x] Hora en cada línea (hoy solo se ve el tiempo transcurrido `[mm:ss]`): mostrar la hora local, y opcionalmente el tiempo transcurrido.
- [x] Salida mucho más amigable (primera versión hecha; pendiente revisarla en terminales de Windows, Linux y macOS y refinar con el uso): agrupar por intento, resumir las acciones en lenguaje claro (qué archivo lee/edita, qué prueba ejecuta) en vez de mostrar el comando crudo (hoy, con Codex, aparece la llamada completa a PowerShell), colores y símbolos con opción para desactivarlos, y un resumen final. Comprobar que se ve bien en los terminales de VS Code, Windows, Linux y macOS.

Precios y tarifas de DeepSeek:

- [x] Que los precios de DeepSeek sean reales: con Pro el coste mostrado no se parecía a la realidad y con Flash no se mostraba. Causa probable: Cline no tiene las tarifas de estos modelos y devuelve 0 o valores estimados. Calcularlo en AgentRelay con una tabla de precios propia y editable (entrada, entrada con caché y salida por millón de tokens), indicando que es una estimación y de dónde salen los precios.
- [x] DeepSeek tiene horas valle y horas caras: avisar al lanzar una tarea de qué tarifa se aplica en ese momento y mostrar los horarios (con la zona horaria del usuario). Comprobar primero el esquema vigente de descuentos en la documentación oficial de DeepSeek, porque cambia con el tiempo; guardar los horarios en la configuración para poder actualizarlos.

Documentación y plataformas:

- [x] Indicar en el README y en INSTALL (es/en) que no disponemos de un Mac, por lo que macOS no está probado, y pedir feedback a quien lo use mediante issues de GitHub (con enlace y qué datos aportar: versión de macOS, de Node, salida de `agentrelay doctor`).

Evaluar Qwen como ejecutor (investigado el 2026-10-01). **Prioridad baja, sin prisa: no bloquea ninguna versión.** Retomar más adelante:

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
  - [x] Instrucciones neutrales del proyecto en `AGENTS.md`; `CLAUDE.md` remite a ese archivo y `agentrelay init` escribe también allí el bloque de AgentRelay cuando ya existe.
  - [x] Protocolo obligatorio del orquestador en `AGENTS.md` (sección 24): pasos de inicio, antes de tocar archivos, antes y después de delegar, informe fiel, acciones prohibidas y problemas conocidos del ejecutor. `init` no duplica el bloque si `CLAUDE.md` importa `AGENTS.md`.
  - [x] `agentrelay init` crea por defecto `AGENTS.md` (con el bloque) y `CLAUDE.md` con `@AGENTS.md` en proyectos nuevos. `AGENTS.md` indica que el protocolo del orquestador no aplica al ejecutor (Luna lo había aplicado a sí misma y se bloqueó).
  - [x] Bloque de instrucciones del proyecto reforzado (delegar por defecto, cómo delegar y revisar) tras comprobar en un proyecto real que el orquestador no delegaba nada; `doctor` reconoce `AGENTS.md`.
  - [x] Bloque del proyecto: nota para Windows (usar `agentrelay.cmd` y un archivo temporal fuera del repositorio), tras ver a un orquestador (LongCat en opencode) bloqueado porque `agentrelay` resolvía al script de Unix.
  - [x] Ejecutor gratuito alternativo mientras Luna no tenga crédito (hasta el 24/10): adaptador **opencode** como ejecutor (`opencode run --auto --format json -m opencode/<modelo>-free`; probado: edita archivos y emite eventos JSON con tokens y coste 0). Candidatos gratuitos: nemotron-3-ultra-free, longcat-2.5-preview-free (hasta el 10/10), mimo-v2.6-flash-free. Segunda opción: Gemini CLI con cuenta de Google (~1000 peticiones/día), sin instalar.
    - Comparativa 2026-10-01 (misma tarea, 6 modelos gratuitos de opencode; prueba oculta de 26 casos): nemotron-3-ultra-free 26/26, 174 s, 24 tests propios, informe OK (elegido); space-bunny-free 26/26, 126 s; mimo-v2.6-flash-free 25/26, 60 s (el más rápido); longcat-2.5-preview-free código correcto 26/26 pero con errores de API; nemotron-3.5-lightning-free falló la validación y se colgó; fledge-alpha-free y ling-3.0-flash-fin-free fallaron al instante. Muestra de una sola tarea: repetir con una más difícil antes de fiarse.
  - [ ] Simplificar y automatizar el arranque y la continuación de un proyecto (hoy hay que hacer `git commit`, `init`, `doctor`, `watch` y reiniciar el chat a mano). Idea: un solo comando que prepare el proyecto, y que el orquestador retome el estado leyendo el repositorio.
  - [ ] **Configuración en un solo archivo** (petición reiterada del usuario; prioridad alta). Hoy hay 5 capas (valores por defecto, `~/.agentrelay/config.json`, `~/.agentrelay/settings.json`, `agentrelay.config.json`, `agentrelay.config.local.json`). Diseño acordado el 2026-10-01 (estable y fácil para quien no es técnico):
    - Un archivo global `~/.agentrelay/config.json` con TODAS las opciones, cada una con su comentario (qué hace y qué valores admite), y al final una lista comentada de los modelos instalados y disponibles de cada ejecutor (para copiar el nombre).
    - Un único archivo por proyecto, `agentrelay.config.json`, con solo lo que cambia ahí; `init` lo añade al `.gitignore` (lleva ejecutor y modelo personales).
    - Desaparecen `settings.json` y `.local.json`: migración automática con copia de seguridad (`.bak`) al primer arranque; mientras tanto se siguen leyendo con un aviso.
    - `set`/`unset` editan ese mismo archivo línea a línea, conservando los comentarios (`--local` pasa a significar «el archivo del proyecto»).
    - `agentrelay config refresh` reescribe la lista de modelos sin tocar los valores del usuario.
    - Tareas, en orden: (1) módulo de edición de texto con comentarios (`src/config-file.js`) con pruebas; (2) cargador de 2 capas + migración + `set`/`unset`; (3) lista de modelos + `config refresh`; (4) `init` + `.gitignore` + documentación.
      - [x] (3a) módulo `src/config-models.js` (genera e inserta el bloque de modelos)
      - [ ] (3b) `agentrelay config refresh` que reúne los modelos de cada ejecutor y actualiza el bloque
      - [x] (2a) módulo de migración `src/config-migrate.js` (`settings.json` y `.local.json` a los dos archivos nuevos, con copia `.bak`)
      - [x] (2b) `set`/`unset` sobre el archivo, conservando comentarios (parte A hecha: aviso de archivos antiguos, `config migrate` y migración automática al arrancar el CLI, solo desde `bin`)
        - Pendiente cosmético: al activar una opción dentro de un bloque, la sangría queda un nivel menos que en la plantilla (`"model"` con 2 espacios dentro de `executor`); es válido pero mejorable.
    - [ ] (1) módulo de edición `src/config-file.js`
    - [ ] (2) cargador de 2 capas, migración y `set`/`unset`
    - [ ] (3) lista de modelos y `config refresh`
    - [ ] (4) `init`, `.gitignore` y documentación
  - [x] `AGENTS.md` aligerado (de ~2170 a ~1590 palabras): el contexto de diseño (propósito, niveles, configuración, fases, costes) pasó a `docs/DISENO.md`; en `AGENTS.md` quedan solo las reglas de actuación.
  - [ ] Prueba de LongCat 2.5 Preview (gratis en opencode hasta el 10/10) como orquestador: `opencode -m opencode/longcat-2.5-preview-free`. Valorar el resultado y decidir si se mantiene.
  - [x] `init` en una carpeta sin git: `git init`, `.gitignore` con patrones de secretos si no existe y primer commit, pidiendo confirmación y mostrando qué archivos entrarán; avisar si la carpeta parece servida públicamente (`/var/www`, `public_html`…) porque `.agentrelay/` no debe quedar expuesto. Sin confirmación interactiva (p. ej. lo ejecuta el orquestador) requiere `--yes`.
  - [x] `run`, `watch`, `show`, `review`, `check` y `list` en una carpeta sin git: mensaje que indique ejecutar `agentrelay init`.
- [x] Guías de instalación paso a paso (`INSTALL.md` / `INSTALL.en.md`) para Windows, Linux y macOS. Pendiente: verificar la de macOS y la de Linux con una instalación limpia.
- [ ] Avisar si el usuario modifica archivos mientras el ejecutor trabaja (evita mezclar sus cambios con el diff de la tarea).
### Otros

- [x] Probar el flujo completo en Linux: Debian (Node 20.20.2) con Claude Code en VS Code y DeepSeek, proyecto de prueba (calculadora) completado.
- [ ] Probar el flujo completo en macOS.
- [x] Integración continua con tests en Windows, Linux y macOS (tres flujos en `.github/workflows/`; pendiente ver la primera ejecución real tras el push y corregir lo que falle, especialmente en macOS).
- [x] Insignias (badges) en la cabecera de README.md y README.en.md, como en AzerothCore: estado de CI de Windows, Linux y macOS (una insignia por flujo), licencia (WNCL-CU-1.0, enlazada a LICENSE), Node >= 20, versión (desde package.json), último commit y ejecutor por defecto (Codex). Añadirlas cuando los tres flujos hayan corrido en verde al menos una vez, para no mostrar «failing» ni «no status».
- [ ] Arreglar la prueba de timeout de procesos (`proc:`) y revisar el resto de pruebas para que pasen también dentro del sandbox de Codex y en todos los sistemas del CI.
- [ ] Reanudar la sesión del ejecutor en la self-review y en las correcciones (si Cline expone el identificador de sesión de forma fiable), para aprovechar su contexto y su caché.
- [x] Recuperación de ejecuciones interrumpidas (estado `running` huérfano).
- [ ] Mejorar el aviso cuando el ejecutor no devuelve el informe estructurado. (Parcial: `src/report.js` lo indica en `report.md` y conserva el texto final; falta mejorar el aviso en la salida de ejecución.)

## 0.1.0 — MVP

- [ ] Ajustar los valores por defecto de los niveles con datos de uso reales.
- [ ] Decisión de self-review y revisión basada también en el tamaño del diff y el tipo de tarea. (Parcial: `src/policy.js` ya usa complejidad y cantidad de archivos cambiados para decidir revisión/self-review; falta basarla explícitamente en el tamaño del diff y tipo de tarea.)
- [ ] Registro de consumo por proveedor y modelo (solicitudes, tokens y coste cuando el proveedor lo informe), sin inventar costes. (Parcial: `agentrelay usage` agrega ejecuciones, intentos y tokens por ejecutor/modelo; no separa proveedor ni cuenta solicitudes.)
- [x] Resumen de consumo acumulado (`agentrelay usage`).
- [ ] Plantillas de tareas por tipo (feature, fix, refactor, docs, test).
- [x] Modo silencioso y modo detallado en todos los comandos.

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
