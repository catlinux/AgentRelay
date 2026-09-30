# Changelog

Todos los cambios relevantes de AgentRelay se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

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
