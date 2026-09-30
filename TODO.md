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
- [ ] Codex + GPT-6 Luna como ejecutor por defecto e incluido en la instalación (0.0.3): `@openai/codex` como dependencia (un solo `npm install`, sin instalar nada más; binario por plataforma), usado antes que el del PATH o el de la extensión de VS Code; valor por defecto `executor.type: "codex"` y `gpt-6-luna` (Cline sigue disponible eligiéndolo en la configuración); `agentrelay login` (abre el navegador con la cuenta de ChatGPT; `--device` para entornos sin navegador, p. ej. SSH) y `agentrelay doctor` comprueba la sesión; `run` se detiene antes de empezar con un mensaje claro si no hay sesión. Documentar el flujo de conexión en README e INSTALL. Pendiente de decidir más adelante: si Cline deja de ser dependencia por defecto (pesa y arrastra vulnerabilidades).
- [ ] Codex en Windows ejecuta los comandos con PowerShell; si la política de ejecución bloquea `npm.ps1`, recurre a `npm.cmd` y lo declara como incidencia. Valorar indicarlo en el prompt para evitar el intento fallido.
- [ ] Probar DeepSeek V4 Flash como ejecutor (`deepseek-v4-flash` en `agentrelay.config.local.json`) y compararlo con Pro en tareas reales. Primera tarea (ejecutor Codex, 8 archivos): código correcto y 88 tests en verde, pero 464 s, 5,46 M tokens de entrada (casi todos de caché) y sin el bloque JSON del informe final; Cline muestra coste 0 porque no conoce su precio.

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
