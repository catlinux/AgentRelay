# Plan: proveedores con cuota gratuita en AgentRelay

Creado 2026-10-08. Objetivo: aprovechar las IA con nivel gratuito (no solo OpenCode Zen) como ejecutores, probarlas de verdad y quedarse con las que funcionen.

## Decisiones tomadas con el usuario (no reabrir)

- **Vía única: OpenCode.** OpenCode ya habla con NVIDIA, Groq, Google, Mistral, OpenRouter, Z AI… (`-m proveedor/modelo`, ver `src/executors/opencode.js:56`). No se crean adaptadores nuevos ni se guardan claves en AgentRelay: cada proveedor se conecta con `agentrelay login opencode` (asistente de OpenCode) o con su variable de entorno.
- **Cadena automática opt-in:** nuevo `executor.freeChain` (booleano, por defecto `false`). Si está activo y un modelo gratuito agota la cuota, el mismo intento sigue con el siguiente gratuito del ranquing. Desactivado, todo sigue como hoy (falla y propone alternativas).
- **Privacidad: solo avisar.** Los proveedores que pueden usar los prompts para entrenar se marcan en el catálogo y se avisa en `providers`, `use` y al cambiar de modelo en la cadena; no se bloquean.
- **Selección por prueba real:** se conectan todos los candidatos; los que fallen en las pruebas se quitan del catálogo y se anota en `TODO.md` («Descartado» con su porqué).
- **Versionado (excepción del repo):** no se sube la versión; todo va a `## [Sin publicar]` del `CHANGELOG.md`.

## Candidatos (datos de terceros a 2026-10, sin verificar)

| Proveedor (id en OpenCode) | Variable | Límite gratuito | Entrena | Notas |
|---|---|---|---|---|
| `nvidia` | `NVIDIA_API_KEY` | ~40 RPM, ~10.000 RPD/modelo | no consta | Muchos modelos retirados (410) o 404; GLM 5.3, GLM 5.3 Flash, Nemotron 3.5 Lightning y Laguna XS funcionaron como agente (prueba de falkenslab, 2026-09-24) |
| `groq` | `GROQ_API_KEY` | 30 RPM, 1.000 RPD/modelo | no consta | gpt-oss-120b, qwen3.8-27b |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | no publicado | **sí** | Familia Flash |
| `mistral` | `MISTRAL_API_KEY` | créditos mensuales | comprobar | Codestral/Devstral |
| `openrouter` | `OPENROUTER_API_KEY` | 20 RPM, 50 RPD (`:free`) | **puede** | Solo reserva |
| `zai` | (ver models.dev) | 1 petición simultánea | comprobar | GLM Flash |
| `opencode` (Zen) | sesión de OpenCode | por IP | comprobar | Ya integrado |

Comprobar los ids y variables reales en `https://models.dev/api.json` (campos `id`, `env`, `models.*.cost`) antes de escribirlos.

## Pasos

Ejecutor por defecto: AgentRelay (`agentrelay run`), un objetivo por tarea. En todas las tareas, `constraints`: no cambiar la versión, no tocar `package.json`, `.gitignore` ni la licencia, no escribir secuencias `\u` sueltas, no usar scripts de PowerShell (hay archivos CRLF); `validation`: `npm test`. El orquestador revisa según `AGENTS.md`.

### Paso 1 — Catálogo de proveedores gratuitos · AgentRelay, esfuerzo medio · [ ]
- Archivos: nuevo `src/free-providers.js`, test nuevo en `test/`.
- Contenido: lista de candidatos con `{ id, name, env, signupUrl, limits (texto), trainsOnData: true|false|null, notes }` y funciones `listFreeProviders()`, `connectedProviders({ env, opencodeAuth })` (conectado si la variable existe o el proveedor aparece en las credenciales de OpenCode; reutilizar cómo `src/executors/opencode.js` lee hoy la sesión).
- Terminado: tests cubren conectado/no conectado por variable y por credencial; `npm test` en verde.
- CHANGELOG (Sin publicar → Añadido): se añade al cerrar el paso 3 junto con el comando visible.

