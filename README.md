# AgentRelay

**Español** · [English](README.en.md)

Orquestador multiplataforma de agentes de IA para desarrollo de software. Permite que un modelo de alta capacidad (el **orquestador**) delegue tareas concretas a un agente más económico (el **ejecutor**), valide el resultado de forma objetiva y lo revise antes de aceptarlo.

El objetivo es reducir el consumo de modelos premium sin renunciar a la supervisión: el orquestador planifica, decide y valida; el ejecutor implementa.

> **Estado:** versión 0.0.2, prototipo funcional. La interfaz puede cambiar antes de la 0.1.0.

## Cómo funciona

```
orquestador ──tarea──▶ AgentRelay ──▶ ejecutor (implementa)
                          │
                          ├─ validaciones objetivas (tests, build, lint…)
                          ├─ corrección automática si fallan (con límite de reintentos)
                          ├─ self-review del ejecutor (según nivel y tarea)
                          ▼
             informe: diff, archivos, validaciones, informe del ejecutor, consumo
                          │
orquestador ◀─────────────┘  accept · fix · escalate · reject
```

1. El orquestador describe una tarea autocontenida (objetivo, criterios de aceptación, comandos de validación…).
2. AgentRelay la entrega al ejecutor, que trabaja directamente sobre el repositorio.
3. AgentRelay calcula el diff, ejecuta las validaciones y comprueba que no se hayan tocado archivos protegidos.
4. Si algo falla, el ejecutor recibe los errores y corrige, hasta el máximo de reintentos.
5. Según el nivel, el ejecutor revisa su propio trabajo (self-review).
6. El resultado queda **aceptado**, **pendiente de revisión** o **escalado** al orquestador.
7. El orquestador revisa y decide: aceptar (con validación final), pedir una corrección, asumir la tarea o rechazarla.

AgentRelay nunca hace commits, stash ni push: los cambios quedan en el árbol de trabajo para que los revises.

## Integraciones disponibles

