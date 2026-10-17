# AgentRelay: todos los comandos

Referencia completa de los comandos de `agentrelay`, con ejemplos. Para entender qué es AgentRelay, lee antes la [guía corta](GUIA.md); el detalle de la configuración está en el [manual](MANUAL.md).

- **En Windows** (PowerShell o cmd) escribe `agentrelay.cmd` en lugar de `agentrelay`.
- **En el chat de Claude Code** cada comando tiene su versión `/ar:<comando>` con los mismos argumentos (salvo `watch`). Los que cambian algo (`setup`, `init`, `start`, `update`) piden `--yes` en el chat.
- **Ayuda en el terminal:** `agentrelay help <comando>` muestra lo mismo que este documento para un comando.

## Lo esencial en una tabla

| Quiero… | Comando |
|---|---|
| Dejar AgentRelay listo en un equipo nuevo | `agentrelay setup` |
| Actualizar AgentRelay | `agentrelay update --yes` |
| Conectar la cuenta de ChatGPT (Luna) | `agentrelay login` |
| Conectar la cuenta de Google (Antigravity) | `agentrelay login antigravity` |
| Saber cuánto me queda de cada IA gratuita | `agentrelay cuota` |
| Ver mis cuentas y cambiar de una a otra | `agentrelay cuenta` |
| Añadir otra cuenta de ChatGPT o de Google | `agentrelay cuenta nueva luna` · `agentrelay cuenta nueva gemini` |
| Que AgentRelay elija solo la IA (gratis primero) | `agentrelay set routing auto` |
| Ver en qué orden se prueban las IA | `agentrelay orden` |
| Usar siempre una IA concreta | `agentrelay use gemini` · `agentrelay use codex` |
| Comprobar que todo está bien | `agentrelay doctor` |
| Ver lo que hace el ejecutor en directo | `agentrelay watch` (en otra terminal) |

## Primeros pasos en un equipo

```sh
agentrelay setup              # instrucciones y comandos /ar: de Claude Code
agentrelay login              # cuenta de ChatGPT para Luna (se abre el navegador)
curl -fsSL https://antigravity.google/cli/install.sh | bash   # instala Antigravity (Linux y macOS)
agentrelay login antigravity  # cuenta de Google: elige «Google OAuth» y sal con /quit
agentrelay set routing auto   # cada tarea va a Luna; si se agota, a Antigravity; si también, a la de pago
agentrelay cuota              # comprueba cuánto queda
```

Después, en cada proyecto: `agentrelay start` (o pídeselo a Claude Code).

## Cómo funcionan las IA gratuitas

Con el enrutado activo (`routing auto`) cada tarea empieza por la primera IA disponible:

1. **Luna** con tu cuenta de ChatGPT (gratis, con una cuota que se renueva sola).
2. **Antigravity** con tu cuenta de Google (gratis, cuota semanal; Gemini y, en un cupo aparte, Claude y GPT).
3. **La IA de pago** (por defecto DeepSeek V4.1 Flash de OpenCode Go). Si también falla, la tarea se detiene y se te pregunta qué hacer.

`agentrelay cuota` dice en cualquier momento cuánto queda de cada una y cuándo se renueva, sin gastar peticiones. Si una cuenta se agota, puedes cambiar a otra con `agentrelay cuenta` (lista numerada: escribes el número). Cada cuenta lleva su propia cuota. Las sesiones de OpenCode nunca se tocan. Revisa las condiciones de OpenAI y Google antes de usar varias cuentas.

## Problemas habituales

