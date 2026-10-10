# Manual de uso de AgentRelay

[Volver al README](../README.md) · [Instalación](../INSTALL.md)

**Idea básica:** hablas con tu orquestador (por ejemplo, Claude Code) como siempre. Él piensa y revisa; AgentRelay pasa el trabajo de escribir código a una IA más barata, el **ejecutor**. Casi nunca tendrás que escribir comandos: el orquestador los usa por ti.

> En Windows (PowerShell o cmd) escribe `agentrelay.cmd` en lugar de `agentrelay`.

## 1. Los comandos: iguales en el terminal y en el chat

Cada comando se llama igual en los dos sitios y admite los mismos argumentos. En el chat de Claude Code solo hay que añadir `/ar:` delante: `agentrelay use opencode` ↔ `/ar:use opencode`. Escribe `/ar` y aparecen con autocompletado. `agentrelay help <comando>` (o `/ar:help <comando>`) explica cualquiera con opciones y ejemplos.

| Comando | Qué hace |
|---|---|
| `setup` | Instala las instrucciones globales, los comandos `/ar:` y el hook de Claude Code (una vez por equipo). |
| `start` | Prepara el proyecto y comprueba que todo funciona. |
| `init` | Añade las instrucciones de AgentRelay al proyecto (y el repositorio git si falta). |
| `use` | Cambia de IA (ejecutor, modelo, esfuerzo) o aplica un perfil. `use --list` lista todos los modelos. |
| `rank` | Muestra el ranquing de modelos gratuitos de OpenCode; `--run` lo calcula; `--detach` lo lanza en segundo plano. |
| `status` | En qué punto está el proyecto y qué hacer ahora. |
| `list` · `show [id]` | Tareas delegadas y el informe de una. |
| `review <id> --decision …` | Acepta, corrige, escala o rechaza una tarea. |
| `run <tarea.json>` | Delega una tarea a mano. |
| `check [id]` · `recover [id]` | Repite las validaciones · recupera tareas interrumpidas. |
| `doctor [--fix]` | Diagnostica el entorno y arregla lo seguro. |
| `login` · `login opencode` · `login --api` | Conecta tu cuenta de ChatGPT; `login opencode` conecta OpenCode; `login --api` guarda el respaldo por API de pago de Luna. |
| `config` · `set` · `unset` | Ver o cambiar ajustes sueltos. |
| `executors add\|check` | Instala un ejecutor opcional · actualiza el ranquing y el informe diario. |
| `update [--yes]` | Actualiza AgentRelay. |
| `help [comando]` | Ayuda. |

Solo en el terminal: `watch` (sigue en directo lo que hace el ejecutor; en el chat no se puede seguir en directo) y `hook` (uso interno de Claude Code). En el chat, los comandos que cambian algo (`setup`, `init`, `start`, `update`) explican qué harían y se aplican añadiendo `--yes`.

## 2. Empezar

**Una vez, después de instalar** ([INSTALL.md](../INSTALL.md)):

```sh
agentrelay setup
```

**En cada proyecto**, en su carpeta:

```sh
agentrelay start
```

Prepara la carpeta (git y las instrucciones para el orquestador), deja el repositorio limpio con un commit si hace falta, comprueba que todo funciona y te da un mensaje para pegar en el chat del orquestador. Después pídele el trabajo en lenguaje normal: «Añade un formulario de contacto con validación».

Las instrucciones de `setup` solo se cargan en **sesiones nuevas** de Claude Code: tras instalar, ciérralo y ábrelo de nuevo. En otra terminal, `agentrelay watch` te deja ver trabajar al ejecutor.

## 3. Cambiar de IA

```sh
agentrelay use                       # interactivo: te pregunta con números
agentrelay use opencode              # directo: ejecutor (con su modelo por defecto)
agentrelay use codex gpt-5.5 alto    # ejecutor, modelo y esfuerzo, en cualquier orden
agentrelay use bajo                  # solo el esfuerzo
agentrelay use --list                # todos los modelos, con el esfuerzo que admite cada uno
```

