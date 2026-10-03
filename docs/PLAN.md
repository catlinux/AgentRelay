# Plan de trabajo paso a paso

Instrucciones para completar los puntos pendientes de la sección «Ahora» de [`TODO.md`](../TODO.md). Están escritas para que las siga un modelo pequeño sin tener que tomar decisiones de diseño: cada punto dice qué hacer, en qué archivos, en qué orden, cómo comprobarlo y qué errores evitar.

Redactado el 2026-10-03 sobre el commit `2a9c81b`. Si el código ha cambiado mucho desde entonces, comprueba las rutas y los números de línea antes de seguirlo; los nombres de funciones son más fiables que los números.

## Cómo usar este plan

1. **Sigue el protocolo de `AGENTS.md`, sección 24.** Este plan no lo sustituye. En especial:
   - el árbol limpio antes de delegar;
   - leer el diff entero y ejecutar `npm test` antes de aceptar;
   - un commit por cambio lógico, con la identidad CatLinux y sin atribución a IA;
   - nada de `git push` sin permiso.
2. **Haz los puntos en el orden de la tabla.** Dentro de cada punto, haz las tareas en orden.
3. **Respeta las marcas:**
   - 🛑 **PARA:** no sigas; pregunta al usuario y espera su respuesta.
   - ✋ **Hazlo tú:** no lo delegues (decisiones, documentación sensible, cambios pequeños).
   - 📤 **Delegar:** lanza la tarea JSON que se da, con `agentrelay run - <<'EOF' … EOF`.
4. **Después de cada tarea:** marca la casilla en `TODO.md`, apúntalo en `CHANGELOG.md` (sección «Sin publicar») y haz commit.
5. **Si una comprobación falla dos veces seguidas,** para y cuéntaselo al usuario con la salida exacta. No improvises.

**Restricciones que llevan TODAS las tareas delegadas** (cópialas en `constraints`):

```json
"No cambies la versión de package.json ni crees secciones de versión en CHANGELOG.md.",
"No escribas secuencias \\u sueltas: usa caracteres reales (á, é, ñ, …).",
"Usa la herramienta de edición de archivos, no scripts de PowerShell (los archivos pueden tener CRLF).",
"No toques src/proc.js aunque su prueba de timeout falle dentro de tu sandbox."
```

## Resumen y orden

| # | Punto | ¿Necesita al usuario? | Tamaño |
|---|---|---|---|
| 1 | Simplificar: quitar triaje, precios, consumo, niveles y comandos duplicados | 🛑 Sí: **permiso para borrar archivos** | Grande (6 tareas) |
| 2 | Probar `agentrelay start` en Taller | 🛑 Sí: lo prueba él en su equipo | Pequeño |
| 3 | Pulir la sangría de las opciones que activa `set`/`use` | No | Pequeño |
| 4 | Aviso al ejecutar `start`/`init` dentro de la carpeta de AgentRelay | 🛑 Sí: elegir la opción | Pequeño |
| 5 | Inventario de modelos (`agentrelay use --list`) | No | Mediano |
| 6 | `doctor --fix` | 🛑 Sí: confirmar qué arregla | Mediano |
| 7 | Cambio de ejecutor cuando se agota la cuota | 🛑 Sí: elegir el diseño | Mediano |

---

## 1. Simplificar

**Objetivo:** que AgentRelay tenga pocos comandos y sea fácil de entender. El usuario aprobó el 2026-10-03:

- quitar triaje, `pricing`, `usage` y los niveles 1-5;
- fundir los comandos de ajuste en `agentrelay use`;
- retirar `config refresh`;
- acortar `AGENTS.md`.

🛑 **PARA antes de empezar.** Borrar archivos necesita el permiso explícito del usuario (`AGENTS.md`, sección 24, «Prohibido sin permiso explícito»). Enséñale la lista de cada tarea («se borrarán: …») y espera su «sí». Sin permiso, no hagas este punto y pasa al 2.

Haz las tareas 1a → 1f **en este orden**: cada una deja `npm test` en verde.

### 1a. Quitar el triaje adaptativo

