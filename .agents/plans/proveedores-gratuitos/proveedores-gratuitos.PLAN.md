# Plan: enrutado de ejecutores con cuotas gratuitas y paso a pago

Creado 2026-10-08, rehecho 2026-10-09. Objetivo: descubrir las IA gratuitas que valen como ejecutoras, evaluarlas, seguir su cuota en tiempo real y rotar entre ellas; cuando no quede ninguna gratuita, pasar a las de pago.

## Decisiones tomadas con el usuario (no reabrir)

- **Ejecutores:** Codex (imprescindible: cuota gratuita de ChatGPT con Luna + Luna por API de pago) y OpenCode (todos los proveedores gratuitos y DeepSeek). **Cline se retira solo si** DeepSeek Flash y Pro rinden igual por OpenCode (paso 0); si no, se queda.
- **Sin claves en AgentRelay** (salvo el perfil de API de Codex que ya existe): los proveedores de OpenCode se conectan con `agentrelay login opencode` o su variable de entorno.
- **Privacidad: solo avisar** (no se bloquean proveedores que entrenan con los prompts).
- **Proveedores:** se prueban todos los candidatos; los que fallen se quitan del catálogo y se anotan como descartados en `TODO.md`.
- **Pago sin tope:** al agotarse los gratuitos se pasa al de pago sin preguntar; el informe diario muestra lo usado de pago. Orden de pago: DeepSeek Flash → Luna API → DeepSeek Pro.
- **Una cuenta por proveedor:** se rota entre proveedores, nunca entre cuentas del mismo (condiciones de uso).
- **Versionado (excepción del repo):** no se sube la versión; todo a `## [Sin publicar]` del `CHANGELOG.md`.
- Sustituye a la «cadena opt-in `executor.freeChain`» del plan anterior: el enrutado se activa una vez en la configuración (`routing.mode: "auto"`); con `"off"` (por defecto) todo funciona como hoy.

## Arquitectura (cuatro piezas)

1. **Inventario** (`src/free-providers.js`, `src/free-models.js`): models.dev (coste 0, `tool_call`, contexto) de los proveedores conectados, cruzado con la lista en vivo del proveedor para excluir retirados (410/404). Prefiltro sin gastar cuota: `tool_call === true` y contexto ≥ 64k.
2. **Evaluación** (`src/model-rank.js`, `src/free-ranking.js`): tres pruebas (fácil, media, difícil con varios archivos y un test que arreglar). **Apto** = supera media y difícil. Nivel **A** (pasa las tres con margen de tiempo) o **B**. La nota se ajusta con las revisiones reales del orquestador (accept suma, fix/reject resta). Se reevalúa solo lo nuevo o lo caducado (7 días).
3. **Estado de cuota** (nuevo `src/quota-state.js`, en `~/.agentrelay/quota.json`): por `proveedor/modelo` y por proveedor: `available` | `exhausted { until, source }` | `unknown { nextProbe }`. `until` sale del error (Retry-After, «resets at…», `parseQuotaReset` de `src/executors/common.js`) o de reglas del catálogo (p. ej. reinicio diario 00:00 UTC); si no se sabe, reintento a 10, 30 y 60 min. Generaliza lo que hoy hace Luna (`markExhausted` + reintento cada 10 min).
4. **Enrutador** (nuevo `src/router.js` + `src/orchestrator.js`): lista ordenada = gratuitos (Luna gratis y aptos por nota) y después pago (DeepSeek Flash, Luna API, DeepSeek Pro). Cada tarea empieza por el primero disponible; tareas `effort: high|xhigh` solo usan nivel A o pago. Cuota agotada a media tarea → se marca, se continúa con el siguiente sobre el árbol actual (modo `fix` con «continúa el trabajo») sin consumir `retriesUsed`; máximo 5 cambios por ejecución. Antes de cada tarea se vuelve a comprobar si uno de más arriba se ha restablecido. Cada cambio emite `route_switch {from, to, reason, paid, trainsOnData}` y queda en el informe.

## Pasos

Ejecutor por defecto: AgentRelay (`agentrelay run`), un objetivo por tarea. En todas: `constraints` = no cambiar la versión, no tocar `package.json`, `.gitignore` ni la licencia, no escribir secuencias `\u` sueltas, no usar scripts de PowerShell (hay archivos CRLF); `validation` = `npm test`. Revisión según `AGENTS.md`. Cada paso añade su entrada en «Sin publicar» del `CHANGELOG.md` y marca aquí `[x]`.

### Paso 0 — DeepSeek: OpenCode frente a Cline · la propia sesión (Sonnet, medio) + el usuario · [ ]
- El usuario conecta DeepSeek en OpenCode (`agentrelay login opencode` → deepseek) y mira en platform.deepseek.com si tiene crédito de regalo.
- 3-4 tareas reales pequeñas iguales con `agentrelay use cline deepseek-v4-flash` y `agentrelay use opencode deepseek/<id>` (y lo mismo con Pro). Comparar aceptación, intentos, tiempo y tokens.
- Terminado: resultado anotado aquí y decisión (retirar Cline o no) en `TODO.md`.