Esfuerzos: `bajo`, `medio`, `alto`, `extremo`, `máximo` (o `low`, `medium`, `high`, `xhigh`, `max`). Usa el más bajo que funcione: gasta menos.

**Perfiles:** `agentrelay use --save gratis` guarda la combinación actual; `agentrelay use gratis` la aplica.

**Solo para este proyecto:** añade `--local` (`agentrelay use --local opencode`). Se guarda en `agentrelay.config.json` del proyecto y tiene prioridad sobre tu ajuste general. Si el proyecto ya fija un ajuste que acabas de cambiar, `use` te avisa de que no tendrá efecto allí.

| Ejecutor | Qué necesita | Cómo se conecta |
|---|---|---|
| `codex` (por defecto) | Cuenta de ChatGPT (vale la gratuita) o clave de API de OpenAI. Viene incluido. | `agentrelay login` |
| `opencode` | Modelos gratuitos y de pago de OpenCode Zen, NVIDIA, Google, Mistral, OpenRouter, Z.AI y DeepSeek. Se instala con `agentrelay executors add opencode`. | `agentrelay login opencode` (abre el asistente de OpenCode para elegir proveedor; también puedes conectar con su variable de entorno) |

AgentRelay comprueba antes de cada tarea que el modelo existe para el ejecutor elegido (`agentrelay doctor` también): así un modelo de DeepSeek con Codex falla al instante con un mensaje claro y no gasta intentos.

### Luna: cuota gratuita y respaldo por API de pago

Luna (Codex) gasta la cuota gratuita de tu cuenta de ChatGPT. Para no quedarte parado cuando se agota, puedes guardar una clave de API de OpenAI como **respaldo**:

```sh
agentrelay login --api          # pega tu clave (no se muestra); o: printenv OPENAI_API_KEY | agentrelay login --api
agentrelay login --api --remove # quita el respaldo
```

La clave se guarda en un perfil propio de AgentRelay (`~/.agentrelay/codex-api/`): **tu sesión de ChatGPT no se toca**. Después funciona sola:

- Cada tarea prueba **primero la cuota gratuita**. Solo si se agota (el error de límite de uso de ChatGPT) repite ese intento con la API de pago y lo avisa en el informe.
- Lee del error la hora de restablecimiento y guarda en `model-checks.json` cuándo se agotó y cuándo se restableció. Mientras no llegue esa hora usa la API; al llegar, **vuelve a la gratuita** sin que hagas nada. Si el error no da la hora, la vuelve a probar cada 10 minutos.
- `agentrelay doctor` muestra si el respaldo está configurado y, si la cuota está agotada, hasta cuándo. Sin respaldo no cambia nada: el aviso de cuota te propone alternativas.
- Se desactiva con `agentrelay set executor.apiFallback false --local`. Con el enrutado automático no se usa este respaldo: Luna por API ya está en la lista. Solo se gasta dinero si tú has guardado la clave.

### Acceso a internet del ejecutor
Los ejecutores pueden consultar páginas y APIs (por ejemplo, extraer datos de Wowhead). Codex corre en un sandbox que por defecto tiene la red cerrada: AgentRelay la abre con `sandbox_workspace_write.network_access=true`. OpenCode no tiene sandbox y no necesita nada. Se desactiva con `agentrelay set executor.network false`.

- En Windows, dentro del sandbox de Codex fallan `curl`, `curl.exe` e `Invoke-WebRequest` (error TLS de schannel): el ejecutor recibe la regla de usar Node (`fetch`). Si escribes la tarea a mano, indícale el script en Node y los campos que quieres.
- Wowhead: `https://nether.wowhead.com/tooltip/item/<id>` devuelve JSON (también `spell`, `npc`, `quest`…). Las páginas normales responden a peticiones simples, pero un navegador automatizado (Playwright) recibe un 403: no hace falta navegador.
- Comprobado con Luna y con OpenCode/DeepSeek en Windows. En Linux no está comprobado todavía.