**Archivos que se borran** (con `git rm`):

- `src/triage.js`
- `test/triage.test.js`
- `assets/claude-commands/ar/triaje.md`

**Archivos que se editan:**

- `src/cli.js`. Busca por nombre, no por número de línea:
  - la línea `import { advise, appendRecord, … } from './triage.js';`
  - la constante `TRIAGE_OUTCOMES`
  - las funciones `requiredTriage` y `cmdTriage` (enteras)
  - `case 'triage'` del `switch` de `main`
  - las 3 líneas `agentrelay triage …` y el bloque «Opciones de triage» del texto `HELP`
  - en `OPTIONS`, las opciones `type`, `size`, `kind`, `include-legacy`, `outcome`, `run`, `note`, `signals` y `effort`. ⚠️ Antes de quitar cada una, búscala con `grep -n "values\.<nombre>\|values\['<nombre>'\]" src/cli.js`: si otra función la usa, no la quites. `executor` y `model` las usa `usage` (tarea 1b): se quitan allí.
- `src/instructions.js`, constante `GLOBAL_BLOCK`:
  - quita el párrafo que empieza por `'El triaje aprende de sus aciertos y fallos.`
  - en la línea de «Petición de envergadura», quita `(y el nivel de orquestación 1-5 si conviene otro)`.
  - Deja el resto de la sección «Triaje en cada petición»: es la recomendación de modelo, y no usa el comando.
- `src/cli.js`, función `cmdSetup`: en el texto `Comandos de Claude Code: /ar:estado, …` quita `/ar:triaje`.
- Tests que cuentan comandos:
  - `test/claude-commands.test.js`: quita `'triaje.md'` de la lista y baja en 1 cada número de comandos.
  - `test/setup-init.test.js`: `comandos creados: 7` pasa a 6.
  - `test/doctor-instructions.test.js`: quita `'triaje'` de la lista.

✋ **Hazlo tú (no delegues):** `AGENTS.md`, sección 22, quita el último punto (`agentrelay triage record …`). En la sección 24, «Después de cada ejecución», paso 7, deja solo «Commit con un mensaje descriptivo.».

**Tarea para delegar:**

```json
{
  "objective": "Quitar el comando agentrelay triage y su código, sin cambiar nada más.",
  "context": "AgentRelay es una CLI de Node (ESM, sin dependencias de test externas; tests con node --test). El usuario ha decidido eliminar el triaje adaptativo porque complica el proyecto. src/triage.js, test/triage.test.js y assets/claude-commands/ar/triaje.md ya se han borrado en el commit anterior. Hay que quitar todas las referencias que quedan.",
  "files": ["src/cli.js", "src/instructions.js", "test/claude-commands.test.js", "test/setup-init.test.js", "test/doctor-instructions.test.js"],
  "constraints": ["(las 4 restricciones comunes)", "No quites opciones de OPTIONS que use otra función distinta de cmdTriage.", "No cambies el texto de GLOBAL_BLOCK salvo el párrafo de 'El triaje aprende…' y la mención al nivel de orquestación 1-5."],
  "acceptanceCriteria": ["grep -rn triage src test assets no devuelve nada.", "agentrelay --help no menciona triage.", "npm test pasa."],
  "validation": ["npm test"],
  "doNotModify": ["package.json", "AGENTS.md", "CHANGELOG.md", "TODO.md", "src/proc.js"]
}
```

**Comprobación:**

- `grep -rn "triage\|triaje" src test assets` solo debe encontrar «Triaje en cada petición» en `src/instructions.js`.
- `node bin/agentrelay.js --help` no debe mostrar triage.
- `npm test` en verde.

### 1b. Quitar `pricing` y `usage`

**Archivos que se borran:**

- `src/pricing.js`
- `src/usage.js`
- `test/pricing.test.js`
- `test/usage.test.js`

**Archivos que se editan:**

