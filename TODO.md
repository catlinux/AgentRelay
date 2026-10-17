# TODO

Solo lo pendiente. Lo hecho está en [CHANGELOG.md](CHANGELOG.md). Versiones: [Semantic Versioning](https://semver.org/lang/es/); una versión nueva se acuerda con el usuario.

## Ahora (lo que toca hacer; `agentrelay status` enseña esta sección)

Necesitan al usuario en casa o una clave:

- [ ] Probar `agentrelay start` en Taller con el orquestador y ajustar lo que falle.
- [ ] Probar con una clave real el respaldo de Luna por API (`agentrelay login --api`) y, cuando se agote la cuota gratuita, el cambio automático y la vuelta a la gratuita; confirmar el texto real del error de Codex para afinar `parseQuotaReset`.
- [ ] Probar los instaladores en equipos reales: compilar el `.exe` de Windows con Inno Setup y probarlo; probar `install-gui.sh` y el `.deb` en Debian/Ubuntu con pantalla. Después, decidir si se publican en una release de GitHub.
- [ ] Probar el flujo de un usuario nuevo (clon limpio, sin configuración previa) y dejarlo documentado. Windows y Linux (Debian) probados en la 0.0.2; falta rehacerlo con la 0.2.
- [ ] Comprobar en Linux (Debian y VPS) que `executor.network` abre la red del sandbox de Codex; en Windows ya está probado.
- [ ] **Antigravity: primera tarea real revisada** con `agentrelay use antigravity` (la del Cofre de Kolkar quedó a medias): comprobar el informe, que `watch` muestra los archivos que cambia y el texto real del error cuando se agota un cupo semanal. Después, probar Claude Sonnet 4.6 (`agentrelay use antigravity claude-sonnet-4-6`).
- [ ] Antigravity en Windows: instalador, ruta de `agy` y `login antigravity`.
- [ ] Antigravity: buscar cómo leer la cuota sin abrir `agy` (hoy solo `/usage` dentro; `-p "/usage"` no sirve). Varias cuentas: `agy` no permite cambiar su carpeta de sesión.
- [ ] Probar `agentrelay cuenta nueva` con una segunda cuenta de ChatGPT real y comprobar que `cuota` y el enrutado usan la activa. Más adelante: decidir si el enrutado debe pasar solo a la siguiente cuenta de Luna cuando se agota la activa.
- [ ] Probar `references` en una tarea real de un proyecto web con una guía de diseño.
- [ ] `agentrelay login` con una sesión ya abierta dice «ejecuta codex logout», pero `codex` no está en el PATH (va dentro de AgentRelay): dar la ruta completa o añadir `agentrelay logout`.
- [ ] Comparar DeepSeek V4 Flash y Pro como ejecutores de pago en tareas reales.

Mejoras acordadas:

- [ ] Grok Build (xAI) como ejecutor: **en espera, no se integra por ahora**. Técnicamente encaja (`grok -p` y `--output-format streaming-json`), pero la cuota gratuita no está publicada y es dudosa (necesita una suscripción de X), y en julio de 2026 se descubrió que subía repositorios enteros con `.env` a xAI. Reabrir si xAI publica la cuota gratuita y aclara la privacidad.

- [ ] Afinar la detección de cuota agotada con el texto real de cada ejecutor (Antigravity y OpenCode se detectan hoy con patrones genéricos).
- [ ] Prueba intermitente: `codex: registra la hora de reset conocida y cambia a la API` (test/codex-quota-reset.test.js) falla de vez en cuando con la máquina cargada; investigar la causa (probablemente temporización).
- [ ] Normas del proyecto para el ejecutor: `init` crea un AGENTS.md que remite a CLAUDE.md solo si AGENTS.md no existe. Pendiente decidir qué hacer con un CLAUDE.md con reglas propias junto a un AGENTS.md ajeno que no lo importa, y con las importaciones `@archivo` de CLAUDE.md. Verificar con una ejecución real de Codex que obedece la remisión a CLAUDE.md.
- Descartado tras la auditoría (no aporta a un relevo y gasta cuota o abre riesgos): buscador de skills, MCP builder y navegador para el ejecutor, y cargar reglas de diseño en cada tarea (se cubre con `references`).
- [ ] Alternativa con nvm en el instalador de Linux para distribuciones sin `apt` (decidir con el usuario).

## Más adelante

- Instalador para macOS (`.pkg`) y probar el flujo completo en macOS.
- Extensión de VS Code: panel de solo lectura (ejecuciones, actividad en directo, informe y diff archivo a archivo), botones de revisión que registren quién decide, barra de estado, empaquetado `.vsix` y clave en el almacén seguro; decidir si vive en este repositorio o en otro.
- Varias tareas en paralelo en worktrees separados.
- Reanudar la sesión del ejecutor en la autorrevisión y en las correcciones.
- Instrucciones de delegación para otros orquestadores (Codex, Cline…), no solo Claude Code.
- Integración para que el orquestador reciba el informe sin pasar por el terminal; usar AgentRelay desde el móvil.
- Registro de saldos de los proveedores cuando lo ofrezcan.
- Revisar las decisiones de autorrevisión según tamaño del diff y tipo de tarea.
- Descartados por ahora (riesgo y complejidad; reabrir si el usuario los pide): subir a un remoto en `init` y plantillas de tareas por tipo.

## 1.0.0 — Versión estable

Revisión integral, documentación completa, ejemplos y revisión de seguridad. Cuándo publicarla lo decide el orquestador cuando se cumpla esta lista.

## Donaciones

Cuando AgentRelay tenga suficiente madurez y utilidad podrán estudiarse donaciones voluntarias. Nunca desbloquearán funcionalidades.