| Mensaje | Qué hacer |
|---|---|
| «This client is no longer supported for Gemini Code Assist for individuals» | Google cerró Gemini CLI gratis para cuentas personales (junio de 2026); solo funciona con licencia de empresa. Usa Antigravity: `agentrelay login antigravity` |
| «Antigravity CLI no está instalado» | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` y abre una terminal nueva |
| «La sesión de Google … ha caducado» o `invalid_grant` | `agentrelay login gemini` y vuelve a entrar con Google |
| Gemini pregunta «Do you trust the files in this folder?» | Elige «Don't trust»: no hace falta para iniciar sesión |
| Luna: «agotada · se renueva …» | Espera a esa hora, usa otra cuenta (`agentrelay cuenta`) o deja que el enrutado pase a Antigravity |
| «sin sesión de ChatGPT» | `agentrelay login` |

---

## Empezar y mantener

### `agentrelay setup`

Instala las instrucciones globales y los comandos de Claude Code. En el chat de Claude Code: `/ar:setup`.

```
agentrelay setup [opciones]
```

Añade las instrucciones globales de AgentRelay a Claude Code y, por defecto, instala comandos y el hook de delegación. Ofrece conectar la cuenta de ChatGPT. También puede retirar la instalación o instalar ejecutores opcionales.

| Opción | Qué hace |
|---|---|
| `--uninstall` | Retira las instrucciones, comandos y hook de Claude Code. |
| `--no-commands` | No instala los comandos de Claude Code. |
| `--no-hook` | No instala el hook de delegación de Claude Code. |
| `--yes` | Aplica sin pedir confirmación. |
| `--login` | Conecta la cuenta de ChatGPT sin preguntar. |
| `--executors <lista>` | Instala ejecutores opcionales separados por comas. |
| `--claude-dir <dir>` | Indica el directorio .claude; por defecto, ~/.claude. |
| `--cwd <dir>` | Indica el directorio del proyecto al cargar la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay setup`: Instala las instrucciones y la integración predeterminada de Claude Code.
- `agentrelay setup --no-hook`: Instala sin añadir el hook de delegación.
- `agentrelay setup --uninstall --yes`: Retira la integración sin pedir confirmación.

### `agentrelay start`

Prepara el proyecto para trabajar con AgentRelay. En el chat de Claude Code: `/ar:start`.

```
agentrelay start [--yes] [--with-config] [--fix]
```

Prepara el repositorio, comprueba el entorno y muestra el estado y los siguientes pasos. Si hay cambios pendientes, puede pedir confirmación para crear un commit inicial.