- `src/cli.js`:
  - las importaciones de `./usage.js` y `./pricing.js`;
  - las funciones `cmdUsage`, `showDeepSeekNotice`, `cmdPricing`, `priceCell`, `localDateKey` y `describeTariffChange`;
  - las llamadas a `showDeepSeekNotice(...)` en `cmdRun` y en `cmdReview`. En `cmdReview` se va el bloque `if (values.decision === 'fix') { … }` entero, que solo servía para ese aviso;
  - `case 'usage'` y `case 'pricing'`;
  - en `HELP`, las líneas de `usage` y `pricing` y el bloque «Opciones de usage»;
  - en `OPTIONS`, `since`, `executor` y `model` (compruébalo con grep, como en 1a).
- `test/output.test.js`: quita la línea `assert.match(helpDefault.stdout, /Opciones de usage:/);`.

**Lo que se queda:** los tokens de cada intento en el informe (`src/report.js`) y en `watch`. No toques los adaptadores de `src/executors/`.

**Tarea para delegar:** igual que la de 1a, cambiando lo siguiente:

- `objective`: «Quitar los comandos agentrelay usage y agentrelay pricing y el aviso de tarifa de DeepSeek».
- `files`: `src/cli.js` y `test/output.test.js`.
- `acceptanceCriteria`: `grep -rn "pricing\|aggregateUsage\|DeepSeekNotice" src test` vacío, y `npm test` pasa.

### 1c. Quitar los niveles 1-5

**Idea:** se queda una sola política, la del nivel 3 de hoy («equilibrado»): revisión siempre, 2 reintentos, corrección automática y autorrevisión `none` / `inline` / `pass` según la complejidad. La sección `policy` de la configuración sigue permitiendo cambiar esos valores.

**Archivos que se borran:** `assets/claude-commands/ar/nivel.md`.

**Archivos que se editan, por orden:**

1. `src/policy.js`:
   - Sustituye `LEVELS` por `export const POLICY = Object.freeze({ name: 'estándar', review: 'always', maxRetries: 2, autoFix: true, requireValidation: false, selfReview: { trivial: 'none', normal: 'inline', complex: 'pass' }, skipPassMaxFiles: 1 });`.
   - `resolvePolicy(config)` devuelve `{ ...POLICY, ...overrides, selfReview: { ...POLICY.selfReview, ...(overrides.selfReview || {}) } }`, sin `level`.
   - En `decideReview`, cambia el texto `` `el nivel ${policy.level} revisa siempre` `` por `'se revisa siempre'`.
2. `src/config.js`:
   - quita `level` de `DEFAULT_CONFIG`, de `KNOWN['']` y la validación `if (!Number.isInteger(config.level) …`, y la línea que convierte `level` de la línea de comandos;
   - ⚠️ **compatibilidad:** si una capa trae `level`, no la marques como clave desconocida. Añade el aviso `` `La opción level ya no existe y se ignora (${layer.origin}).` `` y bórrala de `config` antes de devolverla. Así las configuraciones antiguas siguen funcionando.
3. `src/settings.js`: quita el alias `level` y su rama en `parseSettingValue`.
4. `src/config-file.js`: `defaultValues()` usa `POLICY` en lugar de `LEVELS[DEFAULT_CONFIG.level]`.
5. `src/config-template.js`:
   - quita la opción `level` y la lista de niveles;
   - `defaults` pasa a ser `POLICY`;
   - cambia el título «Nivel y política» por «Política».
6. `src/orchestrator.js`: en el evento de inicio, quita `level` y `levelName`.
7. `src/events.js`: la línea de inicio de ejecución pasa a ser `` `▶ Ejecución ${event.runId}` `` (sin «· nivel …»).
8. `src/report.js`, la línea que empieza por `- Nivel:`. Pasa a ser `` `- Revisión: ${policy.review} · reintentos: ${state.retriesUsed}/${policy.maxRetries}` ``. ⚠️ Los informes de ejecuciones antiguas tienen `policy.level`: no fallan porque ya no se lee.
9. `src/project-state.js`: quita `level` del objeto `executor` y `· nivel …` de `renderProjectState`.
10. `src/cli.js`:
    - la opción `--level` y su ayuda;
    - `overrides` en `cmdRun`;
    - `level` en `printResult` y en `cmdList` (la columna `nivel ${r.level}`);
    - `· nivel ${config.level}` en `cmdDoctor`;
    - en `cmdSetup`, `/ar:nivel` del texto de comandos.
