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
| `login` | Conecta tu cuenta de ChatGPT. |
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
| `opencode` | Modelos gratuitos y de pago de OpenCode. Se instala con `agentrelay executors add opencode`. | `opencode auth login` |
| `cline` | Una clave de API, por ejemplo de DeepSeek. Se instala con `agentrelay executors add cline`. | El comando que muestra al instalarlo |

AgentRelay comprueba antes de cada tarea que el modelo existe para el ejecutor elegido (`agentrelay doctor` también): así un modelo de DeepSeek con Codex falla al instante con un mensaje claro y no gasta intentos.

### Modelos gratuitos de OpenCode

Cambian a menudo, así que AgentRelay los vigila por ti. **El primer uso de cada día** (`run` o `start`), en segundo plano, prueba con dos tareas de ejemplo los modelos gratuitos que tu cuenta lista, los ordena de mejor a peor y escribe `.agentrelay/EJECUTORES.md` (saldos, estado de cada IA y los mejores gratuitos de hoy). Solo se envía una tarea de ejemplo, nunca tu código.

- `agentrelay use` y `use --list` muestran esos gratuitos **en orden** y con su tiempo; los que fallaron no aparecen (`--all` los muestra todos).
- Los gratuitos se detectan con los precios de [models.dev](https://models.dev), la misma fuente que usa OpenCode, así que también salen los que no llevan `-free` en el nombre.
- La cuota restante no se puede consultar: se deduce de las pruebas. Si una tarea real se queda sin cuota con un modelo, queda marcado como agotado hasta mañana y el aviso te propone los siguientes del ranquing. **Nunca se cambia de modelo solo.**
- `agentrelay rank` enseña el último ranquing; `rank --run` lo recalcula (también los modelos que models.dev da por gratuitos aunque tu cuenta no los liste, que salen como «no disponible»).
- Saldos: DeepSeek se consulta si defines `DEEPSEEK_API_KEY` (AgentRelay solo la lee de ahí); OpenAI no ofrece ninguna API de saldo, así que el informe enlaza a su panel.
- Se desactiva con la variable de entorno `AGENTRELAY_NO_MODEL_CHECK=1`.

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