| Papel | Integración | Estado |
|---|---|---|
| Ejecutor | [Cline CLI](https://www.npmjs.com/package/cline) con cualquier proveedor que Cline soporte (por defecto, DeepSeek `deepseek-v4-pro`) | disponible |
| Orquestador | Cualquier agente o persona capaz de ejecutar comandos; pensado para Claude Code | disponible (vía CLI) |

El diseño permite añadir otros ejecutores y proveedores más adelante.

## Requisitos

- Node.js 20 o superior (se recomienda 22 o superior: con Node 20, Cline avisa de que no puede leer el almacén de certificados del sistema; solo afecta a redes con certificados corporativos o autofirmados).
- Git. El directorio de trabajo debe ser un repositorio git.
- Un proveedor configurado en Cline (por ejemplo, una API key de DeepSeek).

Windows, Linux y macOS.

## Instalación

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install         # instala también Cline CLI, el ejecutor
npm link            # deja disponible el comando "agentrelay"
```

Sin `npm link` también puedes usar `node <ruta>/bin/agentrelay.js`.

Cline CLI se instala como dependencia de AgentRelay y se usa esa copia. Comparte la configuración con la extensión de Cline para VS Code (`~/.cline/data`): si ya la tienes configurada, no hay que hacer nada más. Si no, configura el proveedor una vez:

```sh
npx cline auth --provider deepseek --apikey <tu-api-key> --modelid deepseek-v4-pro
```

(desde la carpeta de AgentRelay)

Para actualizar más adelante: `git pull` y `npm install` en la carpeta de AgentRelay.

## Probar AgentRelay en 5 minutos

El repositorio incluye un pequeño proyecto de demostración (`examples/demo`) y una tarea para él (`examples/demo-task.json`): añadir una función `slugify` con sus tests. El coste con DeepSeek es de menos de un céntimo.

**1. Crea una copia de la demo como repositorio git** (fuera de la carpeta de AgentRelay).

PowerShell (Windows):

```powershell
$AR = "C:\ruta\a\AgentRelay"
Copy-Item -Recurse "$AR\examples\demo" "$HOME\agentrelay-demo"
cd "$HOME\agentrelay-demo"
git init
git add -A
git commit -m "demo"
```

Bash (Linux/macOS/Git Bash):

```sh
AR=/ruta/a/AgentRelay
cp -r "$AR/examples/demo" ~/agentrelay-demo
cd ~/agentrelay-demo
git init && git add -A && git commit -m "demo"
```

**2. Comprueba el entorno:**

```sh
agentrelay doctor
```

**3. Delega la tarea y mira cómo trabaja.** En PowerShell:

```powershell
agentrelay run "$AR\examples\demo-task.json"
```

En Bash: `agentrelay run "$AR/examples/demo-task.json"`.

Verás en directo cada paso del ejecutor:

```
[00:00] ▶ Intento 1 (implement) · deepseek/deepseek-v4-pro
[00:07]   piensa: I need to add and export a `slugify(text)` function in `src/text.js`…
[00:07]   lee: ./src/text.js, ./spec/text.spec.js, ./package.json
[00:18]   edita: ./src/text.js
[00:20]   ejecuta: npm test
[00:22]   tokens 39080/1339 · 0.0056 USD
[00:25] ✔ Intento 1 completado en 23 s (done)
[00:25]   validando…
[00:26]   validación `npm test`: correcta
[00:26] ■ Estado: awaiting_review (el nivel 3 revisa siempre)
```

Al terminar se imprime el informe completo: diff, validaciones e informe del ejecutor.

**4. Revisa y decide.** Mira los cambios con `git diff` o en tu editor y después:

```sh
agentrelay review <id> --decision fix --feedback "slugify debe lanzar TypeError si no recibe un string"
agentrelay review <id> --decision accept
```

El `<id>` aparece en la primera línea de la ejecución y en `agentrelay list`. Con `fix` verás en directo cómo el ejecutor corrige; `accept` repite las validaciones antes de aceptar.

**5. Prueba con otro nivel:** `agentrelay run <tarea> --level 4` añade una self-review en una segunda ejecución; `--level 1` acepta automáticamente si las validaciones pasan. Antes, confirma o descarta los cambios de la prueba anterior (`git stash -u`, `git checkout .` o un commit), porque AgentRelay necesita el repositorio limpio.

## Ver el trabajo en directo

- `agentrelay run` y `agentrelay review` muestran la actividad por la salida de error mientras ocurre (fases, archivos que lee o edita el ejecutor, comandos que ejecuta, su razonamiento resumido, tokens, coste y validaciones). `--quiet` la desactiva.
- `agentrelay watch` sigue desde **otro terminal** las ejecuciones que lance otro proceso, por ejemplo un orquestador como Claude Code. Sin id sigue la más reciente y salta a cada ejecución nueva hasta que pulses Ctrl+C; con un id muestra esa ejecución y termina cuando deja de estar en curso.

En VS Code: abre un terminal dividido, ejecuta `agentrelay watch` en uno y trabaja en el otro o en el chat del orquestador.

Comprueba el entorno desde el repositorio en el que vas a trabajar:

```sh
agentrelay doctor
```

## Uso

**Quién escribe qué.** En el uso normal tú conversas con tu orquestador (por ejemplo, Claude Code en VS Code) y le pides el trabajo en lenguaje natural; es el orquestador quien redacta la tarea en JSON y ejecuta `agentrelay`. Para que sepa hacerlo, añade las instrucciones de [«Uso con Claude Code como orquestador»](#uso-con-claude-code-como-orquestador) al `CLAUDE.md` de tu proyecto. Los pasos de abajo describen lo que ocurre por debajo y sirven también para usar AgentRelay a mano, por ejemplo para probarlo.

### 1. Describe la tarea

Un archivo JSON (ver [`examples/demo-task.json`](examples/demo-task.json)):

```json
{
  "title": "Añadir slugify a las utilidades de texto",
  "objective": "Añade y exporta slugify(text) en src/text.js.",
  "complexity": "normal",
  "files": ["src/text.js", "test/text.test.js"],
  "acceptanceCriteria": ["slugify('Hola Mundo') devuelve 'hola-mundo'"],
  "validation": ["npm test"],
  "doNotModify": ["package.json"]
}
```

| Campo | Descripción |
|---|---|
| `objective` | Obligatorio. Qué hay que conseguir. |
| `title` | Título corto (por defecto, la primera línea del objetivo). |
| `context` | Contexto relevante para el ejecutor. |
| `type` | `feature`, `fix`, `refactor`, `docs`, `test`… (informativo). |
| `complexity` | `trivial`, `normal` (por defecto) o `complex`. Influye en la self-review y la revisión. |
| `files` | Archivos o áreas afectadas. |
| `constraints` | Restricciones. |
| `acceptanceCriteria` | Criterios de aceptación. |
| `validation` | Comandos de validación (se ejecutan desde la raíz del repositorio). |
| `doNotModify` | Archivos que no deben cambiar; una entrada acabada en `/` protege un directorio. |
| `selfReview` | Fuerza el modo de self-review: `none`, `inline` o `pass`. |

### 2. Delega

```sh
agentrelay run tarea.json
# o por la entrada estándar:
agentrelay run - < tarea.json
```

El progreso sale por stderr y el informe por stdout (`--json` para salida estructurada). El repositorio debe estar limpio; `--allow-dirty` permite delegar con cambios previos (se incluirán en el diff).

### 3. Revisa

```sh
agentrelay show                    # informe de la última ejecución
agentrelay review <id> --decision accept
agentrelay review <id> --decision fix --feedback "El caso vacío devuelve null; debe devolver ''"
agentrelay review <id> --decision escalate    # el orquestador asume la tarea
agentrelay review <id> --decision reject
```

- `accept` ejecuta antes una **validación final**; si falla, no acepta (salvo `--force`).
- `fix` envía el feedback al ejecutor, vuelve a validar y deja la tarea otra vez pendiente de revisión. Cuenta como reintento.
- `escalate` marca la tarea para que la resuelva el orquestador. Después puede validarse con `agentrelay check <id>` y aceptarse con `accept`.

Otros comandos: `agentrelay list`, `agentrelay watch [id]`, `agentrelay check [id]`, `agentrelay init` (crea `agentrelay.config.json`).

Códigos de salida: `0` correcto, `1` error, `2` tarea escalada.

## Niveles de orquestación

| Nivel | Nombre | Revisión del orquestador | Reintentos | Corrección automática | Self-review (trivial / normal / compleja) |
|---|---|---|---|---|---|
| 1 | Máximo ahorro | solo ante fallos o señales graves | 3 | sí | none / none / inline |
| 2 | Ahorro | selectiva (si hay señales de riesgo) | 2 | sí | none / inline / pass |
| 3 | Equilibrado *(por defecto)* | siempre | 2 | sí | none / inline / pass |
| 4 | Calidad | siempre; exige validaciones | 1 | sí | inline / pass / pass |
| 5 | Máxima supervisión | siempre; exige validaciones | 1 | no: los fallos van al orquestador | inline / pass / pass |

Se elige con `level` en la configuración o con `--level` en cada ejecución.

**Señales de riesgo** (revisión selectiva): tarea compleja, ausencia de validaciones, más de 5 archivos modificados o incidencias declaradas por el ejecutor. **Señales graves** (también en el nivel 1): el ejecutor no ha hecho cambios, ha creado commits o tiene dudas, o el nivel exige validaciones y la tarea no tiene.

Más pasos no significan automáticamente más calidad: cada fase tiene un coste y AgentRelay intenta usar primero las validaciones objetivas, después la self-review del ejecutor y solo cuando hace falta la revisión del orquestador.

## Self-review del ejecutor

- **none**: el ejecutor implementa y devuelve el resultado.
- **inline**: el prompt de implementación incluye una lista de autorrevisión (criterios, validaciones, errores evidentes, archivos innecesarios). No añade ejecuciones.
- **pass**: además, cuando las validaciones pasan, una segunda ejecución recibe el diff y los resultados de validación, revisa el trabajo y corrige lo que encuentre.

La pasada separada se omite cuando es redundante: sin cambios, o un cambio pequeño (según el nivel) ya cubierto por validaciones que pasan.

La self-review no sustituye la revisión del orquestador: el ejecutor comprueba si ha hecho lo que se le pidió; el orquestador, si la solución resuelve el problema y cumple los criterios.

## Reintentos y escalado

- Si fallan las validaciones o el ejecutor termina con error, AgentRelay le envía los errores para que corrija (niveles 1-4), hasta el máximo de reintentos.
- Si el ejecutor declara que está bloqueado o pide escalado, la tarea se escala sin más reintentos.
- Al agotar los reintentos la tarea queda **escalada**: el orquestador la asume.
- Las correcciones pedidas por el orquestador (`fix`) comparten el mismo límite (`--force` permite un intento más).

## Configuración

`agentrelay.config.json` en la raíz del repositorio (opcional) y `agentrelay.config.local.json` para ajustes locales que no deben versionarse. Las opciones de línea de comandos tienen prioridad.

```json
{
  "level": 3,
  "executor": {
    "type": "cline",
    "command": "cline",
    "provider": "deepseek",
    "model": "deepseek-v4-pro",
    "thinking": null,
    "timeoutSeconds": 1200,
    "extraArgs": []
  },
  "validation": {
    "commands": [],
    "timeoutSeconds": 600
  },
  "policy": {},
  "report": { "maxDiffChars": 60000, "maxOutputChars": 4000 }
}
```

- `executor.command`: programa a ejecutar; también admite un array, p. ej. `["node", "/ruta/a/cline"]`.
- `executor.thinking`: `none`, `low`, `medium`, `high` o `xhigh`; `null` usa el valor del proveedor.
- `validation.commands`: comandos que se ejecutan en todas las tareas, además de los de la tarea.
- `policy`: sustituye valores del nivel, p. ej. `{ "maxRetries": 3, "review": "selective", "selfReview": { "normal": "pass" } }`.

Las credenciales no se guardan en la configuración de AgentRelay: las gestiona el ejecutor.

## Uso con Claude Code como orquestador

Claude Code puede usar AgentRelay directamente desde su terminal. Un ejemplo de instrucciones para el `CLAUDE.md` de tu proyecto:

```markdown
## Delegación con AgentRelay
- Delega las tareas de implementación bien acotadas con `agentrelay run - <<'EOF' … EOF`,
  escribiendo una tarea JSON con objective, files, acceptanceCriteria, validation y doNotModify.
- Lee el informe (diff, validaciones, informe del ejecutor) y decide con
  `agentrelay review <id> --decision accept|fix|escalate|reject`.
- Si la tarea queda escalada, resuélvela tú y cierra con `--decision accept`.
```

Para ver en directo lo que hace el ejecutor mientras hablas con Claude Code, deja `agentrelay watch` abierto en un terminal de VS Code.

## Archivos que genera

Cada ejecución se guarda en `.agentrelay/runs/<id>/` dentro del repositorio: tarea, estado, prompts enviados, salida del ejecutor (NDJSON), eventos (`events.ndjson`), `diff.patch` y `report.md`. El directorio `.agentrelay/` se ignora a sí mismo y no aparece en `git status`.

## Consumo y costes

Por cada intento se registran tokens, duración y el **coste estimado que informa el ejecutor** (Cline lo calcula con sus tablas de precios). No es una factura: consulta el consumo real en tu proveedor. AgentRelay no puede medir el consumo del orquestador.

Ten en cuenta que el acceso por API de pago por uso y las suscripciones son cosas distintas: el ejecutor necesita un acceso que su CLI soporte.

## Seguridad

- El ejecutor trabaja con **aprobación automática de herramientas** dentro del repositorio: puede editar archivos y ejecutar comandos. Úsalo en repositorios que controles.
- AgentRelay no hace commits, stash, checkout ni push, y no toca el índice de git.
- Por defecto se niega a delegar sobre un repositorio con cambios sin confirmar.
- Detecta si el ejecutor crea commits o modifica archivos protegidos.

## Limitaciones de la versión 0.0.2

- Un único ejecutor (Cline CLI). Las tareas se ejecutan de una en una.
- Todavía no hay panel en VS Code: se usa desde el terminal (está en la hoja de ruta).
- El informe estructurado del ejecutor depende de que el modelo lo devuelva; si no lo hace, se muestra su texto final. Los datos objetivos (diff, validaciones) los calcula siempre AgentRelay.
- La self-review en pasada separada empieza una sesión nueva del ejecutor.
- Validado en Windows; Linux y macOS están soportados por diseño, pero todavía no se han probado en esos sistemas.

Consulta [TODO.md](TODO.md) y [CHANGELOG.md](CHANGELOG.md).

## Desarrollo

```sh
npm test
```

Los tests usan un simulador del ejecutor y no llaman a ningún modelo.

## Créditos y licencia

**AgentRelay** está desarrollado y mantenido por **CatLinux**.
Copyright (C) 2026 CatLinux.

Licencia [WNCL-CU-1.0](LICENSE): puedes usarlo gratis para cualquier fin, también comercial, y modificarlo y compartirlo sin coste. Nadie puede cobrar por el software ni por su uso; solo se pueden cobrar servicios de soporte e implementación.

Las copias y los forks deben conservar esta atribución y enlazar a https://github.com/catlinux/AgentRelay.

### Material de terceros

| Componente | Autor | Licencia | Enlace |
| --- | --- | --- | --- |
| Cline CLI (dependencia npm, no incluida en el repositorio) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
