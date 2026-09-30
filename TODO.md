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

### Integración con VS Code (opción A: panel, sin chat propio)

La CLI sigue siendo el núcleo; la extensión es una capa fina que lee `.agentrelay/` y llama a la CLI. El chat con el orquestador sigue siendo el del propio orquestador (p. ej. Claude Code).

- [ ] Panel de AgentRelay en VS Code, solo lectura: lista de ejecuciones, actividad en directo (`events.ndjson`), informe y prompts, y diff archivo a archivo en el editor de diferencias nativo (0.0.4).
- [ ] Botones de revisión (aceptar, corregir, escalar, rechazar) que llaman a `agentrelay review` y registran **quién decide**: el usuario o el orquestador (0.0.5).
- [ ] Barra de estado con la ejecución en curso (intento, coste acumulado).
- [ ] Empaquetado como `.vsix` que incluya el motor y Cline CLI, sin necesidad de clonar ni usar npm.
- [ ] Clave del proveedor guardada en el almacén seguro de VS Code y configuración guiada la primera vez.
- [ ] Comando «AgentRelay: activar en este proyecto»: añade, con confirmación, las instrucciones de delegación al `CLAUDE.md`.
- [ ] Decidir si la extensión vive en el mismo repositorio (`vscode/`) o en uno separado.
- [ ] Aparcado: chat propio (`agentrelay chat` en terminal o pestaña de VS Code) para hablar con el orquestador a través de AgentRelay. Restricción: solo con la suscripción del usuario, sin API de pago por uso. Requiere el agente del orquestador en modo sin interfaz (comprobando antes las condiciones de uso de la suscripción), elegir el modo de permisos y depender de su instalación. Retomar cuando el resto esté estable.

### Seguridad y control del repositorio

- [ ] Carpeta que no es un repositorio git (p. ej. un sitio web sin versionar): el error debe explicar qué hacer (`git init` y un primer commit) y advertir de que `.agentrelay/` no debe quedar dentro de un directorio servido públicamente. Valorar un comando `agentrelay init` que ofrezca preparar el repositorio.
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

- [ ] Interfaz estable de ejecutores y adaptadores adicionales (Codex, Continue, otros CLIs).
- [ ] Proveedores adicionales (OpenAI, Anthropic, Qwen, Gemini…) a través de los ejecutores.
- [ ] Integración opcional para que el orquestador reciba el informe sin pasar por la terminal.
- [ ] Varias tareas en paralelo en worktrees separados.
- [ ] Registro de saldo y límites cuando el proveedor ofrezca esa información.

## 1.0.0 — Versión estable

- [ ] Revisión integral, documentación completa, ejemplos y revisión de seguridad.

## Donaciones

Cuando AgentRelay tenga suficiente madurez y utilidad podrán estudiarse donaciones voluntarias. Nunca desbloquearán funcionalidades.