| Opción | Qué hace |
|---|---|
| `--yes` | Aplica las acciones que normalmente requieren confirmación. |
| `--with-config` | Crea además agentrelay.config.json. |
| `--fix` | Pide aplicar los arreglos seguros que encuentre doctor. |
| `--cwd <dir>` | Indica el directorio del proyecto. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay start`: Prepara el proyecto y muestra los siguientes pasos.
- `agentrelay start --yes`: Prepara el proyecto aceptando las confirmaciones necesarias.

### `agentrelay init`

Prepara las instrucciones del proyecto y el repositorio git. En el chat de Claude Code: `/ar:init`.

```
agentrelay init [--yes] [--with-config]
```

Prepara el directorio actual o el repositorio existente con las instrucciones de AgentRelay. Si no hay repositorio, inicializa Git y crea un commit inicial; con with-config también crea la configuración del proyecto.

| Opción | Qué hace |
|---|---|
| `--yes` | Aplica sin pedir confirmación. |
| `--with-config` | Crea además agentrelay.config.json. |
| `--cwd <dir>` | Indica el directorio que se preparará. |

Ejemplos:

- `agentrelay init`: Prepara el directorio actual.
- `agentrelay init --yes --with-config`: Prepara el directorio y crea también la configuración.

### `agentrelay doctor`

Comprueba el entorno y puede aplicar arreglos seguros. En el chat de Claude Code: `/ar:doctor`.

```
agentrelay doctor [--fix]
```

Comprueba Node.js, Git, el repositorio, la configuración y el ejecutor. Con fix, pregunta antes de aplicar los arreglos seguros disponibles; yes evita la pregunta.

| Opción | Qué hace |
|---|---|
| `--fix` | Pregunta antes de aplicar arreglos seguros. |
| `--yes` | Con --fix, aplica los arreglos sin preguntar. |
| `--cwd <dir>` | Indica el directorio que se comprobará. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |
| `-q, --quiet` | Reduce la salida a errores y avisos. |
| `-v, --verbose` | Añade detalles para diagnosticar problemas. |

Ejemplos:

- `agentrelay doctor`: Comprueba el entorno.
- `agentrelay doctor --fix`: Comprueba el entorno y pregunta antes de arreglar problemas seguros.

### `agentrelay update`

Actualiza AgentRelay desde su repositorio de instalación. En el chat de Claude Code: `/ar:update`.

```
agentrelay update [--check] [--yes]
```

Comprueba si hay cambios disponibles y, si se confirma, actualiza el repositorio de instalación, instala dependencias y ejecuta setup y doctor. check solo muestra los cambios disponibles; yes aplica la actualización sin preguntar.

| Opción | Qué hace |
|---|---|
| `--check` | Muestra los cambios disponibles sin instalarlos. |
| `--yes` | Aplica la actualización sin pedir confirmación. |

Ejemplos:

- `agentrelay update --check`: Comprueba si hay una actualización disponible.
- `agentrelay update --yes`: Aplica la actualización sin pedir confirmación.

### `agentrelay config`

Muestra, localiza, crea o migra la configuración. En el chat de Claude Code: `/ar:config`.

```
agentrelay config [show|path|init|migrate [--dry-run]]
```

Muestra la configuración efectiva por defecto, enseña las rutas de configuración, crea un archivo inicial o migra archivos de configuración antiguos. init escribe la configuración de usuario salvo que indiques project o local.

| Opción | Qué hace |
|---|---|
| `--project` | Con init, crea la configuración en el proyecto. |
| `--local` | Alias obsoleto de project. |
| `--force` | Con init, sobrescribe el archivo de configuración existente. |
| `--dry-run` | Con migrate, informa de la migración sin aplicarla. |
| `--cwd <dir>` | Indica el directorio del proyecto. |
| `--config <archivo>` | Usa un archivo de configuración alternativo al mostrarla. |

Ejemplos:

- `agentrelay config`: Muestra la configuración efectiva.
- `agentrelay config path`: Muestra las rutas de configuración de usuario y proyecto.
- `agentrelay config init --project`: Crea un archivo de configuración en el proyecto.
- `agentrelay config migrate --dry-run`: Muestra qué migraría sin cambiar archivos.

### `agentrelay set`

Cambia un ajuste de configuración. En el chat de Claude Code: `/ar:set`.

```
agentrelay set <clave> <valor> [--local|--project]
```

Cambia un ajuste conocido de AgentRelay en la configuración de usuario. Con local o project, guarda el ajuste en la configuración del proyecto.

| Opción | Qué hace |
|---|---|
| `--local, --project` | Guarda el ajuste en la configuración del proyecto. |
| `--cwd <dir>` | Indica el directorio del proyecto. |
| `--config <archivo>` | Usa un archivo de configuración alternativo al calcular el valor efectivo. |

Ejemplos:

- `agentrelay set timeout 1800`: Cambia el ajuste timeout a 1800.
- `agentrelay set executor.type codex --local`: Cambia el ejecutor solo para este proyecto.

### `agentrelay unset`

Restablece un ajuste de configuración. En el chat de Claude Code: `/ar:unset`.

```
agentrelay unset <clave> [--local|--project]
```

Elimina el valor guardado para un ajuste conocido para que vuelva a aplicarse el valor efectivo de las demás fuentes de configuración. Con local o project, modifica la configuración del proyecto.

| Opción | Qué hace |
|---|---|
| `--local, --project` | Restablece el ajuste en la configuración del proyecto. |
| `--cwd <dir>` | Indica el directorio del proyecto. |
| `--config <archivo>` | Usa un archivo de configuración alternativo al calcular el valor efectivo. |

Ejemplos:

- `agentrelay unset executor.model`: Restablece el modelo guardado en la configuración de usuario.
- `agentrelay unset executor.model --local`: Restablece el modelo guardado en la configuración del proyecto.

### `agentrelay help`

Muestra la ayuda general o la ayuda detallada de un comando. En el chat de Claude Code: `/ar:help`.

```
agentrelay help [comando]
agentrelay <comando> --help
```

Muestra la lista de comandos disponibles o, si indicas uno, su descripción, uso, opciones y ejemplos. La ayuda funciona desde cualquier directorio.

Ejemplos:

- `agentrelay help`: Muestra la ayuda general y cómo consultar la ayuda detallada.
- `agentrelay help use`: Muestra la ayuda detallada de use.
- `agentrelay run --help`: Muestra la ayuda detallada de run.

## IA gratuitas: cuentas, cuota y orden

### `agentrelay login`

Conecta una cuenta del ejecutor o configura el respaldo por API de pago. En el chat de Claude Code: `/ar:login`.

```
agentrelay login [antigravity | gemini | opencode | --api [--remove]] [--device]
```

Sin argumento, inicia sesión con Codex usando el navegador o el código de dispositivo. Con antigravity, abre Antigravity CLI (agy) para iniciar sesión con tu cuenta de Google: es la segunda IA gratuita del enrutado. Con gemini, abre Gemini CLI para iniciar sesión con tu cuenta de Google. Con opencode, abre el asistente de autenticación de OpenCode. Con --api, guarda una clave de OpenAI en un perfil separado que solo se usa si se agota la cuota gratuita de ChatGPT.

| Opción | Qué hace |
|---|---|
| `--device` | Usa el código de dispositivo. |
| `--browser` | Fuerza el inicio de sesión con navegador. |
| `--api` | Configura el respaldo por API leyendo la clave desde stdin o el terminal. |
| `--remove` | Con --api, elimina el perfil de respaldo sin tocar la sesión de ChatGPT. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay login`: Inicia sesión con el método disponible.
- `agentrelay login antigravity`: Conecta tu cuenta de Google en Antigravity (Gemini y Claude con cuota semanal gratuita).
- `agentrelay login gemini`: Conecta tu cuenta de Google en Gemini CLI (desde junio de 2026, solo con licencia de empresa).
- `agentrelay login opencode`: Abre el asistente para conectar una cuenta de OpenCode.
- `agentrelay login --device`: Inicia sesión usando el código de dispositivo.
- `agentrelay login --api`: Guarda una clave para usarla solo si se agota la cuota gratuita de ChatGPT.
- `printenv OPENAI_API_KEY | agentrelay login --api`: Lee la clave de API desde la entrada estándar sin mostrarla.