11. `src/instructions.js`: busca «nivel» en los dos bloques y quita las menciones.
12. `assets/claude-commands/ar/estado.md`: quita «nivel» del texto final.

**Tests:** ejecuta `grep -n "level\|nivel" test/*.js` y corrige cada uno.

- Los tests de `settings` y `config` que usan `set level 4` deben usar otra clave, por ejemplo `set timeout 900`.
- Los que comprueban niveles 1, 4 o 5 en `orchestrator.test.js` se reescriben con `policy` en la configuración. Por ejemplo, el nivel 1 equivale a `{ policy: { review: 'on-failure', maxRetries: 3 } }`.
- No borres tests de comportamiento (reintentos, escalado, autorrevisión): adáptalos.

Esta tarea es ancha. **Divídela en 3 encargos** con la misma plantilla de 1a:

- (i) `policy.js`, `config.js`, `settings.js` y `config-file.js`, con sus tests;
- (ii) `config-template.js`, `orchestrator.js`, `events.js` y `report.js`, con sus tests;
- (iii) `project-state.js`, `cli.js` e `instructions.js`, con sus tests.

En cada uno, `acceptanceCriteria` debe incluir «`npm test` pasa».

**Comprobación final:**

- `grep -rn "level" src | grep -v "reasoning_level\|supported_reasoning"` solo debe dejar el aviso de compatibilidad de `config.js`.
- `node bin/agentrelay.js run --help` no menciona `--level`.

### 1d. Fundir los comandos de ajuste en `use`

**Objetivo:** que cambiar de IA solo se haga con `use`. Se quitan `models`, `executors` (listar) y los comandos de chat `/ar:modelo`, `/ar:esfuerzo` y `/ar:ejecutor`.

- `executors add <nombre>` se queda como alias interno: lo usa `setup`.
- `set` y `unset` se quedan, pero salen de la ayuda corta: sirven para ajustes poco frecuentes como `timeout`.

**Archivos que se borran:**

- `assets/claude-commands/ar/modelo.md`
- `assets/claude-commands/ar/esfuerzo.md`
- `assets/claude-commands/ar/ejecutor.md`

**Archivos que se editan:**

- `src/claude-commands.js`, para que los comandos retirados se borren también del equipo del usuario:
  - añade `export const RETIRED_COMMANDS = ['modelo.md', 'esfuerzo.md', 'ejecutor.md', 'nivel.md', 'triaje.md'];`;
  - en `installCommands`, después del bucle, borra cada uno de esos archivos de `targetDir` **solo si existe y contiene `MANAGED_MARK`**, y añádelo a un nuevo `result.retired`;
  - `removeCommands` también los retira (con la misma condición).
- `src/cli.js`:
  - quita `cmdModels`, `case 'models'` y la rama de listar de `cmdExecutors`. Sin `add`, responde `Usa: agentrelay use`;
  - quita sus líneas de `HELP`, incluido el bloque «Ajustes rápidos»;
  - mueve `set` y `unset` a una sección final «Avanzado» de la ayuda;
  - en `cmdSetup`, el texto pasa a ser `Comandos de Claude Code: /ar:estado y /ar:usar` y muestra los retirados (`result.retired`) si hay.
- Tests:
  - `test/claude-commands.test.js`: la lista queda en `['estado.md', 'usar.md']`, ajusta los números y añade un test de `RETIRED_COMMANDS`: un archivo gestionado se borra y uno propio, no;
  - `test/setup-init.test.js` y `test/doctor-instructions.test.js`: ajusta los números y las listas;
  - los tests de `models` y de listar `executors` se borran o se pasan a `use`.

**Tarea para delegar:** plantilla de 1a, con `files` = `src/claude-commands.js`, `src/cli.js` y `test/claude-commands.test.js`. Haz un segundo encargo para el resto de los tests.

