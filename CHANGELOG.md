# Changelog

Todos los cambios relevantes de AgentRelay se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Sin publicar]

### Corregido

- AgentRelay localiza Cline por sí mismo aunque falte el enlace `node_modules/.bin/cline`, que con npm 10 en Linux no se creaba tras `npm install` («cline: not found»). Si no hay enlace, ejecuta el lanzador del paquete con el propio Node.
- Los archivos JSON de configuración y de tarea con BOM (los que guardan el Bloc de notas o PowerShell en Windows) ya se aceptan.

### Cambiado

- README: aclarado que la tarea JSON la redacta el orquestador y que la conversación se hace con él; indicada la versión de Node recomendada.

## [0.0.2] - 2026-09-30

Actividad en directo e instalación en un solo paso.

### Añadido

- Salida en directo en `run` y `review`: fases, archivos que el ejecutor lee o edita, comandos que ejecuta, razonamiento resumido, tokens, coste estimado y validaciones, con marca de tiempo `[mm:ss]`. `--quiet` la desactiva.
- Registro de eventos estructurados por ejecución en `.agentrelay/runs/<id>/events.ndjson`.
- Comando `agentrelay watch [id]` para seguir en directo, desde otro terminal, las ejecuciones lanzadas por otro proceso.
- Proyecto de demostración (`examples/demo`) y tarea de ejemplo (`examples/demo-task.json`) con una guía para probar AgentRelay en pocos minutos.

### Cambiado

- Cline CLI pasa a ser una dependencia de AgentRelay (versión fijada 3.0.66): `npm install` instala todo lo necesario y AgentRelay usa esa copia por defecto.
- `examples/task.example.json` se sustituye por `examples/demo-task.json`.

### Corregido

- Con Ctrl+C en Linux y macOS, los procesos hijos se terminan sin impedir que otros comandos (como `watch`) salgan limpiamente.

## [0.0.1] - 2026-09-30

Primera versión: prototipo funcional del flujo de delegación.

### Añadido

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