### `agentrelay cuenta`

Muestra, añade y cambia las cuentas gratuitas de Luna y Gemini. En el chat de Claude Code: `/ar:cuenta`.

```
agentrelay cuenta
agentrelay cuenta <número>
agentrelay cuenta nueva <luna|gemini>
agentrelay cuenta quitar <número>
```

Lista numerada de tus cuentas de ChatGPT (Luna) y de Google (Gemini), con su correo, lo que queda de cuota y cuál está en uso; en un terminal pregunta qué número usar. Elegir una cuenta con la sesión caducada abre el inicio de sesión. Cada cuenta extra guarda su sesión en una carpeta propia de AgentRelay y tiene su propio registro de cuota. Las sesiones de OpenCode no se tocan. Revisa las condiciones de cada servicio antes de usar varias cuentas.

| Opción | Qué hace |
|---|---|
| `--device` | Con una cuenta de Luna, inicia sesión con el código de dispositivo. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay cuenta`: Muestra las cuentas numeradas y pregunta cuál usar.
- `agentrelay cuenta 2`: Usa la cuenta número 2.
- `agentrelay cuenta nueva gemini`: Entra con otra cuenta de Google y la deja en uso.

### `agentrelay cuota`

Muestra cuánto queda de cada IA gratuita y cuándo se renueva. En el chat de Claude Code: `/ar:cuota`.

```
agentrelay cuota [--json]
```

Consulta en directo, sin gastar peticiones, la cuota de Luna (cuenta de ChatGPT: sus ventanas de uso, por ejemplo 30 días en el plan gratuito) y de Gemini (cuenta de Google: cuota diaria por modelo), con el porcentaje que queda y la hora de renovación. También muestra las IA marcadas como agotadas por el último error.

| Opción | Qué hace |
|---|---|
| `--json` | Imprime el estado en JSON. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay cuota`: Muestra lo que queda de Luna y Gemini y cuándo se renueva.

### `agentrelay orden`