### 1e. Quitar `config refresh` y el bloque de modelos

**Archivos que se borran:**

- `src/config-models.js`
- `test/config-models.test.js`
- `test/config-refresh.test.js`

**Archivos que se editan:**

- `src/cli.js`:
  - la importación de `./config-models.js`;
  - la función `cmdConfigRefresh` y su uso en `cmdConfig`, tanto en `refresh` como en `init`;
  - la línea `agentrelay config refresh …` de `HELP`;
  - la opción `only`.
- `test/config.test.js`: el test que comprueba `agentrelay:models:start` (alrededor de la línea 129). Quita solo esa comprobación, no el test entero.

Lo que el bloque de modelos ofrecía ahora lo da `agentrelay use` (interactivo) y, tras el punto 5, `agentrelay use --list`.

### 1f. Acortar `AGENTS.md`

✋ **Hazlo tú. Documentación sensible: no la delegues.**

- **Sección 22 y bloque gestionado** (`<!-- agentrelay:start -->`): dicen lo mismo dos veces. Deja en la sección 22 solo lo que el bloque no dice:
  - usar la copia instalada y no `node bin/agentrelay.js`;
  - actualizar con `git pull` y `npm ci`;
  - informar al usuario de lo que se delega.
- **No edites el bloque gestionado a mano:** se regenera con `node bin/agentrelay.js init`, y su texto sale de `PROJECT_BLOCK` en `src/instructions.js`. Si quieres cambiarlo, cambia `PROJECT_BLOCK` y su test.
- **Sección 24:** quita lo que ya no existe (triaje, niveles).
- Comprueba que nada se pierde: cada regla que quites debe estar ya en otro sitio del mismo archivo.

**Al terminar todo el punto 1:**

- Actualiza `docs/MANUAL.md`: quita lo que ya no exista y añade `RETIRED_COMMANDS` si hace falta explicarlo.
- Actualiza `docs/DISENO.md`, sección 4, «Niveles»: escribe que se sustituyeron por una sola política configurable con `policy`.
- `CHANGELOG.md`: apartado «Eliminado» con cada cosa quitada y qué la sustituye. 🛑 Es un cambio incompatible: recuérdale al usuario que la próxima versión debería ser 0.2.0, pero **no la cambies tú**.

---

## 2. Probar `agentrelay start` en Taller

🛑 **Lo prueba el usuario en su equipo**, con su orquestador. Tú preparas la lista y recoges el resultado.

1. Dale al usuario estos pasos, tal cual:

   ```sh
   cd <carpeta de Taller>
   git status --short          # debe salir vacío; si no, haz commit antes
   agentrelay start            # responde a las preguntas
   agentrelay watch            # en otro terminal
   ```

2. Pídele que, en el chat de su orquestador, pegue el mensaje que muestra `start` al final y le encargue una tarea pequeña de Taller, por ejemplo una de su `PROYECTO.md`.
3. Pídele que te pase:
   - la salida completa de `agentrelay start`;
   - la de `agentrelay doctor`;
   - y si el orquestador delegó con `agentrelay run` o hizo el trabajo él mismo.
4. Por cada fallo, apunta una línea en `TODO.md` («Ahora») con el síntoma exacto. No lo arregles en el mismo paso.
5. Marca la casilla «Probar `agentrelay start` en Taller» solo cuando haya una ejecución completa (`run` → `review accept`) sin errores.

**Lo que se sabe de Taller:** no tiene `AGENTS.md` ni `CLAUDE.md`. `start` creará los dos y pedirá confirmación para hacer commit.

---

## 3. Pulir la sangría de las opciones que activa `set`/`use`

**Síntoma:** al activar una opción dentro de un bloque, por ejemplo `executor.type`, el archivo queda así:

```jsonc
  "executor": {
  "type": "opencode",
```

Debería quedar así:

```jsonc
  "executor": {
    "type": "opencode",
```

Es JSON válido, pero feo.

