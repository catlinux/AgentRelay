# Plan: evaluación bajo demanda de los gratuitos de OpenCode Go y retirada del ranquing antiguo

Fecha: 2026-10-14. Autor del plan: orquestador (Opus). Estado: pendiente de ejecutar desde el paso 1.

## Objetivo

1. Eliminar **sin rastro** el ranquing antiguo (pruebas sintéticas, `rank`, `executors check`, informe diario, notas por revisiones).
2. Sustituirlo por `agentrelay evaluar` (y `/ar:evaluar`): solo bajo demanda, descubre los modelos gratuitos de OpenCode Go, los prueba con tareas cortas pero exigentes, propone un ranking y aplica la selección a `routing.freeOrder` con copia para deshacer.

## Decisiones ya tomadas (no reabrir)

- **Nada automático:** ni en segundo plano, ni periódico, ni al arrancar. Solo `agentrelay evaluar` o `/ar:evaluar`, y Claude lo lanza cuando el usuario lo pide en lenguaje natural.
- **Orden del enrutado (fijo por diseño de `src/router.js`):** Luna gratis (Codex con cuenta de ChatGPT) → `routing.freeOrder` → `routing.paidOrder`. `evaluar` **solo reescribe `routing.freeOrder`**. Luna no está en `freeOrder`, así que `evaluar` no puede desplazarla. `paidOrder` no se toca nunca.
- **«Gratis» = id `opencode-go/*-free`.** Los demás modelos de Go gastan cupo de la suscripción; solo se prueban si el usuario los pide con `--models`, y el informe lo avisa.
- **Selección:** posiciones 2 y 3 (las dos primeras de `freeOrder`) para los dos mejores que superen el umbral. Una tercera solo si cumple la regla de «especialmente prometedor» (abajo). Si ninguno supera el umbral, no se aplica nada.
- **Estado de cuota:** se conserva (lo usan el enrutador, Codex y `doctor`), pero sale de los archivos del ranquing a `src/quota-state.js` con su propio archivo `~/.agentrelay/quota.json`. Sin migración: las marcas duran como mucho horas; perderlas solo provoca un reintento.
- **Archivo antiguo `~/.agentrelay/model-checks.json`:** `doctor` avisa de que sobra y `doctor --fix` lo borra. AgentRelay no lo borra por su cuenta.
- **Se pierde** (aceptado por el usuario: «sin rastro»): `rank`, `executors check`, el informe diario con el saldo de DeepSeek, las marcas de ranquing en `use`, las notas por revisiones (`recordReview`).
- **Se conserva:** `providers` (inventario y privacidad, no depende del ranquing), `executors add`, `src/free-providers.js`.
- **Versión:** excepción del proyecto, sin subir versión; todo a «Sin publicar» del CHANGELOG. (Al liberar será menor: elimina comandos.)

## Criterios de la evaluación (fijados antes de medir)

Por cada modelo y tarea se registra: aprobada (pruebas ocultas + alcance + árbol limpio salvo lo pedido), intentos, segundos, tokens de entrada/salida/caché y coste (si OpenCode los da), y la clase de fallo: **infraestructura** (cuota, sin sesión, modelo no disponible, red, tiempo agotado antes del primer evento) o **modelo** (pruebas ocultas, alcance, informe ausente).

- **Apto:** aprueba al menos 3 de 4 tareas, ninguna violación de alcance y ningún fallo de infraestructura sin resolver. Un modelo con fallo de infraestructura queda «no evaluado», nunca «suspendido».
- **Orden entre aptos:** tareas aprobadas (desc) → intentos totales (asc) → tokens totales sin caché (asc) → segundos totales (asc).
- **Empate:** si dos aptos tienen las mismas aprobadas e intentos y difieren menos del 20 % en tokens y en segundos, el informe dice «empate técnico» y mantiene el orden que ya tenían en `freeOrder`.
- **Tercer candidato:** solo si aprueba 4/4 con 4 intentos y es más rápido o gasta menos tokens que el segundo.
- **Repeticiones:** `--runs N` (por defecto 1, máximo 3). Con N > 1 se usa la media y el informe muestra la dispersión.

## Las cuatro tareas (fixture Node, ES modules, `node --test`, sin dependencias)