Muestra o cambia el orden en que el enrutado automático prueba las IA. En el chat de Claude Code: `/ar:orden`.

```
agentrelay orden
agentrelay orden gratis <modelo> [<modelo> …]
agentrelay orden pago <nombre> [<nombre> …]
agentrelay orden reset
```

Con el enrutado automático cada tarea prueba primero Luna con la cuenta de ChatGPT (si hay cuota), después los gratuitos de OpenCode Go y por último las IA de pago. Sin argumentos muestra ese orden con el estado de cada una. gratis fija los gratuitos de OpenCode Go (nombres como cat-jam o longcat-2.5-preview). pago acepta nombres claros: luna-go, luna-api, deepseek-flash-go, deepseek-pro-go, deepseek-flash-api y deepseek-pro-api; la lista de pago queda exactamente con los nombres indicados, en ese orden (por defecto solo DeepSeek Flash de Go). Cada gratuita se prueba dos veces seguidas antes de saltar; la de pago hasta tres veces ante fallos pasajeros (con pausas) y, si sigue fallando, la tarea se detiene y se pregunta qué IA usar. Solo cambia tu configuración de usuario.

| Opción | Qué hace |
|---|---|
| `gratis <modelo> …` | Gratuitos de OpenCode Go, en ese orden (deben terminar en -free). |
| `pago <nombre> …` | IA de pago (por defecto DeepSeek Flash de Go). Varios nombres = lista exacta; si falla la última, se detiene y se pregunta. |
| `reset` | Vuelve al orden por defecto (gratuitos y pago). |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay orden`: Muestra el orden actual y el estado de cada IA.
- `agentrelay orden pago deepseek-pro-go`: La IA de pago pasa a ser DeepSeek Pro por tu suscripción de Go.
- `agentrelay orden pago deepseek-flash-go luna-go`: DeepSeek Flash y, solo si falla, Luna, ambas por OpenCode Go.
- `agentrelay orden gratis cat-jam longcat-2.5-preview`: Solo esos dos gratuitos de Go, en ese orden.

### `agentrelay use`

Cambia el ejecutor, el modelo y el esfuerzo de razonamiento. En el chat de Claude Code: `/ar:use`.

```
agentrelay use [ejecutor] [modelo] [esfuerzo]
agentrelay use <perfil>
agentrelay use --save <nombre>
agentrelay use --list
```

Configura qué ejecutor usará AgentRelay y con qué modelo y esfuerzo. Puedes hacer el cambio de forma interactiva, indicar los valores en la línea de comandos o aplicar y guardar perfiles.

| Opción | Qué hace |
|---|---|
| `--save <nombre>` | Guarda la configuración actual como perfil. |
| `--list` | Lista los ejecutores instalados y sus modelos disponibles. |
| `--all` | Con --list, muestra todos los modelos de OpenCode, no solo los de freeOrder y paidOrder. |
| `--local, --project` | Guarda el cambio en la configuración de este proyecto. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay use`: Muestra el estado actual o inicia el selector interactivo.
- `agentrelay use codex gpt-5.5 alto`: Selecciona Codex, el modelo indicado y esfuerzo alto.
- `agentrelay use barato`: Aplica el perfil guardado llamado barato.
- `agentrelay use --save barato`: Guarda la selección actual como perfil barato.
- `agentrelay use deepseek-flash-go`: Atajo con nombre claro: luna-chatgpt, luna-go, deepseek-flash-go, deepseek-pro-go, deepseek-flash-api, deepseek-pro-api.
- `agentrelay use --list`: Lista ejecutores y modelos.
- `agentrelay use --list --all`: Muestra todos los modelos de OpenCode.

### `agentrelay executors`

Instala ejecutores opcionales. En el chat de Claude Code: `/ar:executors`.

```
agentrelay executors
agentrelay executors add <nombre>
```

Instala un ejecutor opcional como OpenCode. Para ver o cambiar de ejecutor usa "agentrelay use".