**Causa:** en `src/config-template.js` las opciones de dentro de `executor`, `validation`, `policy` y `report` se generan con la misma sangría que su bloque (el último argumento de `option(...)` es `'  '`). Además, en `src/config-file.js`, `setConfigValue`, el caso 2 («la opción no está, pero su objeto padre sí») usa `indentOf(lines[block.open])` sin sumar 2 espacios.

**Pasos:**

1. En `config-template.js`, cambia a `'    '` (4 espacios) el último argumento de cada `option(...)` que esté dentro de un bloque `// "executor": {`, `// "validation": {`, `// "policy": {` o `// "report": {`.
   - Las de `selfReview`, que está dentro de `policy`, pasan de `'    '` a `'      '` (6 espacios).
   - Las opciones de primer nivel no cambian.
2. En `config-file.js`, en el caso 2 de `setConfigValue`, usa `` `${indentOf(lines[block.open])}  ` ``.
3. Añade un test en `test/config-file.test.js`:
   - toma `configTemplate({ scope: 'user' })`;
   - aplica `setConfigValue(text, 'executor.type', 'opencode')`;
   - comprueba que la línea resultante empieza por 4 espacios (`/^ {4}"type": "opencode",$/m`).

**Tarea para delegar:**

```json
{
  "objective": "Que las opciones que se activan dentro de un bloque del archivo de configuración queden con 2 espacios más de sangría que su bloque.",
  "context": "Ver docs/PLAN.md, punto 3: causa y pasos exactos. El archivo de configuración es JSONC con comentarios; config-file.js lo edita línea a línea y debe conservar todo lo demás byte a byte.",
  "files": ["src/config-template.js", "src/config-file.js", "test/config-file.test.js"],
  "constraints": ["(las 4 restricciones comunes)", "No cambies el texto de los comentarios de la plantilla, solo la sangría.", "Los tests existentes de config-file.test.js deben seguir pasando sin cambiarlos, salvo los que comprueben la sangría antigua."],
  "acceptanceCriteria": ["agentrelay use opencode en un AGENTRELAY_HOME vacío deja '    \"type\": \"opencode\",' con 4 espacios.", "npm test pasa."],
  "validation": ["npm test"],
  "doNotModify": ["package.json", "CHANGELOG.md", "TODO.md", "src/proc.js"]
}
```

**Comprobación a mano:**

```sh
AGENTRELAY_HOME=$(mktemp -d) node bin/agentrelay.js use opencode
```

Después mira el archivo `config.json` de esa carpeta.

---

## 4. Aviso al ejecutar `start`/`init` dentro de la carpeta de AgentRelay

**Problema:** si alguien ejecuta `init` o `start` dentro de la copia instalada de AgentRelay, le añade commits y `update` deja de funcionar (ya pasó: 6 commits locales). Hoy no se puede saber si una carpeta es la copia «instalada» o la «de desarrollo»: las dos son la raíz del paquete.

🛑 **PARA y pregunta al usuario cuál prefiere** (recomendada: A):

- **A. Avisar siempre que la carpeta sea la de AgentRelay.** Si la raíz del repositorio es la carpeta del propio AgentRelay (`path.resolve(fileURLToPath(new URL('..', import.meta.url)))` desde `src/cli.js`), `init` y `start` muestran «Estás en la carpeta de AgentRelay. Si es tu copia instalada, no ejecutes init aquí: impedirá agentrelay update.» y piden confirmación. Con `--yes` siguen sin preguntar, que es lo que necesita quien desarrolla. Es sencilla y no necesita marcar nada.
- **B. Marcar la copia instalada.** `update` crea un archivo `.agentrelay-instalada` (ignorado por git) en la copia que actualiza, e `init`/`start` se niegan si lo encuentran. Es más precisa, pero solo funciona después del primer `update`.

**Pasos para A:**