### Paso 1 — Catálogo de proveedores · AgentRelay, medio · [ ]
- Archivos: nuevo `src/free-providers.js` + test.
- Entradas `{ id, name, env, signupUrl, tier: 'free'|'paid', limits, resetRule, trainsOnData, notes }` para: opencode (Zen), nvidia, groq, google, mistral, openrouter, zai, deepseek (paid). Ids y variables verificados en `https://models.dev/api.json`.
- `connectedProviders({ env, opencodeAuth })`: conectado si existe la variable o la credencial de OpenCode.
- Terminado: tests de conectado/no conectado.

### Paso 2 — Inventario multiproveedor · AgentRelay, medio · [ ]
- Archivos: `src/free-models.js`, `src/model-check.js` + tests.
- La caché de models.dev guarda todos los proveedores del catálogo; gratuito = coste 0 en un proveedor conectado; ids `proveedor/modelo`; prefiltro `tool_call` y contexto ≥ 64k; Zen conserva el sufijo `-free` sin conexión; cachés antiguas siguen leyéndose. `isFreeModel` deja de depender solo del sufijo.

### Paso 3 — `agentrelay providers` y `doctor` · AgentRelay, bajo · [ ]
- Archivos: `src/cli.js`, `src/help.js` (comprobar que `/ar:providers` se genera) + tests.
- Por proveedor: conectado, nivel gratuito/pago, límites, aviso de privacidad si `trainsOnData !== false`, cómo conectarlo. `doctor`: una línea con los conectados.

### Paso 4 — Evaluación con tercera prueba, niveles y nota real · AgentRelay, alto · [ ]
- Archivos: `src/model-rank.js`, `src/free-ranking.js`, `src/executors/common.js` (`classifyExecutorError`: 410/404/«not found|deprecated|retired» → no disponible) + tests.
- Tercera prueba difícil; apto/nivel A/B; pruebas del mismo proveedor en serie (RPM); `--max` por proveedor; reevaluación a los 7 días; `agentrelay review` actualiza la nota del modelo usado (registro en `~/.agentrelay/`).

### Paso 5 — Estado de cuota generalizado · AgentRelay, alto · [ ]
- Archivos: nuevo `src/quota-state.js`, `src/free-ranking.js` (`markExhausted` pasa a usarlo), `src/executors/codex.js` (Luna usa el mismo almacén sin cambiar su comportamiento) + tests.
- Estados y cálculo de `until` como en «Arquitectura 3»; escritura atómica; `isAvailable(id, now)`.
- Terminado: tests con reloj simulado (agotado hasta X, restablecido, backoff 10/30/60).

### Paso 6 — Enrutador · **Opus** en la propia sesión (diseño delicado) · [ ]
- Archivos: nuevo `src/router.js`, `src/orchestrator.js`, `src/config.js` / `src/settings.js` / `src/config-template.js` (`routing.mode: "off"|"auto"`, `routing.paidOrder`), `src/report.js` + tests.
- El orquestador debe poder cambiar de **tipo** de ejecutor entre intentos (Codex ↔ OpenCode), no solo de modelo. Con `routing.mode: "auto"`, el `apiFallback` interno de Codex se desactiva y Luna gratis y Luna API son dos entradas de la lista (una sola lógica de cambio).
- Terminado: tests con `mode: off` idéntico al actual; cambio a mitad de tarea; vuelta a gratuito al restablecerse; esfuerzo alto solo nivel A/pago; todos agotados → falla con alternativas.

### Paso 7 — Prueba real y criba de proveedores · el usuario + la propia sesión (Sonnet, medio) · [ ]
1. El usuario crea las claves (NVIDIA Build, Groq, Google AI Studio, Mistral, OpenRouter, Z AI) y las conecta; `agentrelay providers` debe mostrarlas.
2. `agentrelay rank --run`; varios días de uso real con `routing.mode: "auto"` en un repo de pruebas.
3. Proveedor sin ningún modelo apto → fuera del catálogo y anotado como descartado en `TODO.md`.

### Paso 8 — Retirar Cline (solo si el paso 0 lo justifica) · AgentRelay, medio · [ ]
- Quitar adaptador, dependencia (pedir permiso explícito para tocar `package.json`), entradas en `catalog.js`, `alternatives.js`, `doctor`, migración de configuración `cline` → `opencode deepseek/…` con aviso.

### Paso 9 — Documentación · AgentRelay, bajo, **un archivo por tarea** · [ ]
- `docs/DISENO.md` (enrutado y su política), `README.md`, `README.en.md`, manual en `docs/` (`providers`, `routing`).

## Cómo seguir en barato

`/clear` → `/model sonnet` → «ejecuta el paso 1 de .agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md». Los pasos 1-5 son independientes del 0; el paso 6 con `/model opus`.
