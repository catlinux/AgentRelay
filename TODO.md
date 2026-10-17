# TODO

Solo lo pendiente. Lo hecho está en [CHANGELOG.md](CHANGELOG.md). Versiones: [Semantic Versioning](https://semver.org/lang/es/); una versión nueva se acuerda con el usuario.

## Ahora (lo que toca hacer; `agentrelay status` enseña esta sección)

Necesitan al usuario en casa o una clave:

- [ ] Probar `agentrelay start` en Taller con el orquestador y ajustar lo que falle.
- [ ] Probar con una clave real el respaldo de Luna por API (`agentrelay login --api`) y, cuando se agote la cuota gratuita, el cambio automático y la vuelta a la gratuita; confirmar el texto real del error de Codex para afinar `parseQuotaReset`.
- [ ] Probar los instaladores en equipos reales: compilar el `.exe` de Windows con Inno Setup y probarlo; probar `install-gui.sh` y el `.deb` en Debian/Ubuntu con pantalla. Después, decidir si se publican en una release de GitHub.
- [ ] Probar el flujo de un usuario nuevo (clon limpio, sin configuración previa) y dejarlo documentado. Windows y Linux (Debian) probados en la 0.0.2; falta rehacerlo con la 0.2.
- [ ] Comprobar en Linux (Debian y VPS) que `executor.network` abre la red del sandbox de Codex; en Windows ya está probado.
- [ ] Activar y probar el enrutado con `routing.mode: "auto"` y OpenCode Go: Luna gratis → Cat Jam → LongCat → DeepSeek V4.1 Flash. Comprobar que el cambio por cuota funciona con el error real de Go (hoy se detecta con patrones genéricos) y si el cupo de Go es global o por modelo (las barras de la consola son globales; la documentación dice por modelo).
- [ ] Ronda de pruebas más dura de los ejecutores gratuitos y de Go (cambios en 3-4 archivos, instrucciones ambiguas, casos de «no puedo»): la primera ronda la pasaron los 8 modelos y no separa la calidad.
- [ ] `agentrelay login` con una sesión ya abierta dice «ejecuta codex logout», pero `codex` no está en el PATH (va dentro de AgentRelay): dar la ruta completa o añadir `agentrelay logout`.
- [ ] **Prueba real de `agentrelay evaluar`** (paso 10 del plan): ya está implementado (comando, retirada del ranquing antiguo, documentación) pero solo probado con simulados. Falta ejecutarlo con los gratuitos reales de OpenCode Go (`agentrelay evaluar --no-apply`), comprobar que las 4 tareas y los umbrales discriminan, revisar el informe, aplicarlo y confirmar con una tarea real que el enrutado usa el nuevo orden. Plan: [.agents/plans/evaluar-gratuitos/evaluar-gratuitos.PLAN.md](.agents/plans/evaluar-gratuitos/evaluar-gratuitos.PLAN.md).
- [ ] Añadir OpenCode Go a `src/free-providers.js` (hoy sale sin dato de privacidad) y corregir el nombre antiguo `deepseek-v4-flash` en el catálogo y en `src/alternatives.js` (ahora `deepseek-flash` o `opencode-go/deepseek-v4.1-flash`).
- [ ] Comparar DeepSeek V4 Flash y Pro como ejecutores en tareas reales (con `DEEPSEEK_API_KEY` definida también se consulta el saldo en el informe).

- [x] Antigravity CLI (`agy`) integrado como sustituto de Gemini (probado a mano en Linux: modo `-p` con JSON funciona con la cuenta gratuita).
- [ ] Antigravity: lanzar una tarea real con `agentrelay use antigravity`, confirmar el texto del error cuando se agota el cupo semanal; Claude Sonnet 4.6 ya es la tercera gratuita (con su propio cupo). Buscar cómo leer la cuota sin abrir `agy` (hoy solo `/usage` dentro). Probar en Windows (instalador y ruta de `agy`). Varias cuentas: agy no permite cambiar su carpeta de sesión.
- [ ] ~~Probar Gemini en casa~~ (descartado: Google ya no lo admite gratis) (integrado sin cuenta de Google: solo probado con simulados y hasta el paso de autenticación). `agentrelay executors add gemini`, `agentrelay login gemini`, `agentrelay cuota` (comprobar que salen los modelos, el porcentaje y la hora de renovación) y una tarea real con `agentrelay use gemini`. Confirmar el texto real del error de cuota agotada.
- [ ] **Gemini en Windows: `cuota` da HTTP 400 al renovar el token** (la sesión existe). Repetir con la versión que muestra el motivo de Google y arreglarlo según lo que diga.
- [ ] Probar `agentrelay cuenta luna add` y `cuenta gemini add` con una segunda cuenta real y comprobar que `cuota` y el enrutado usan la activa sin tocar OpenCode. Más adelante: decidir si el enrutado debe pasar solo a la siguiente cuenta cuando se agota la activa.
- [x] **Probar `agentrelay cuota` con Luna** con sesión de ChatGPT real: confirmar que salen la ventana de 5 h y la semanal con su hora de renovación.
- [ ] Prueba que ya fallaba antes de integrar Gemini: `ejecutarTarea sin cambios suspende con fallo modelo` (test/evaluar.test.js:273).

Mejoras acordadas:

- [ ] Grok Build (xAI) como ejecutor: **en espera, no se integra por ahora**. Técnicamente encaja (`grok -p` y `--output-format streaming-json`), pero la cuota gratuita no está publicada y es dudosa (necesita una suscripción de X), y en julio de 2026 se descubrió que subía repositorios enteros con `.env` a xAI. Reabrir si xAI publica la cuota gratuita y aclara la privacidad.

- [ ] Enrutado de ejecutores: inventario y evaluación de IA gratuitas (Zen, Mistral, OpenRouter, Z AI), estado de cuota en tiempo real y rotación gratuitos → pago (DeepSeek Flash → Luna API → DeepSeek Pro, sin tope), aviso de privacidad (no bloqueo). Se prueban todos los proveedores y se quitan los que fallen; Hechos todos los pasos salvo el 7 (prueba real con tus claves durante unos días). Plan: [.agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md](.agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md).

- **Prueba real del enrutado (paso 7), resultados 2026-10-09 en el PC:** aptos de nivel A `opencode/space-bunny-free`, `mistral/ministral-8b-latest`, `opencode/mimo-v2.6-flash-free`; de nivel B `zai/glm-4.5-flash`, `openrouter/inclusionai/ling-3.1-flash`, `opencode/ling-3.1-flash-free`, `opencode/longcat-2.5-preview-free`. **Descartados** (ningún modelo apto): Groq (el plan gratuito no admite el tamaño del prompt de un agente), NVIDIA (16 probados: tiempo agotado o suspenden la fácil) y Google (los `flash-lite` suspenden la difícil). Se pueden volver a añadir al catálogo si cambian sus planes. Los `:free` de OpenRouter agotan su cuota diaria (50) con unas pocas pruebas.
- [ ] Cadena de ejecutores: cuando se agota Luna (cuota gratuita por cuenta) el aviso ya propone alternativas (y, con respaldo `login --api`, Luna continúa con la API de pago y vuelve a la gratuita al restablecerse); con otros ejecutores nunca se cambia solo; falta afinar con el texto real del error de cuota de Codex y OpenCode (hoy se detecta con patrones genéricos).
- [ ] Prueba intermitente: `codex: registra la hora de reset conocida y cambia a la API` (test/codex-quota-reset.test.js) falla de vez en cuando con la máquina cargada; investigar la causa (probablemente temporización).
- [ ] Normas del proyecto para el ejecutor: `init` crea un AGENTS.md que remite a CLAUDE.md solo si AGENTS.md no existe. Pendiente decidir qué hacer con un CLAUDE.md con reglas propias junto a un AGENTS.md ajeno que no lo importa, y con las importaciones `@archivo` de CLAUDE.md. Verificar con una ejecución real de Codex que obedece la remisión a CLAUDE.md.
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