1. En `src/cli.js`, crea la función `isAgentRelayFolder(root)`: compara `path.resolve(root)` con la raíz del paquete. En Windows, compara en minúsculas.
2. Llámala al principio de `cmdInit` y de `cmdStart`. Si devuelve `true`, haz `const ok = await confirm('…¿Seguir?', { yes: values.yes })`. Si `ok` no es `true`: muestra «Cancelado.» y devuelve 1.
3. Test: `init --cwd <raíz del paquete>` sin `--yes` y sin terminal devuelve 1 y no crea nada. ⚠️ Usa `AGENTRELAY_INSTALL_DIR` o una copia temporal: **no ejecutes `init` sobre la carpeta real del repositorio en el test.**

Delega con la plantilla de 1a (`files`: `src/cli.js` y `test/setup-init.test.js`).

---

## 5. Inventario de modelos: `agentrelay use --list`

**Objetivo:** ver en un solo sitio todos los modelos de todos los ejecutores: cuál está en uso, si el ejecutor está instalado y si es gratuito. Sustituye a la idea de `models --all` y a la lista que había en el archivo de configuración.

**Salida esperada:**

```
Codex (codex) · instalado · cuenta de ChatGPT
  ● gpt-6-luna        bajo medio* alto extremo máximo
    gpt-5.5           medio* alto
OpenCode (opencode) · instalado · gratis
    opencode/nemotron-3-ultra-free
    opencode/mimo-v2.6-flash-free
Cline (cline) · no instalado · clave de API
    deepseek-v4-pro
    deepseek-v4-flash
Cambia con: agentrelay use <ejecutor> <modelo>
```

`●` marca el modelo en uso y `*`, el esfuerzo por defecto.

**Pasos:**

1. En `src/executors/catalog.js`, añade a cada entrada de `CATALOG` un campo `cost`:
   - `'cuenta de ChatGPT'` para `codex`;
   - `'clave de API'` para `cline`;
   - `'gratis'` para `opencode`.
2. En `src/use.js`:
   - añade `export async function listAll(current)`. Para cada entrada de `CATALOG`, llama a `getExecutor(name).listModels(...)`, con `{ ...EXECUTOR_DEFAULTS[name], type: name }` como `executor`, o `current` si es el ejecutor en uso;
   - protege cada llamada con `try/catch` y un tiempo máximo de 20 s (copia el patrón de `Promise.race` de `cmdConfigRefresh` en `src/cli.js`, si aún existe, o escríbelo igual);
   - si un ejecutor falla, muestra `  (no se pudo leer la lista: <mensaje>)`.
3. En `cmdUse`: si `values.list` es `true`, imprime la salida de arriba y devuelve 0. Añade `list: { type: 'boolean' }` a `OPTIONS` en `src/cli.js`, y la línea a `HELP`.
4. `assets/claude-commands/ar/usar.md`: menciona `/ar:usar --list` en el texto final.
5. Tests en `test/use.test.js`: con un `CODEX_HOME` falso con `models_cache.json` (copia el patrón del test interactivo), comprueba que `use --list` muestra `● gpt-6-luna` y la línea de OpenCode.
6. `docs/MANUAL.md`, apartado 2: añade `agentrelay use --list` con un ejemplo.

Delega en dos encargos: (i) los pasos 1-3 y 5; (ii) los pasos 4 y 6. La documentación siempre en un encargo aparte.

---

## 6. `doctor --fix`

🛑 **PARA:** confirma con el usuario esta lista antes de empezar. Solo se arregla lo que es seguro y reversible, y cada arreglo **pregunta antes** (con `--yes`, sin preguntar).

| Problema que detecta `doctor` | Arreglo propuesto |
|---|---|
| Instrucciones globales o comandos `/ar:` desactualizados | Ejecutar lo mismo que `agentrelay setup --yes` |
| Instrucciones del proyecto desactualizadas | Ejecutar lo mismo que `agentrelay init --yes`, solo si el árbol está limpio |
| Ejecuciones interrumpidas | Marcarlas como `interrupted`, como `recover <id>`, una a una |
| `.gitignore` sin `.agentrelay/` o sin `agentrelay.config.json` | Añadir las líneas que falten (`ensureProjectConfigIgnored`) |
| Sin sesión de Codex | **No se arregla solo:** muestra `agentrelay login` |
| Sandbox de Windows | **Pendiente de definir:** pregunta al usuario qué falla exactamente antes de incluirlo |

