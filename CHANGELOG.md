# Changelog

Todos los cambios relevantes de AgentRelay se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

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
