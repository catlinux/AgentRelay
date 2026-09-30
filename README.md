# AgentRelay

[![Windows](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-windows.yml?branch=main&label=Windows)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-windows.yml) [![Linux](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-linux.yml?branch=main&label=Linux)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-linux.yml) [![macOS](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-macos.yml?branch=main&label=macOS)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-macos.yml) [![Licencia](https://img.shields.io/badge/license-WNCL--CU--1.0-blue)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933) ![Versión](https://img.shields.io/github/package-json/v/catlinux/AgentRelay) [![Último commit](https://img.shields.io/github/last-commit/catlinux/AgentRelay)](https://github.com/catlinux/AgentRelay/commits/main) ![Ejecutor](https://img.shields.io/badge/ejecutor%20por%20defecto-Codex%20%2B%20GPT--6%20Luna-black)

**Español** · [English](README.en.md) · [Guía de instalación](INSTALL.md)

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
| Ejecutor (por defecto) | [Codex CLI](https://github.com/openai/codex) de OpenAI con la sesión de tu cuenta de ChatGPT, sin clave de API; modelo `gpt-6-luna`, incluido en el plan gratuito | disponible |
| Ejecutor | [Cline CLI](https://www.npmjs.com/package/cline) con cualquier proveedor que Cline soporte (p. ej. DeepSeek `deepseek-v4-pro`) | disponible |
| Orquestador | Cualquier agente o persona capaz de ejecutar comandos; pensado para Claude Code | disponible (vía CLI) |

El diseño permite añadir otros ejecutores y proveedores más adelante.

## Requisitos

- Node.js 20 o superior (se recomienda 22 o superior: con Node 20, Cline avisa de que no puede leer el almacén de certificados del sistema; solo afecta a redes con certificados corporativos o autofirmados).
- Git. El directorio de trabajo debe ser un repositorio git.
- Una cuenta de ChatGPT (vale la gratuita) para el ejecutor por defecto, Codex. Con Cline como ejecutor, en su lugar, un proveedor configurado (por ejemplo, una API key de DeepSeek).

Windows, Linux y macOS (macOS sin probar: ver [Limitaciones](#limitaciones-de-la-versión-002)).

## Instalación

> **Guía paso a paso para Windows, Linux y macOS: [INSTALL.md](INSTALL.md).** Lo que sigue es un resumen.

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install         # instala también Codex CLI, el ejecutor por defecto
npm link            # deja disponible el comando "agentrelay"
agentrelay login    # conecta tu cuenta de ChatGPT (se abre el navegador)
```

Sin `npm link` también puedes usar `node <ruta>/bin/agentrelay.js`.

`agentrelay login` se hace una sola vez. Si ya usas Codex en VS Code con tu cuenta, la sesión se comparte y no hace falta. En un equipo sin navegador (por ejemplo, por SSH), usa `agentrelay login --device`: muestra un código que introduces desde otro dispositivo. `agentrelay doctor` comprueba que la sesión está activa, y `agentrelay run` se detiene antes de empezar, con un aviso claro, si no la hay.

La copia de Codex se instala como dependencia de AgentRelay y se usa antes que cualquier otra que tengas en el `PATH` o en la extensión de VS Code.

**Ejecutores opcionales.** `npm install` instala solo el núcleo y Codex: es ligero y sin avisos de vulnerabilidades. Los demás ejecutores se instalan cuando los quieras, en una carpeta de tu usuario (`~/.agentrelay/executors`), nunca dentro de la de AgentRelay, así que no les afectan las actualizaciones:

```sh
agentrelay executors               # lista los ejecutores, cuáles tienes instalados y cuál está en uso
agentrelay executors add cline     # instala Cline (DeepSeek u otros proveedores con clave de API)
```

`agentrelay setup` también te ofrece instalarlos (o `agentrelay setup --executors cline`, sin preguntas). Al instalar Cline, AgentRelay te muestra el comando para configurar su proveedor; si ya usas la extensión de Cline en VS Code, comparte su configuración (`~/.cline/data`) y no hace falta. Para usarlo, pon `{ "executor": { "type": "cline" } }` en `agentrelay.config.local.json`.

Para actualizar más adelante, en la carpeta de AgentRelay: `git pull` y después `npm ci` (instala exactamente las versiones del `package-lock.json` sin modificarlo; `npm install` puede reescribirlo y hacer que el siguiente `git pull` falle). Si `git pull` dice que tus cambios locales en `package-lock.json` se sobrescribirían, descártalos con `git checkout -- package-lock.json` (npm los regenera; no pierdes nada) y repite `git pull`. Si tenías `agentrelay watch` abierto, ciérralo (Ctrl+C) y vuelve a lanzarlo para que use el código nuevo. No hace falta repetir `init` ni `setup`, salvo que el CHANGELOG lo indique.

## Probar AgentRelay en 5 minutos

El repositorio incluye un pequeño proyecto de demostración (`examples/demo`) y una tarea para él (`examples/demo-task.json`): añadir una función `slugify` con sus tests. Con el ejecutor por defecto (Codex y GPT-6 Luna, plan gratuito de ChatGPT) no tiene coste por token.

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

Verás en directo cada paso del ejecutor, con la hora de cada línea y las acciones resumidas en lenguaje claro:

```
12:00:00  ▶ Ejecución 20261001-100000-ab12 · nivel 3 (equilibrado)
  Añadir una función slugify con sus tests

12:00:00  ▶ Intento 1 (implementación) · gpt-6-luna
12:00:07    · lee src/text.js
12:00:18    ✎ edita: src/text.js
12:00:20    · ejecuta los tests
12:00:22    · tokens: 39,1 mil entrada · 1,3 mil salida
12:00:23  ✔ Intento 1 completado en 23 s (done)
12:00:23    · validando…
12:00:26    · validación `npm test`: correcta
12:00:26  ■ Listo para tu revisión (el nivel 3 revisa siempre)
  Siguiente paso: agentrelay review 20261001-100000-ab12 --decision accept|fix|escalate|reject
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

- `agentrelay run` y `agentrelay review` muestran la actividad por la salida de error mientras ocurre (fases, archivos que lee o edita el ejecutor, lo que ejecuta, su razonamiento resumido, tokens, coste y validaciones), con la hora local de cada línea. Usa colores si la terminal lo admite; se desactivan con la variable de entorno `NO_COLOR` o al redirigir la salida a un archivo. `--quiet` la desactiva.
- `agentrelay watch` sigue desde **otro terminal** las ejecuciones que lance otro proceso, por ejemplo un orquestador como Claude Code. Sin id sigue la más reciente y salta a cada ejecución nueva hasta que pulses Ctrl+C; con un id muestra esa ejecución y termina cuando deja de estar en curso.

En VS Code: abre un terminal dividido, ejecuta `agentrelay watch` en uno y trabaja en el otro o en el chat del orquestador.

Comprueba el entorno desde el repositorio en el que vas a trabajar:

```sh
agentrelay doctor
```

Prepara tu orquestador una sola vez:

```sh
agentrelay setup
```

## Uso

**Quién escribe qué.** En el uso normal tú conversas con tu orquestador (por ejemplo, Claude Code en VS Code) y le pides el trabajo en lenguaje natural; es el orquestador quien redacta la tarea en JSON y ejecuta `agentrelay`. Para que sepa hacerlo, ejecuta una vez `agentrelay setup` y, en cada proyecto, `agentrelay init` (ver [«Preparar el orquestador y los proyectos»](#preparar-el-orquestador-y-los-proyectos)). Los pasos de abajo describen lo que ocurre por debajo y sirven también para usar AgentRelay a mano, por ejemplo para probarlo.

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

Otros comandos: `agentrelay list`, `agentrelay watch [id]`, `agentrelay check [id]`, `agentrelay setup` y `agentrelay init` (ver más abajo).

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

Toda la configuración se puede hacer en archivos de texto con **comentarios** (`//` y `/* */`) y comas finales (JSON con comentarios). Hay tres sitios, de menor a mayor prioridad:

| Archivo | Para qué |
|---|---|
| `~/.agentrelay/config.json` (o `AGENTRELAY_HOME/config.json`) | **Tus ajustes personales**, válidos en todos los proyectos: ejecutor, modelo, esfuerzo de razonamiento (`thinking`), nivel, tiempos. |
| `agentrelay.config.json` en la raíz del repositorio (opcional) | Lo propio del proyecto: comandos de validación, política, nivel. Se puede versionar. |
| `agentrelay.config.local.json` (opcional) | Ajustes locales del proyecto que no deben versionarse. |

Las opciones de línea de comandos tienen prioridad sobre todos.

```sh
agentrelay config init            # crea tu archivo personal, explicado opción por opción
agentrelay config init --project  # crea el del proyecto
agentrelay config                 # muestra la configuración efectiva y de dónde viene cada valor
agentrelay config path            # muestra dónde están los archivos y cuáles existen
```

El archivo creado por `config init` contiene **todas las opciones comentadas** con su explicación, valores válidos y valor por defecto: descomenta solo lo que quieras cambiar, y lo que dejes comentado seguirá el valor por defecto aunque este cambie en futuras versiones. AgentRelay valida los valores con mensajes claros y avisa de las erratas («¿quisiste decir `model`?»).

Valores por defecto:

```json
{
  "level": 3,
  "executor": {
    "type": "codex",
    "command": "codex",
    "provider": null,
    "model": "gpt-6-luna",
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

- `executor.type`: `codex` (por defecto) o `cline`. Al elegir uno, `command`, `provider` y `model` toman sus valores por defecto (con `cline`: `cline`, `deepseek`, `deepseek-v4-pro`), que puedes sobrescribir.
- `executor.command`: programa a ejecutar; también admite un array, p. ej. `["node", "/ruta/a/cline"]`.
- `executor.thinking`: `none`, `low`, `medium`, `high` o `xhigh`; `null` usa el valor del proveedor.
- `validation.commands`: comandos que se ejecutan en todas las tareas, además de los de la tarea.
- `policy`: sustituye valores del nivel, p. ej. `{ "maxRetries": 3, "review": "selective", "selfReview": { "normal": "pass" } }`.

Las credenciales no se guardan en la configuración de AgentRelay: las gestiona el ejecutor.

### Usar Codex (cuenta de ChatGPT)

Es el ejecutor por defecto y trabaja con la sesión de tu cuenta de ChatGPT, sin API de pago por uso. AgentRelay usa la copia instalada con él (`@openai/codex`) y, si no existe, busca una en el `PATH` y, por último, la que incluye la extensión de OpenAI para VS Code. Conecta tu cuenta una vez con `agentrelay login`. Para usar otro modelo de los que ofrezca tu cuenta, cámbialo en `agentrelay.config.local.json`:

```json
{ "executor": { "model": "gpt-5.5" } }
```

Los modelos disponibles dependen de tu cuenta; `agentrelay doctor` muestra el ejecutor, el modelo y la sesión. Codex trabaja en su sandbox `workspace-write`: puede escribir en el repositorio, pero no fuera de él. Para usar Cline, pon `"type": "cline"`.

## Preparar el orquestador y los proyectos

AgentRelay puede dejar listas las instrucciones que necesita el orquestador, sin pegar nada a mano en cada proyecto. Hoy está pensado para Claude Code.

**Una sola vez, al instalar:**

```sh
agentrelay setup
```

Añade, tras pedir confirmación, un bloque delimitado con marcas `<!-- agentrelay:start -->` … `<!-- agentrelay:end -->` al archivo de instrucciones global de Claude Code (`~/.claude/CLAUDE.md`). Así, en cualquier proyecto, Claude sabe que puede delegar con AgentRelay y que debe preparar el proyecto con `agentrelay init` si hace falta. Solo toca lo que hay entre las marcas y se puede retirar con `agentrelay setup --uninstall`. Sin terminal interactivo, añade `--yes`.

**En cada proyecto:**

```sh
agentrelay init
```

- Añade al `CLAUDE.md` del proyecto el bloque con las instrucciones de delegación. Si el archivo no existe lo crea; si existe, añade el bloque al final sin tocar nada más, y al repetirlo solo actualiza lo que hay entre las marcas. Puedes añadir tus propias instrucciones en el mismo archivo.
- Si el repositorio estaba limpio, ofrece confirmar solo ese archivo con un commit (AgentRelay necesita el repositorio sin cambios pendientes para delegar).
- Si la carpeta **no es un repositorio git**, lo prepara: muestra qué hará y qué archivos entrarán, y tras tu confirmación ejecuta `git init`, crea un `.gitignore` con patrones de secretos (`.env`, claves, `wp-config.php`…) si no existía y hace un primer commit. Nunca modifica un `.gitignore` existente ni hace push. Avisa si la carpeta parece servida públicamente por un servidor web (`/var/www`, `public_html`…), porque `.agentrelay/` no debe quedar accesible desde Internet.
- `--with-config` crea además `agentrelay.config.json`.

Claude puede ejecutar `agentrelay init` por ti cuando detecta que el proyecto no está preparado; si no hay terminal interactivo, necesita `--yes` (te pedirá confirmación antes en la conversación).

Nota: `CLAUDE.md` suele versionarse. Si el repositorio es público, el bloque de AgentRelay será visible en él.

Para ver en directo lo que hace el ejecutor mientras hablas con el orquestador, deja `agentrelay watch` abierto en un terminal de VS Code.

## Archivos que genera

Cada ejecución se guarda en `.agentrelay/runs/<id>/` dentro del repositorio: tarea, estado, prompts enviados, salida del ejecutor (NDJSON), eventos (`events.ndjson`), `diff.patch` y `report.md`. El directorio `.agentrelay/` se ignora a sí mismo y no aparece en `git status`.

## Consumo y costes

Por cada intento se registran tokens, duración y el **coste estimado que informa el ejecutor** (Cline lo calcula con sus tablas de precios; Codex no informa de coste y se registran solo los tokens). No es una factura: consulta el consumo real en tu proveedor. AgentRelay no puede medir el consumo del orquestador.

Ten en cuenta que el acceso por API de pago por uso y las suscripciones son cosas distintas: el ejecutor necesita un acceso que su CLI soporte.

## Seguridad

- El ejecutor trabaja con **aprobación automática de herramientas** dentro del repositorio: puede editar archivos y ejecutar comandos. Úsalo en repositorios que controles.
- AgentRelay no hace commits, stash, checkout ni push, y no toca el índice de git.
- Por defecto se niega a delegar sobre un repositorio con cambios sin confirmar.
- Detecta si el ejecutor crea commits o modifica archivos protegidos.

## Limitaciones de la versión 0.0.2

- Dos ejecutores: Codex CLI (incluido, por defecto) y Cline CLI (opcional). Codex se ha probado solo en Windows. Las tareas se ejecutan de una en una.
- Todavía no hay panel en VS Code: se usa desde el terminal (está en la hoja de ruta).
- El informe estructurado del ejecutor depende de que el modelo lo devuelva; si no lo hace, se muestra su texto final. Los datos objetivos (diff, validaciones) los calcula siempre AgentRelay.
- La self-review en pasada separada empieza una sesión nueva del ejecutor.
- Validado en Windows; Linux está probado en Debian con Node 20 (el ejecutor Codex, solo en Windows por ahora). **macOS no está probado: no tenemos ningún Mac.** Si lo usas en macOS, te agradeceremos mucho tu experiencia: abre una [incidencia en GitHub](https://github.com/catlinux/AgentRelay/issues) contando si funcionó o qué falló, e indica tu versión de macOS, tu versión de Node (`node --version`) y la salida de `agentrelay doctor`.

Consulta [TODO.md](TODO.md) y [CHANGELOG.md](CHANGELOG.md).

## Desarrollo

```sh
npm test
```

Los tests usan un simulador del ejecutor y no llaman a ningún modelo.

La **integración continua** (GitHub Actions, carpeta `.github/workflows/`) instala AgentRelay con `npm ci` y ejecuta los tests en Windows, Linux (x64 y arm64, y varias distribuciones) y macOS (Apple Silicon e Intel) con Node 20, 22, 24 y la última versión. No puede comprobar el inicio de sesión de ChatGPT ni una delegación real, que requieren una cuenta.

## Créditos y licencia

**AgentRelay** está desarrollado y mantenido por **CatLinux**.
Copyright (C) 2026 CatLinux.

Licencia [WNCL-CU-1.0](LICENSE): puedes usarlo gratis para cualquier fin, también comercial, y modificarlo y compartirlo sin coste. Nadie puede cobrar por el software ni por su uso; solo se pueden cobrar servicios de soporte e implementación.

Las copias y los forks deben conservar esta atribución y enlazar a https://github.com/catlinux/AgentRelay.

### Material de terceros

| Componente | Autor | Licencia | Enlace |
| --- | --- | --- | --- |
| Cline CLI (ejecutor opcional; se instala con `agentrelay executors add cline`) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
| Codex CLI (dependencia npm, no incluida en el repositorio) | OpenAI | Apache-2.0 | https://github.com/openai/codex |