**Pasos (cuando esté confirmado):**

1. En `cmdDoctor` (`src/cli.js`), guarda cada problema arreglable en una lista `fixes` (`{ text, apply }`) en lugar de solo escribir el aviso.
2. Al final: si `values.fix` es `true`, recorre `fixes`. Para cada uno, `confirm(text + ' ¿Arreglarlo?', { yes: values.yes })` y `await apply()`. Si no se pasa `--fix` pero `fixes` no está vacía, muestra «Puedes arreglar N problema(s) con: agentrelay doctor --fix».
3. Vuelve a ejecutar el diagnóstico al terminar y devuelve su código.
4. Tests: un proyecto con instrucciones desactualizadas y `doctor --fix --yes` termina con «al día».
5. Manual, apartado 7: añade `agentrelay doctor --fix` como primer paso.

Delega con la plantilla de 1a: un encargo para el código y otro para el manual.

---

## 7. Cambio de ejecutor cuando se agota la cuota

🛑 **PARA:** es una decisión de diseño. Presenta al usuario estas opciones y espera su elección. **No empieces sin ella** (está en `TODO.md` desde el 2026-10-02).

- **A. Aviso y perfil de reserva (recomendada, la más sencilla).** Cuando el ejecutor falla por cuota o límite, `run` no reintenta: deja la ejecución como fallida con el mensaje «El ejecutor ha agotado su cuota. Cambia con: agentrelay use <perfil> y repite con agentrelay review <id> --decision fix --feedback "continúa"». Si el usuario ha definido `"fallback": "gratis"` en su configuración, el mensaje lo nombra directamente. No cambia nada solo.
- **B. Cambio automático.** Igual que A, pero si existe `fallback`, AgentRelay cambia al perfil de reserva y repite el intento sin preguntar. Es más cómodo, pero menos predecible: puede pasar a un modelo peor sin que te des cuenta.
- **C. Cadena de ejecutores.** Una lista ordenada (`"fallbacks": ["gratis", "deepseek"]`) que se prueba en orden. Es la más potente y la más compleja: no la recomiendo hasta tener datos de uso.

**Pasos para A** (la base sirve también para B):

1. **Detectar la cuota.** Pide al usuario la salida de una ejecución real que falló por cuota: los archivos `.agentrelay/runs/<id>/attempt-*.stderr.log` y `*.ndjson`. Sin un ejemplo real, no adivines el texto.
   - Con ese ejemplo, añade en `src/executors/common.js` `export function isQuotaError(text)` con una expresión como `/usage limit|rate limit|quota|429|insufficient_quota/i`.
   - Ajústala al texto real de cada ejecutor y añade un test por cada texto real.
2. **Clasificar el fallo.** En cada adaptador (`codex.js`, `opencode.js`, `cline.js`), cuando `run` devuelve `ok: false`, añade `quota: isQuotaError(stderr + error)` al resultado.
3. **No reintentar.** En `src/orchestrator.js`:
   - en `continueCycle`, si `result.quota`, llama directamente a `finalize` sin reintentar;
   - en `finalize`, `status = 'failed'` y en `reasons` pon el mensaje de arriba.
   - ⚠️ Comprueba que `failed` es un estado que `list`, `show`, `review` y `project-state.js` ya entienden. Si no, usa `escalated` con ese motivo y díselo al usuario.
4. **Configuración.** Añade la clave opcional `fallback` (texto, el nombre de un perfil) a `KNOWN` y a la validación en `src/config.js`. Debe existir en `profiles`; si no, avisa.
5. **Tests:**
   - el ejecutor falso de `test/fixtures/` devuelve un error de cuota;
   - la ejecución termina sin reintentos y con el mensaje que nombra el perfil.
6. **Manual**, apartado 7: añade la fila «El ejecutor ha agotado su cuota» con `agentrelay use <perfil>` y cómo definir `fallback`.

Divide en tres encargos: (i) los pasos 1-2 y su test; (ii) los pasos 3-5; (iii) el paso 6.