### Proveedores y modelos gratuitos de OpenCode
`agentrelay providers` (o `/ar:providers`) muestra si cada proveedor está conectado, su nivel, los límites conocidos y un aviso de privacidad. Solo informa: no bloquea. La lista incluye OpenCode Zen, NVIDIA, Google, Mistral, OpenRouter y Z.AI (gratuitos), y DeepSeek (de pago). Límites conocidos: NVIDIA, unas 40 peticiones/min; modelos `:free` de OpenRouter, unas 50/día. Groq se descartó: su plan gratuito admite menos tokens por minuto (hasta 8.000) de los que ocupa el prompt de un agente (~8.500). Google puede usar los prompts para entrenar; la política de datos de los demás no está verificada.

Conecta un proveedor con `agentrelay login opencode` y elige uno en el asistente de OpenCode, o configura su variable de entorno (por ejemplo, `MISTRAL_API_KEY`). AgentRelay no guarda esas claves. Si el ejecutor es OpenCode, `agentrelay doctor` muestra los proveedores conectados.

La lista se mantiene al día así:

- Metadatos de [models.dev](https://models.dev) (precio, herramientas y contexto) en caché durante 24 horas. En cada evaluación se lee la lista real de tu cuenta (`opencode models`), así los modelos retirados salen del ranquing.
- Una vez al día, en segundo plano al primer `run` o `start`, se evalúan todos los proveedores conectados. `agentrelay rank --run` inicia la evaluación manualmente. Cada modelo se vuelve a evaluar tras 7 días; `--force` lo repite antes. Los errores 410/404 indican que el modelo ya no está disponible.
- Solo se envían tareas de ejemplo, nunca tu código. Desactiva la evaluación con `AGENTRELAY_NO_MODEL_CHECK=1`.

Se prueban solo modelos gratuitos que admiten herramientas y tienen al menos 64k de contexto: tres tareas (fácil, media y difícil; esta última usa varios archivos y un test que arreglar). Apto significa superar las pruebas media y difícil. Nivel A: apto y cada prueba dura 150 s o menos; nivel B: apto y más lento. `--max N` limita cuántos se prueban por proveedor y las pruebas se intercalan entre proveedores. Las revisiones desempatan la nota: `agentrelay review` suma con `accept` y resta con `fix`, `reject` o `escalate`. `agentrelay rank` muestra las columnas Prueba 1-3 y Nivel.

La cuota no se puede consultar. Cuando un modelo indica que se agotó, queda marcado hasta la hora indicada por el error; si no da una hora, se reintenta a los 10, 30 y 60 minutos. Un éxito restablece la marca.

### Enrutado automático
Está desactivado por defecto (`routing.mode: "off"`): se usa siempre el ejecutor configurado. Actívalo con `agentrelay set routing auto` (o `--local` para un proyecto). Cada tarea empieza por el primer candidato disponible, en este orden:

1. Luna con la cuota gratuita de ChatGPT. Si Codex usa una clave de API en vez de la cuenta de ChatGPT, se omite porque es de pago.
2. Modelos gratuitos aptos del ranquing. Con esfuerzo alto o extremo, solo se consideran los de nivel A.
3. Modelos de pago de `routing.paidOrder`, por defecto DeepSeek Flash → Luna por API (`agentrelay login --api`) → DeepSeek Pro. No hay tope de gasto.

Si durante una tarea se agota la cuota, faltan credenciales o el modelo ya no existe, continúa con el siguiente candidato sobre el mismo árbol de trabajo, sin gastar reintentos y hasta `routing.maxSwitches` veces (5 por defecto). Cada tarea nueva empieza de nuevo por arriba y vuelve a los gratuitos cuando estén disponibles. `agentrelay watch` muestra los cambios (⇄); el informe incluye la sección «Enrutado» con los cambios, si hubo gasto y el aviso de privacidad. Una tarea que fija `model` no se enruta.

## 4. Revisar y decidir

Normalmente lo hace el orquestador, pero puedes hacerlo tú:

```sh
agentrelay list                     # tareas y su estado
agentrelay show                     # informe de la última (diff, pruebas, informe del ejecutor)
agentrelay review <id> --decision accept                           # vale (repite las pruebas antes)
agentrelay review <id> --decision fix --feedback "falta el caso vacío"
agentrelay review <id> --decision escalate                         # lo hará el orquestador
agentrelay review <id> --decision reject                           # descartar
```

AgentRelay **nunca** hace commits ni push: los cambios quedan en tu carpeta. Si el ejecutor no devuelve su informe estructurado, o cambia archivos que no declaró, el informe lo avisa arriba.

`agentrelay status` resume rama, IA en uso, tareas por revisar y **qué hacer ahora**; se guarda también en `.agentrelay/ESTADO.md`, que el orquestador lee al empezar.

## 5. Cuando algo falla

**Primer paso siempre:** `agentrelay doctor` (`--fix` aplica los arreglos seguros, preguntando antes de cada uno).

| Problema | Solución |
|---|---|
| «no es un repositorio git» | `agentrelay start` (o `init`) |
| «No hay sesión» de Codex | `agentrelay login` (sin navegador: `login --device`) |
| El repositorio tiene cambios sin confirmar | Haz commit antes de delegar |
| El modelo «X» no está disponible para el ejecutor Y | Mira de dónde sale con `agentrelay config` y cámbialo con `agentrelay use` |
| Tarea colgada (`running (¿interrumpida?)`) | `agentrelay recover` y `recover <id>` |
| Instrucciones desactualizadas tras actualizar | `agentrelay setup` y, en el proyecto, `agentrelay init` |
| En Windows, errores de `sed`, `dirname` o `uname` | Usa `agentrelay.cmd` |
| Ejecutor no instalado | `agentrelay executors add <nombre>` |
| El ejecutor no puede acceder a internet | Comprueba `executor.network` (debe ser `true`); en Windows pídele Node `fetch`, no `curl` |
| Codex falla en Windows con «apply deny-read ACLs» | Añade `-c windows.sandbox=unelevated` a `executor.extraArgs` |

Con una clave de API en Codex se **sustituye la sesión de ChatGPT**: para volver a la cuenta, `agentrelay login`.

## 6. Delegar a mano (sin orquestador)

Útil para probar. Escribe la tarea en un JSON y lánzala con `agentrelay run tarea.json`:

```json
{
  "objective": "Añade y exporta slugify(text) en src/text.js.",
  "files": ["src/text.js", "test/text.test.js"],
  "acceptanceCriteria": ["slugify('Hola Mundo') devuelve 'hola-mundo'"],
  "validation": ["npm test"],
  "doNotModify": ["package.json"]
}
```

| Campo | Para qué |
|---|---|
| `objective` | **Obligatorio.** Qué hay que conseguir. |
| `context` | Lo que el ejecutor debe saber: tecnología, convenciones, decisiones tomadas. |
| `files` · `doNotModify` | Archivos que puede tocar · prohibidos (si acaba en `/`, una carpeta). |
| `constraints` · `acceptanceCriteria` | Restricciones · cómo saber que está bien. |
| `validation` | Comandos que comprueban el resultado (`npm test`…). |
| `complexity` | `trivial`, `normal` (por defecto) o `complex`. |
| `effort` · `model` | Opcionales: esfuerzo y modelo solo para esta tarea. |

Prueba completa con el proyecto de ejemplo: [examples/demo](../examples/demo) y [examples/demo-task.json](../examples/demo-task.json). Si algo falla, el ejecutor recibe los errores y lo corrige solo, hasta 2 veces; después la tarea pasa al orquestador.

## 7. Configuración

`agentrelay use` cubre lo habitual. Para el resto: `agentrelay config` (valores en uso y de qué archivo sale cada uno), `config path`, `config init`.

| Archivo | Para qué |
|---|---|
| `~/.agentrelay/config.json` | Tus ajustes generales y tus perfiles. |
| `agentrelay.config.json` (en el proyecto) | Lo que cambia solo en ese proyecto. Se añade a `.gitignore`. |

Admiten comentarios `//`. Los más útiles: `executor.timeoutSeconds` (por defecto 1200 s) y `validation.commands` (comandos que se ejecutan en todas las tareas, por ejemplo `["npm test"]`). Opciones comunes de casi todos los comandos: `-q`, `-v`, `--json`.
