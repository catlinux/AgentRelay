# TODO

Solo lo pendiente. Lo hecho está en [CHANGELOG.md](CHANGELOG.md). Versiones: [Semantic Versioning](https://semver.org/lang/es/); una versión nueva se acuerda con el usuario.

## Ahora (lo que toca hacer; `agentrelay status` enseña esta sección)

Necesitan al usuario en casa o una clave:

- [ ] Probar `agentrelay start` en Taller con el orquestador y ajustar lo que falle.
- [ ] Probar con una clave real el respaldo de Luna por API (`agentrelay login --api`) y, cuando se agote la cuota gratuita, el cambio automático y la vuelta a la gratuita; confirmar el texto real del error de Codex para afinar `parseQuotaReset`.
- [ ] Probar los instaladores en equipos reales: compilar el `.exe` de Windows con Inno Setup y probarlo; probar `install-gui.sh` y el `.deb` en Debian/Ubuntu con pantalla. Después, decidir si se publican en una release de GitHub.
- [ ] Probar el flujo de un usuario nuevo (clon limpio, sin configuración previa) y dejarlo documentado. Windows y Linux (Debian) probados en la 0.0.2; falta rehacerlo con la 0.2.
- [ ] Comprobar en Linux (Debian y VPS) que `executor.network` abre la red del sandbox de Codex; en Windows ya está probado.
- [ ] Comparar DeepSeek V4 Flash y Pro como ejecutores en tareas reales (con `DEEPSEEK_API_KEY` definida también se consulta el saldo en el informe diario).
- [ ] Probar el informe diario y el ranquing automático en un uso real de varios días; ajustar lo que moleste.

Mejoras acordadas:

- [ ] Proveedores con cuota gratuita vía OpenCode (NVIDIA, Groq, Gemini, Mistral, OpenRouter, Z AI): catálogo, `agentrelay providers`, ranquing multiproveedor, cadena opt-in `executor.freeChain` y aviso de privacidad (no bloqueo). Se prueban todos y se quitan los que fallen. Plan: [.agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md](.agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md).

- [ ] Cadena de ejecutores: cuando se agota Luna (cuota gratuita por cuenta) el aviso ya propone alternativas (y, con respaldo `login --api`, Luna continúa con la API de pago y vuelve a la gratuita al restablecerse); con otros ejecutores nunca se cambia solo; falta afinar con el texto real del error de cuota de Codex y OpenCode (hoy se detecta con patrones genéricos).
- [ ] Ranquing: más pruebas (hoy son dos) para distinguir mejor entre modelos que pasan ambas.
- [ ] `doctor`: comprobar proveedor y credencial de Cline (hoy solo comprueba la sesión de Codex).
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