| Opción | Qué hace |
|---|---|
| `add <nombre>` | Instala el ejecutor opcional indicado. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay executors`: Muestra cómo ver o cambiar el ejecutor.
- `agentrelay executors add opencode`: Instala OpenCode como ejecutor opcional.

### `agentrelay providers`

Muestra qué proveedores de modelos están conectados. En el chat de Claude Code: `/ar:providers`.

```
agentrelay providers [--json]
```

Lista los proveedores conectados por OpenCode o mediante variables de entorno, junto con su nivel, límites y política de datos conocida. Para los demás muestra cómo conectarlos.

| Opción | Qué hace |
|---|---|
| `--json` | Imprime la lista en JSON. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay providers`: Muestra los proveedores y cómo conectar los que faltan.
- `agentrelay providers --json`: Imprime los datos de proveedores en JSON.

### `agentrelay evaluar`

Prueba los modelos gratuitos de OpenCode Go y propone el orden de routing.freeOrder. En el chat de Claude Code: `/ar:evaluar`.

```
agentrelay evaluar [--models a,b] [--runs N] [--no-apply]
agentrelay evaluar --revert
```

Solo se ejecuta cuando lo pides. Descubre los modelos opencode-go/*-free de tu cuenta de OpenCode Go (nunca los de pago), les hace resolver cuatro tareas pequeñas en una carpeta temporal, las corrige con pruebas que el modelo no ve y propone un ranking. Por defecto aplica el resultado reescribiendo solo routing.freeOrder en tu configuración de usuario, y guarda el valor anterior para poder deshacerlo.

| Opción | Qué hace |
|---|---|
| `--models <a,b>` | Evalúa solo esos modelos; deben ser ids -free que estén en tu cuenta. |
| `--runs <N>` | Repeticiones por modelo, de 1 a 3 (por defecto 1); con más de una se usa la media. |
| `--no-apply` | Solo muestra la propuesta, sin cambiar la configuración. |
| `--revert` | Restaura el routing.freeOrder anterior a la última evaluación aplicada. |
| `--cwd <dir>` | Indica el directorio desde el que se carga la configuración. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |

Ejemplos:

- `agentrelay evaluar --no-apply`: Evalúa y muestra la propuesta sin aplicarla.
- `agentrelay evaluar`: Evalúa y aplica el nuevo routing.freeOrder.
- `agentrelay evaluar --runs 2`: Repite cada tarea dos veces y usa la media.
- `agentrelay evaluar --revert`: Deshace el último cambio aplicado.

## Delegar y revisar tareas

### `agentrelay run`

Delega una tarea a un agente ejecutor. En el chat de Claude Code: `/ar:run`.

```
agentrelay run <tarea.json | ->
```

Lee una tarea JSON de un archivo o de la entrada estándar si indicas -. La tarea puede incluir los campos opcionales effort y model para fijar el esfuerzo y el modelo de esa ejecución. En Windows, guarda el JSON en un archivo temporal fuera del repositorio y pasa su ruta.

| Opción | Qué hace |
|---|---|
| `--self-review <modo>` | Fuerza el modo de revisión propia de la tarea. |
| `--allow-dirty` | Permite delegar aunque haya cambios sin confirmar. |
| `--cwd <dir>` | Indica el repositorio de trabajo. |
| `--config <archivo>` | Usa un archivo de configuración alternativo. |
| `--json` | Imprime el resultado en JSON. |
| `-q, --quiet` | Muestra solo errores, avisos y resultados esenciales. |
| `-v, --verbose` | Añade detalles para diagnosticar problemas. |

Ejemplos:

- `agentrelay run tarea.json`: Delega la tarea descrita en tarea.json.
- `agentrelay run -`: Lee el JSON de la tarea desde la entrada estándar.
- `agentrelay run tarea.json --allow-dirty`: Delega aunque el repositorio tenga cambios sin confirmar.

### `agentrelay watch`

Sigue en directo los eventos de las ejecuciones. Solo en el terminal.

```
agentrelay watch [id]
```

Muestra los eventos nuevos de la ejecución indicada. Sin id, sigue las ejecuciones nuevas.

| Opción | Qué hace |
|---|---|
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay watch`: Sigue en directo las ejecuciones nuevas.
- `agentrelay watch <id>`: Sigue en directo una ejecución concreta.

### `agentrelay show`

Muestra el informe de una ejecución. En el chat de Claude Code: `/ar:show`.

```
agentrelay show [id]
```

Muestra el informe de la ejecución indicada. Si omites el id, muestra la ejecución más reciente del repositorio.

| Opción | Qué hace |
|---|---|
| `--json` | Imprime el resultado en JSON. |
| `-q, --quiet` | Muestra solo el id, el estado y la ruta del informe. |
| `-v, --verbose` | Añade detalles para diagnosticar problemas. |
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay show`: Muestra el informe de la última ejecución.
- `agentrelay show 20261004-132748-bb5a`: Muestra el informe de esa ejecución.

### `agentrelay review`

Registra la decisión del orquestador sobre una ejecución. En el chat de Claude Code: `/ar:review`.

```
agentrelay review <id> --decision <accept|fix|escalate|reject> [--feedback <texto>]
```

Registra si aceptas el resultado, pides una corrección, escalas la tarea o la rechazas. Para pedir una corrección, incluye feedback con los problemas concretos.

| Opción | Qué hace |
|---|---|
| `--decision <decisión>` | Decisión requerida: accept, fix, escalate o reject. |
| `--feedback <texto>` | Describe los problemas; es obligatorio con fix. |
| `--feedback-file <ruta>` | Lee el feedback desde un archivo. |
| `--force` | Acepta sin superar la validación final o corrige por encima del límite. |
| `--json` | Imprime el resultado en JSON. |
| `-q, --quiet` | Muestra solo errores, avisos y resultados esenciales. |
| `-v, --verbose` | Añade detalles para diagnosticar problemas. |
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay review <id> --decision accept`: Acepta el resultado de la ejecución.
- `agentrelay review <id> --decision fix --feedback "Falta cubrir el caso vacío"`: Solicita una corrección con feedback.

### `agentrelay check`

Repite las validaciones de una ejecución. En el chat de Claude Code: `/ar:check`.

```
agentrelay check [id]
```

Vuelve a ejecutar las validaciones configuradas para la ejecución indicada. Si omites el id, usa la ejecución más reciente.

| Opción | Qué hace |
|---|---|
| `--json` | Imprime el resultado en JSON. |
| `-q, --quiet` | Muestra solo el id, el estado y la ruta del informe. |
| `-v, --verbose` | Añade detalles para diagnosticar problemas. |
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay check`: Repite las validaciones de la última ejecución.

### `agentrelay list`

Lista las ejecuciones del repositorio. En el chat de Claude Code: `/ar:list`.

```
agentrelay list
```

Muestra el id, el estado, el número de intentos y el título de cada ejecución del repositorio actual.

| Opción | Qué hace |
|---|---|
| `--json` | Imprime la lista en JSON. |
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay list`: Lista las ejecuciones del repositorio actual.

### `agentrelay status`

Resume el estado del proyecto. En el chat de Claude Code: `/ar:status`.

```
agentrelay status [--write] [--json]
```

Resume la configuración y el estado de AgentRelay en el proyecto. La opción write guarda o actualiza el resumen de estado del proyecto.

| Opción | Qué hace |
|---|---|
| `--write` | Escribe o actualiza el resumen de estado del proyecto. |
| `--json` | Imprime el estado en JSON. |
| `--cwd <dir>` | Indica el directorio del proyecto. |

Ejemplos:

- `agentrelay status`: Muestra el estado del proyecto.
- `agentrelay status --write`: Actualiza el archivo de estado y muestra el resumen.

### `agentrelay recover`

Recupera ejecuciones interrumpidas. En el chat de Claude Code: `/ar:recover`.

```
agentrelay recover [id]
```

Sin id, lista las ejecuciones que parecen interrumpidas. Con un id, marca como interrumpida una ejecución cuyo proceso ya no está activo y reconstruye su informe.

| Opción | Qué hace |
|---|---|
| `--cwd <dir>` | Indica el repositorio de trabajo. |

Ejemplos:

- `agentrelay recover`: Lista las ejecuciones interrumpidas.
- `agentrelay recover <id>`: Recupera la ejecución indicada si su proceso terminó.