### Paso 2 — Descubrimiento multiproveedor · AgentRelay, esfuerzo medio · [ ]
- Archivos: `src/free-models.js`, `src/model-check.js`, sus tests.
- Cambios: la caché de models.dev guarda todos los proveedores del catálogo (no solo `opencode`); un modelo es gratuito si `cost.input === 0 && cost.output === 0` en un proveedor **conectado**; ids siempre `proveedor/modelo`. Zen conserva el recurso al sufijo `-free` sin conexión. `isFreeModel` deja de depender solo del sufijo (aceptar un conjunto conocido de gratuitos).
- Terminado: con un JSON de models.dev de prueba, salen los gratuitos de los proveedores conectados y no los de pago ni los de proveedores sin conectar; las cachés antiguas (solo `opencode`) siguen leyéndose.

### Paso 3 — Comando `agentrelay providers` y `doctor` · AgentRelay, esfuerzo bajo · [ ]
- Archivos: `src/cli.js`, `src/help.js` (y los `/ar:` se regeneran solos desde la ayuda: comprobar), tests.
- Salida: por proveedor, conectado sí/no, límite, aviso «puede usar tus prompts para entrenar» si `trainsOnData !== false`, y cómo conectarlo (`agentrelay login opencode` o la variable). `doctor` añade una línea con los proveedores gratuitos conectados.
- CHANGELOG: «Proveedores con cuota gratuita (NVIDIA, Groq, Gemini, Mistral, OpenRouter, Z AI) a través de OpenCode: `agentrelay providers`…».

### Paso 4 — Ranquing multiproveedor y modelos retirados · AgentRelay, esfuerzo medio · [ ]
- Archivos: `src/model-rank.js`, `src/free-ranking.js`, `src/executors/common.js` (`classifyExecutorError`), tests.
- Cambios: el ranquing prueba los gratuitos de todos los proveedores conectados; un 410/404/«model not found|deprecated|retired» se clasifica como no disponible y se excluye sin gastar la segunda prueba; las pruebas de un mismo proveedor van en serie (respetar RPM); `--max` limita por proveedor. `use`/`use --list` muestran el proveedor y el aviso de privacidad.
- Terminado: tests con salidas simuladas de 410, 404 y 429.

### Paso 5 — Prueba real y criba · el usuario + la propia sesión (Sonnet, esfuerzo medio) · [ ]
1. El usuario crea las claves (NVIDIA Build, Groq, Google AI Studio, Mistral, OpenRouter, Z AI) y las conecta con `agentrelay login opencode`; `agentrelay providers` debe mostrarlas conectadas.
2. `agentrelay rank --run` y después 2-3 tareas reales pequeñas por proveedor con su mejor modelo (en un repo de pruebas, no en código sensible).
3. Proveedor sin ningún modelo que complete una tarea → se quita del catálogo y se anota en `TODO.md` como descartado con el porqué. Los que funcionen quedan en el catálogo y en `docs/` con su modelo recomendado.
- Terminado: catálogo depurado y resultados anotados (fecha, modelo, tiempo, resultado).

### Paso 6 — Cadena de gratuitos `executor.freeChain` · AgentRelay, esfuerzo alto · [ ]
- Archivos: `src/config.js` (clave, por defecto `false`, validación booleana, lista de claves de `executor`), `src/settings.js`, `src/config-template.js`, `src/orchestrator.js`, tests.
- Comportamiento (en la rama `errorKind === 'quota'` de `continueCycle`): si `freeChain` es `true` y el ejecutor es `opencode`, `markExhausted` del modelo actual, elegir el siguiente de `rankedFree` que no esté agotado ni probado ya en esta ejecución, emitir evento `chain_switch {from, to, trainsOnData}`, repetir el intento con el mismo modo **sin consumir** `retriesUsed` y sin cambiar la configuración guardada. Máximo 3 cambios por ejecución; agotados todos, falla como hoy con las alternativas. El informe (`show`) lista los modelos usados.
- Terminado: tests de cadena desactivada (comportamiento idéntico al actual), activada con éxito en el segundo modelo, límite de 3 y sin candidatos.
- CHANGELOG: «Cadena de modelos gratuitos opcional (`executor.freeChain`)…».

### Paso 7 — Documentación · AgentRelay, esfuerzo bajo, **un archivo por tarea** · [ ]
- `docs/DISENO.md` (sección Modelos gratuitos: multiproveedor, cadena opt-in, aviso de privacidad), `README.md`, `README.en.md`, manual de uso en `docs/` (comando `providers`, `freeChain`). Quitar de `TODO.md` el punto «Más proveedores con nivel gratuito…».

## Cómo seguir en barato

`/clear` → `/model sonnet` → «ejecuta el paso 1 de .agents/plans/proveedores-gratuitos/proveedores-gratuitos.PLAN.md». El paso 6 conviene revisarlo con Opus.