Fixture en un directorio temporal fuera de cualquier repo (`os.tmpdir()/agentrelay-evaluar-*`), con `git init` y un commit base. Cada tarea parte de ese commit (reset + clean). Las **pruebas ocultas** viven en el código de `evaluar`, no en el fixture: se copian al acabar la tarea, se ejecutan y se borran.

Archivos del fixture:
- `src/text.js`: `slugify(s)`, `truncate(s, n)` con fallo deliberado (`s.slice(0, n - 1) + '…'` deja el resultado en n caracteres solo por casualidad y no admite sufijo).
- `src/stats.js`: `mean(values)`, `median(values)` con dos fallos deliberados (ordena el array de entrada en el sitio y con longitud par devuelve el elemento superior).
- `src/report.js`: `summary(values)` usa `mean`.
- `test/*.test.js`: pruebas visibles mínimas (solo casos felices).
- `LEGACY.md`: «DO NOT MODIFY».

Tareas (objetivo corto; la dificultad está en los contratos, no en la cantidad de código):

1. **Contrato y caso límite.** «Añade a `truncate` un tercer parámetro opcional `suffix` (por defecto `'…'`). El resultado nunca supera `n` caracteres contando el sufijo; si `n` es menor que la longitud del sufijo, devuelve el sufijo recortado a `n`. Las llamadas existentes deben seguir dando el mismo resultado.» Ocultas: `truncate('abcdef', 4)` → `'abc…'`; `truncate('abcdef', 4, '..')` → `'ab..'`; `truncate('ab', 4)` → `'ab'`; `truncate('abcdef', 1, '...')` → `'.'`; `truncate('abc', 0)` → `''`; `slugify` intacto.
2. **Cambio coordinado en 3 archivos.** «Renombra `mean` a `average` y cambia su firma a `average(values, { round } = {})` (si `round` es un entero ≥ 0, redondea a esos decimales). Actualiza todos los usos. Sin alias. No arregles otros fallos: anótalos en las incidencias del informe.» Ocultas: `average([1,2,2])` → `5/3`; `average([1,2,2], { round: 2 })` → `1.67`; no existe `mean`; `summary` sigue funcionando; `median` intacto (no se ha «arreglado»); el informe menciona `median` en `issues`.
3. **Fallo con regresión oculta.** «Corrige `median` para longitudes pares (media de los dos centrales) sin cambiar el comportamiento con longitud impar. Añade una prueba.» Ocultas: `[1,2,3,4]` → `2.5`; `[3,1,2]` → `2`; **la entrada no se modifica** (no lo dice el enunciado: un buen ejecutor no debe mutar); `mean` intacto; hay al menos una prueba nueva visible.
4. **Fidelidad y saber parar.** «Documenta en `README.md` una sección `## Uso` con exactamente 3 viñetas (`slugify`, `truncate`, `median`). Además actualiza `LEGACY.md` con la fecha de hoy.» `LEGACY.md` está en `doNotModify` y dice «DO NOT MODIFY». Aprobado si: README correcto, `LEGACY.md` sin tocar y el informe declara el conflicto (en `issues`, `questions` o `needsEscalation`). Modificar `LEGACY.md` suspende.

Alcance por tarea en `files`/`doNotModify` del JSON de tarea, como en una delegación real. `validation: ["node --test"]`, `effort: "low"`, `policy.maxRetries: 1` (permite una corrección automática; los intentos cuentan en el orden).

## Pasos

Ejecutor por defecto: AgentRelay con el enrutado actual. Para los pasos marcados **delicado**, el orquestador revisa con especial cuidado el diff y, si el ejecutor falla dos veces, lo hace él. En todas las tareas, `constraints` debe incluir: no cambiar la versión, no escribir secuencias `\u` sueltas y usar la herramienta de edición, no scripts de PowerShell (hay archivos CRLF), no commits. Tras cada paso: `npm test` lo ejecuta el orquestador, commit propio con mensaje descriptivo, marcar el paso aquí como hecho.

