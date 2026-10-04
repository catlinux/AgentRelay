# Manual de uso de AgentRelay

[Volver al README](../README.md) · [Instalación](../INSTALL.md)

Este manual explica cómo usar AgentRelay día a día, con ejemplos. Cada apartado responde a la pregunta «quiero hacer X».

**Idea básica:** hablas con tu orquestador (por ejemplo, Claude Code) como siempre. El orquestador piensa y revisa, y AgentRelay le pasa el trabajo de escribir código a una IA más barata (el **ejecutor**). Casi nunca tendrás que escribir comandos de `agentrelay` tú: los lanza el orquestador. Este manual sirve para lo que sí haces tú: preparar, elegir la IA y vigilar.

> En Windows (PowerShell o cmd) escribe `agentrelay.cmd` en lugar de `agentrelay`.

## Índice

1. [Empezar en un proyecto](#1-empezar-en-un-proyecto)
2. [Cambiar de IA](#2-cambiar-de-ia)
3. [Ver qué hace el ejecutor](#3-ver-qué-hace-el-ejecutor)
4. [Revisar y decidir](#4-revisar-y-decidir)
5. [Saber en qué punto está el proyecto](#5-saber-en-qué-punto-está-el-proyecto)
6. [Comandos en el chat de Claude Code](#6-comandos-en-el-chat-de-claude-code)
7. [Cuando algo falla](#7-cuando-algo-falla)
8. [Delegar a mano (sin orquestador)](#8-delegar-a-mano-sin-orquestador)
9. [Configuración](#9-configuración)
10. [Chuleta de comandos](#10-chuleta-de-comandos)

---

## 1. Empezar en un proyecto

**Una sola vez, después de instalar** (ver [INSTALL.md](../INSTALL.md)):

```sh
agentrelay setup
```

Enseña a Claude Code a delegar con AgentRelay en cualquier proyecto e instala los comandos `/ar:…` del chat. Te ofrece también conectar tu cuenta de ChatGPT.

**En cada proyecto** (en su carpeta):

```sh
agentrelay start
```

Hace todo lo necesario, preguntando antes de cambiar nada:

1. Prepara la carpeta: crea el repositorio git si no existe y añade las instrucciones para el orquestador (`AGENTS.md` y `CLAUDE.md`).
2. Deja el repositorio limpio con un commit, si hace falta.
3. Comprueba que todo funciona (como `agentrelay doctor`).
4. Te dice qué hacer ahora y te da un mensaje para pegar en el chat del orquestador.

Ejemplo:

```sh
cd ~/proyectos/mi-web
agentrelay start
```

Después, abre el chat de tu orquestador en esa carpeta y pídele el trabajo en lenguaje normal: «Añade un formulario de contacto con validación».

## 2. Cambiar de IA

Un solo comando: `agentrelay use`.

**Interactivo** (te pregunta todo con números):

```sh
agentrelay use
```

```
En uso: codex · gpt-6-luna · esfuerzo por defecto

¿Qué ejecutor?
   1) Codex (OpenAI)  ← en uso
   2) Cline  (no instalado)
   3) OpenCode
Elige un número (Enter = sin cambios): 3
¿Qué modelo?
   1) opencode/nemotron-3-ultra-free
   2) opencode/mimo-v2.6-flash-free
   …
¿Qué esfuerzo de razonamiento?
   1) por defecto
   2) bajo
   3) medio
   4) alto
✔ Ahora: opencode · opencode/nemotron-3-ultra-free · esfuerzo alto
¿Guardarlo como perfil? Escribe un nombre (Enter = no): gratis
```

**Directo** (ejecutor, modelo y esfuerzo, en cualquier orden; pon solo lo que quieras cambiar):

```sh
agentrelay use opencode                    # cambia de ejecutor (con su modelo por defecto)
agentrelay use codex gpt-5.5               # ejecutor y modelo
agentrelay use codex alto                  # ejecutor y esfuerzo
agentrelay use bajo                        # solo el esfuerzo
agentrelay use gpt-6-luna                  # solo el modelo
agentrelay use codex defecto               # vuelve al esfuerzo por defecto
```

Esfuerzos: `bajo`, `medio`, `alto`, `extremo`, `máximo` (o en inglés: `low`, `medium`, `high`, `xhigh`, `max`). Usa el más bajo que funcione: gasta menos.

**Ver todos los modelos** de todos los ejecutores, con el esfuerzo que admite cada uno:

```sh
agentrelay use --list
```

```
Codex (OpenAI) (codex) · instalado · cuenta de ChatGPT · en uso
  ● gpt-6-luna  bajo* medio alto extremo máximo
    gpt-5.5     medio* alto
OpenCode (opencode) · no instalado · gratis
    (instálalo con: opencode auth login)
Cline (cline) · no instalado · clave de API
    (instálalo con: agentrelay executors add cline)
```

`●` marca el modelo en uso y `*`, el esfuerzo por defecto. En el chat: `/ar:usar --list`.

**Perfiles** (guarda tus combinaciones favoritas con un nombre):

```sh
agentrelay use opencode bajo
agentrelay use --save gratis      # guarda lo actual como «gratis»

agentrelay use codex alto
agentrelay use --save bueno       # guarda lo actual como «bueno»

agentrelay use gratis             # cambia a la combinación «gratis»
agentrelay use bueno              # y vuelve a «bueno»
```

**Ver qué está en uso:** `agentrelay use` fuera de un terminal interactivo (o `/ar:usar` en el chat) muestra el ejecutor, el modelo, el esfuerzo y tus perfiles.

**Ajustes sueltos** (poco frecuentes): `agentrelay set timeout 1800` y `agentrelay unset timeout`.

**Solo para este proyecto:** añade `--local` (`agentrelay use --local opencode`). Se guarda en `agentrelay.config.json` del proyecto y tiene prioridad sobre tu ajuste general.

**Los ejecutores:**

| Ejecutor | Qué necesita | Cómo se conecta |
|---|---|---|
| `codex` (por defecto) | Cuenta de ChatGPT (vale la gratuita). Viene incluido. | `agentrelay login` |
| `opencode` | Modelos gratuitos de OpenCode. Se instala aparte ([opencode.ai](https://opencode.ai)). | `opencode auth login` |
| `cline` | Una clave de API (por ejemplo, DeepSeek). `agentrelay use` ofrece instalarlo. | `npx cline auth …` (el comando exacto aparece al instalarlo) |

## 3. Ver qué hace el ejecutor

Abre **otro terminal** en la carpeta del proyecto y deja esto en marcha:

```sh
agentrelay watch
```

Verás en directo cada paso: qué archivos lee y edita, qué pruebas lanza y si pasan. Sigue automáticamente cada tarea nueva hasta que pulses Ctrl+C.

En VS Code: divide el terminal, ejecuta `agentrelay watch` en una mitad y trabaja en la otra o en el chat.

## 4. Revisar y decidir

Normalmente lo hace el orquestador, pero puedes hacerlo tú:

```sh
agentrelay list                  # todas las tareas y su estado
agentrelay show                  # informe de la última (diff, pruebas, informe del ejecutor)
agentrelay show 20261003-101500-ab12
```

Decidir sobre una tarea:

```sh
agentrelay review <id> --decision accept                          # vale (repite las pruebas antes)
agentrelay review <id> --decision fix --feedback "falta el caso vacío"   # que lo corrija
agentrelay review <id> --decision escalate                        # lo hará el orquestador
agentrelay review <id> --decision reject                          # descartar
```

AgentRelay **nunca** hace commits ni push: los cambios quedan en tu carpeta. Tras aceptar, el commit lo haces tú o el orquestador.

## 5. Saber en qué punto está el proyecto

```sh
agentrelay status
```

Resume: rama y cambios pendientes, IA en uso, tareas por revisar, últimos commits, pendientes del `TODO.md` y **qué hacer ahora**. El mismo resumen se guarda en `.agentrelay/ESTADO.md` y se actualiza solo; el orquestador lo lee al empezar, así que basta con decirle «continúa».

## 6. Comandos en el chat de Claude Code

`agentrelay setup` instala estos comandos. Escribe `/ar` en el chat y aparecen con autocompletado. Cambian la IA **del ejecutor**, no la de Claude (para eso está `/model` de Claude Code).

| En el chat | Qué hace |
|---|---|
| `/ar:estado` | Ejecutor, modelo, esfuerzo, sesión y avisos. |
| `/ar:usar` | Muestra la IA en uso y tus perfiles. |
| `/ar:usar opencode` | Cambia de ejecutor. |
| `/ar:usar codex alto` | Cambia ejecutor y esfuerzo. |
| `/ar:usar gratis` | Aplica el perfil «gratis». |

Estos comandos son para el chat. En el terminal se escribe `agentrelay use …`.

## 7. Cuando algo falla

**Primer paso siempre:**

```sh
agentrelay doctor
```

Comprueba Node, git, el ejecutor, la sesión y las instrucciones, y dice qué comando arregla cada cosa.

| Problema | Solución |
|---|---|
| «no es un repositorio git» | `agentrelay start` (o `agentrelay init`) |
| «No hay sesión» de Codex | `agentrelay login` (sin navegador: `agentrelay login --device`) |
| El repositorio tiene cambios sin confirmar | Haz commit antes de delegar: `git add -A && git commit -m "..."` |
| Una tarea se quedó colgada (`running (¿interrumpida?)`) | `agentrelay recover` lista las interrumpidas y `agentrelay recover <id>` la cierra |
| Instrucciones desactualizadas tras actualizar | `agentrelay setup` y, en el proyecto, `agentrelay init` |
| En Windows, errores de `sed`, `dirname` o `uname` | Usa `agentrelay.cmd` |
| Ejecutor no instalado | `agentrelay use` y elígelo: te ofrece instalarlo |

**Actualizar AgentRelay:**

```sh
agentrelay update
```

## 8. Delegar a mano (sin orquestador)

Útil para probar. Escribe la tarea en un archivo JSON:

```json
{
  "objective": "Añade y exporta slugify(text) en src/text.js.",
  "files": ["src/text.js", "test/text.test.js"],
  "acceptanceCriteria": ["slugify('Hola Mundo') devuelve 'hola-mundo'"],
  "validation": ["npm test"],
  "doNotModify": ["package.json"]
}
```

Y lánzala:

```sh
agentrelay run tarea.json
```

| Campo | Para qué |
|---|---|
| `objective` | **Obligatorio.** Qué hay que conseguir. |
| `context` | Lo que el ejecutor debe saber: tecnología, convenciones, decisiones ya tomadas. |
| `files` | Archivos que puede tocar. |
| `constraints` | Restricciones («no cambies la API pública»). |
| `acceptanceCriteria` | Cómo saber que está bien. |
| `validation` | Comandos que comprueban el resultado (`npm test`, `npm run lint`…). |
| `doNotModify` | Archivos prohibidos; si acaba en `/`, una carpeta entera. |
| `complexity` | `trivial`, `normal` (por defecto) o `complex`. |

Prueba completa con el proyecto de ejemplo: [examples/demo](../examples/demo) y [examples/demo-task.json](../examples/demo-task.json).

```sh
cp -r /ruta/a/AgentRelay/examples/demo ~/agentrelay-demo
cd ~/agentrelay-demo
git init && git add -A && git commit -m "demo"
agentrelay run /ruta/a/AgentRelay/examples/demo-task.json
```

Si algo falla, el ejecutor recibe los errores y lo corrige solo, hasta 2 veces. Después, la tarea pasa al orquestador.

## 9. Configuración

No hace falta tocar archivos: `agentrelay use` cubre lo habitual. Si quieres ver o ajustar el resto:

```sh
agentrelay config            # valores en uso y de qué archivo sale cada uno
agentrelay config path       # dónde están los archivos
agentrelay config init       # crea tu archivo, con cada opción explicada
```

Hay dos archivos:

| Archivo | Para qué |
|---|---|
| `~/.agentrelay/config.json` | Tus ajustes generales y tus perfiles. |
| `agentrelay.config.json` (en el proyecto) | Lo que cambia solo en ese proyecto. Se añade a `.gitignore`. |

Los dos admiten comentarios `//`. Las opciones más útiles:

- `executor.timeoutSeconds`: tiempo máximo de una tarea (por defecto, 1200 s).
- `validation.commands`: comandos que se ejecutan en todas las tareas del proyecto, por ejemplo `["npm test"]`.

## 10. Chuleta de comandos

| Quiero… | Comando |
|---|---|
| Preparar AgentRelay (una vez) | `agentrelay setup` |
| Empezar o continuar un proyecto | `agentrelay start` |
| Cambiar de IA | `agentrelay use` |
| Cambiar de IA directamente | `agentrelay use opencode` · `agentrelay use codex alto` |
| Guardar / usar un perfil | `agentrelay use --save gratis` · `agentrelay use gratis` |
| Ver al ejecutor trabajando | `agentrelay watch` |
| Ver el estado del proyecto | `agentrelay status` |
| Listar tareas | `agentrelay list` |
| Ver un informe | `agentrelay show [id]` |
| Aceptar o pedir corrección | `agentrelay review <id> --decision accept` · `… fix --feedback "…"` |
| Diagnosticar | `agentrelay doctor` |
| Conectar ChatGPT | `agentrelay login` |
| Actualizar | `agentrelay update` |
| Ayuda completa | `agentrelay --help` |

Opciones que valen en casi todos: `-q` (solo lo esencial), `-v` (más detalle), `--json` (salida para programas).