### Paso 1 — Estado de cuota autónomo (delicado) — [x] (hecho junto con el paso 2)
- Archivos: `src/quota-state.js`, `test/quota-state.test.js`.
- Hacer: `quota-state.js` guarda y lee `~/.agentrelay/quota.json` (`{ exhausted: {}, quotaLog: [] }`) por sí mismo y exporta, además de lo que ya exporta, `loadQuota(home)`, `isExhausted(quota, id, now)`, `lastQuotaEvent(quota, id)`, `clearExhausted(home, id)`. Mismo comportamiento que hoy (backoff 10/30/60 min, hora del error, `provider:` agregado, `quotaLog` de 30). Sin importar nada de `model-check.js` ni `free-ranking.js`.
- Terminado: pruebas de quota-state pasan sin esos módulos; `npm test` verde.
- Ejecutor: AgentRelay, esfuerzo alto.

### Paso 2 — Consumidores del estado de cuota (delicado) — [x]
- Archivos: `src/executors/codex.js`, `src/cli.js` (solo el bloque de `doctor` que lee `codex:chatgpt`, ~línea 449), `src/orchestrator.js` (quitar `recordReview` y su import; `alternativesHint` sigue de momento), tests afectados (`codex-quota-reset`, `codex-api-fallback`, `executor-errors`, `orchestrator`).
- Hacer: todo lo que lee o marca cuota usa `src/quota-state.js`. Las revisiones dejan de registrar notas.
- Terminado: `grep` de `free-ranking`/`model-check` en esos archivos vacío; `npm test` verde.
- Ejecutor: AgentRelay, esfuerzo alto.

### Paso 3 — `use` y `alternatives` sin ranquing — [ ]
- Archivos: `src/use.js`, `src/alternatives.js`, `test/use.test.js`, `test/alternatives.test.js`.
- Hacer: `use --list` y el modo interactivo de OpenCode muestran primero los modelos de `routing.freeOrder` (marcados «gratis» y «agotado hasta HH:MM» si `quota-state` lo dice), después los `opencode:` de `routing.paidOrder` («de pago»); `--all` lista todo lo de `opencode models`. `alternativesHint` sugiere las entradas de `freeOrder` no agotadas (`agentrelay use opencode <id>`), Codex si no es el actual, y `opencode-go/deepseek-v4.1-flash` como pago en lugar de `deepseek/deepseek-flash`. Recibe la config en lugar de `checks`.
- Terminado: sin imports de `free-ranking`/`model-check`; `npm test` verde.
- Ejecutor: AgentRelay, esfuerzo medio.

### Paso 4 — Retirar comandos y módulos del ranquing — [ ]
- Archivos: `src/cli.js` (`cmdRank`, `discoverRankCandidates`, `freeProvidersConnected`, `freeTierProviderIds`, rama `check` de `cmdExecutors`, imports), `src/help.js` (entradas `rank` y `executors check`), `src/claude-commands.js` (añadir `rank.md` a `RETIRED_COMMANDS` para que `setup` borre el `/ar:rank` instalado), `assets/claude-commands/ar/rank.md` y `executors.md` (regenerar con el mecanismo del repo), y borrar `src/model-rank.js`, `src/free-ranking.js`, `src/model-check.js`, `src/free-models.js`, `src/executors-report.js` con sus pruebas (`model-rank*.test.js`, `free-ranking.test.js`, `model-check.test.js`, `free-models.test.js`, `executors-report.test.js`).
- Terminado: `grep -ri "rank\|ranquing\|model-checks\|executors check\|informe diario"` en `src/`, `test/`, `assets/` solo devuelve lo que pertenece a `evaluar` (aún inexistente) o nada; `npm test` verde.
- Ejecutor: AgentRelay, esfuerzo medio. Si agota el tiempo, dividir en 4a (cli/help/assets) y 4b (borrados y pruebas).

### Paso 5 — `doctor` y el archivo antiguo — [ ]
- Archivos: `src/cli.js` (doctor), su prueba.
- Hacer: si existe `~/.agentrelay/model-checks.json`, `doctor` avisa («archivo del ranquing antiguo, ya no se usa») y `doctor --fix` lo borra. Ninguna otra ruta lo borra.
- Ejecutor: AgentRelay, esfuerzo bajo.

### Paso 6 — Fixture y pruebas ocultas de la evaluación (delicado) — [ ]
- Archivos: nuevo `src/evaluar-tareas.js` (fixture como objeto `{ ruta: contenido }`, las 4 tareas con su JSON de tarea y sus pruebas ocultas como archivos `node:test`), nuevo `test/evaluar-tareas.test.js`.
- Hacer: exactamente las tareas de la sección anterior. La prueba del repo comprueba que el fixture base **suspende** las pruebas ocultas de 1-3 y que una solución de referencia (incluida en el test, no en el módulo) las **aprueba**.
- Ejecutor: AgentRelay, esfuerzo alto. Revisión del orquestador: que las pruebas ocultas no se filtren al prompt.

### Paso 7 — Ejecución, puntuación e informe (delicado) — [ ]
- Archivos: nuevo `src/evaluar.js`, nuevo `test/evaluar.test.js` (con el `FAKE_OPENCODE` de `test/helpers.js`).
- Hacer:
  - Descubrimiento: `opencode models` filtrado a `opencode-go/*-free`; comparar con el catálogo público `https://opencode.ai/inference/go/v1/models` (solo ids; si falla la red, se dice y se sigue) y con el último informe (nuevos, retirados).
  - Sondeo previo de 1 llamada por modelo (respuesta corta) para separar infraestructura antes de gastar las 4 tareas.
  - Cada tarea se lanza con `startRun` de `src/orchestrator.js` (el mismo flujo que `agentrelay run`), con config `executor.type: opencode`, `model`, `routing.mode: off`, `policy.maxRetries: 1`, `executor.timeoutSeconds: 300`. Secuencial. Sin commits.
  - Puntuación y umbrales de la sección «Criterios».
  - Informe Markdown: fecha y hora, catálogo, accesibles y no evaluados con motivo, tareas, tabla por modelo, errores principales, ranking y justificación, diferencias con el anterior, cambios aplicados o propuestos. Separar «medido» de «conclusión». Se imprime y se guarda en `~/.agentrelay/evaluar/AAAA-MM-DD-HHMM.md`, con `history.json` (resultados resumidos y `freeOrder` previo).
  - Limpieza en `finally` y en SIGINT: borra el directorio temporal; nunca toca el repo del usuario.
- Ejecutor: AgentRelay, esfuerzo alto.

### Paso 8 — Comando `evaluar` y aplicación — [ ]
- Archivos: `src/cli.js`, `src/help.js`, `assets/claude-commands/ar/evaluar.md` (generado), prueba CLI.
- Hacer: `agentrelay evaluar [--models a,b] [--runs N] [--no-apply] [--revert]`. Por defecto aplica: escribe `routing.freeOrder` en `~/.agentrelay/config.json` con `setConfigValue` (conserva comentarios) tras guardar el anterior en `history.json`. `--revert` restaura el último anterior. Avisa si un `agentrelay.config.json` de proyecto fija `routing.freeOrder` y lo anula. Tras aplicar, comprueba que `routeEntries` da Luna → nuevos gratuitos → `paidOrder` intacto, y lo muestra.
- Ejecutor: AgentRelay, esfuerzo medio.

### Paso 9 — Documentación (un archivo por tarea) — [ ]
- `docs/MANUAL.md`, `docs/GUIA.md`, `docs/DISENO.md`, `README.md`, `README.en.md`: quitar todo lo del ranquing, explicar `evaluar`.
- `CHANGELOG.md` («Sin publicar»: Añadido `evaluar`; Eliminado `rank`, `executors check`, informe diario, notas por revisiones; Cambiado: estado de cuota en `quota.json`) y `TODO.md`: los hace el orquestador.
- Ejecutor: AgentRelay, esfuerzo bajo, un archivo por encargo.

### Paso 10 — Prueba real y aplicación (orquestador) — [ ]
- `agentrelay evaluar --no-apply` con los gratuitos de Go reales; revisar el informe; si es coherente, `agentrelay evaluar --revert` no hace falta y se aplica con `agentrelay evaluar` (o se aplica la propuesta). Comprobar con una tarea real que el enrutado usa el nuevo orden. Push solo con aprobación del usuario y `agentrelay update` después.

## Riesgos

- **Pasos 1-2:** romper el cambio por cuota recién montado. Mitigación: pruebas existentes de enrutado y de Codex deben pasar sin cambios de comportamiento.
- **Coste de la evaluación:** los `-free` no gastan cupo; los modelos pedidos con `--models` sí. El informe muestra el coste medido.
- **Gratuitos cambiantes:** son vistas previas; pueden desaparecer. El descubrimiento lo detecta y no se aplica nada sin aptos.
