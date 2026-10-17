# AgentRelay: qué hace y cómo se usa

Guía corta. Todos los comandos, explicados y con ejemplos, en [COMANDOS.md](COMANDOS.md); el detalle de cada opción está en [MANUAL.md](MANUAL.md) y las decisiones de diseño en [DISENO.md](DISENO.md).

## Qué es

AgentRelay reparte el trabajo entre dos IA para gastar menos de la cara:

- El **orquestador** (por ejemplo Claude Code) piensa: planifica, reparte, revisa y decide.
- El **ejecutor** (una IA gratuita o más barata) escribe el código.

Tú sigues hablando solo con el orquestador. Cuando hay que programar algo, este manda una tarea al ejecutor con `agentrelay run`, comprueba el resultado (diff y pruebas) y, si está bien, lo acepta. Si no, pide una corrección. Mientras el ejecutor trabaja, el orquestador no gasta tokens.

## Qué ejecutores usa

| Ejecutor | Qué es | Coste |
|---|---|---|
| **Codex** (por defecto, incluido) | GPT-6 Luna con tu cuenta de ChatGPT | Cuota gratuita de ChatGPT (en el plan gratuito, una ventana de 30 días) |
| **Antigravity** (`agy`) | Gemini 3.8 Flash y, en otro cupo, Claude Sonnet 4.6 con tu cuenta de Google | Cuota semanal gratuita de Google, un cupo por grupo de modelos |
| **OpenCode** | DeepSeek V4.1 Flash o V4 Pro | De pago (suscripción de OpenCode Go o clave de API de DeepSeek) |

Se cambia con `agentrelay use` (interactivo) o, por ejemplo, `agentrelay use antigravity claude-sonnet-4-6`.

## Flujo recomendado (gratis primero)

1. Una vez por equipo:
   - `agentrelay login`: cuenta de ChatGPT para Luna.
   - Instala Antigravity con su instalador: en Linux y macOS `curl -fsSL https://antigravity.google/cli/install.sh | bash`; en Windows, en PowerShell, `irm https://antigravity.google/cli/install.ps1 | iex`. Abre una terminal nueva y ejecuta `agentrelay login antigravity` (cuenta de Google): elige «Google OAuth» y sal con `/quit`.
2. Activa el enrutado: `agentrelay set routing auto`. Cada tarea va a **Luna**; si se agota, a **Antigravity con Gemini**; si también, a **Antigravity con Claude Sonnet**; y si todo eso falla, a la IA de pago. Si la de pago también falla, se te pregunta.
3. Para saber cuánto queda: `agentrelay cuota` (en el chat, `/ar:cuota`). De Luna da el porcentaje y la hora de renovación sin gastar peticiones. De Antigravity dice si está agotada; el porcentaje exacto solo se ve con `/usage` dentro de `agy`.
4. ¿Se acabó la cuota de Luna? `agentrelay cuenta` muestra tus cuentas de ChatGPT numeradas, con su correo y lo que les queda, y te pregunta cuál usar. Para añadir otra: `agentrelay cuenta nueva`. OpenCode y Antigravity no se tocan. Revisa las condiciones de OpenAI antes de usar varias cuentas.

## Uso del día a día

En una carpeta de proyecto:

```sh
agentrelay start          # prepara el proyecto (git, instrucciones para el orquestador) y muestra el estado
agentrelay status         # dónde está el proyecto y qué ejecuciones hay
agentrelay watch          # en otra terminal: sigue en directo lo que hace el ejecutor
```

Normalmente no escribes `run` tú: se lo pides a Claude Code y él delega. Si quieres hacerlo a mano:

```sh
agentrelay run tarea.json                       # lanza una tarea (archivo JSON con el objetivo, archivos y criterios)
agentrelay review <id> --decision accept        # dar por buena una ejecución
agentrelay review <id> --decision fix --feedback "qué hay que corregir"
agentrelay review <id> --decision escalate      # la asume el orquestador
agentrelay review <id> --decision reject        # descartar
agentrelay list                                 # todas las ejecuciones
```

Cada ejecución deja un informe en `.agentrelay/runs/<id>/report.md` con lo que se hizo, los archivos cambiados, las validaciones y el diff.

**Guías del proyecto.** Si un proyecto tiene reglas de diseño o de estilo, guárdalas en un archivo (por ejemplo `docs/reglas-diseno.md`). El orquestador las pasa en el campo `references` de la tarea solo cuando hacen falta: el ejecutor las lee y las sigue, no puede modificarlas, y las tareas que no las necesitan no gastan cuota en ellas.

Con Antigravity, `watch` no ve los pasos uno a uno (`agy` no los cuenta hasta terminar): muestra los archivos que va cambiando y, si no cambia nada, cuánto lleva trabajando.

En Windows, si usas PowerShell: `agentrelay` funciona; el orquestador usa `agentrelay.cmd`.

## Enrutado automático

Ver o cambiar el orden es un solo comando: `agentrelay orden` (muestra cada IA y su estado), `agentrelay orden pago deepseek-pro-go` (cambia la principal de pago), `agentrelay orden gratis antigravity antigravity:claude-sonnet-4-6` y `agentrelay orden reset`. Nombres de pago: `deepseek-flash-go`, `deepseek-pro-go`, `deepseek-flash-api`, `deepseek-pro-api`, `luna-go`, `luna-api`.

```sh
agentrelay set routing auto --local   # en este proyecto (sin --local, en todos)
agentrelay set routing off --local    # para desactivarlo: se usa siempre el ejecutor de agentrelay use
```

Cada tarea empieza por el primero disponible de esta lista:

1. Luna con la cuota gratuita de ChatGPT (solo si Codex está conectado con tu cuenta; con clave de API se salta, porque se factura).
2. Las gratuitas de `routing.freeOrder`: por defecto Antigravity con Gemini y Antigravity con Claude Sonnet 4.6, cada una con su cupo semanal.
3. La de pago de `routing.paidOrder`: por defecto solo DeepSeek V4.1 Flash de OpenCode Go.

Cada **gratuita** se prueba dos veces seguidas (con 5 s de pausa) si falla por cuota, límite de velocidad o un fallo pasajero de conexión, y a la segunda salta a la siguiente; si el error ya dice cuándo se restablece la cuota, salta sin reintentar y la marca como agotada hasta esa hora. La **IA de pago** se prueba hasta tres veces (pausas de 5 y 15 s) solo ante un fallo pasajero; un error definitivo (saldo, credenciales, modelo inexistente) la detiene a la primera. Si la IA de pago sigue fallando, la tarea **se detiene y se te pregunta qué IA usar**: nunca continúa sola con otra.

En el informe, la sección **Enrutado** dice con qué empezó, los cambios, los saltos y, en negrita, si se ha usado alguna de pago. Antigravity lleva el aviso «puede usar tus prompts para entrenar».

## Mantenimiento

```sh
agentrelay doctor          # comprueba el entorno; con --fix arregla lo seguro
agentrelay update --yes    # actualiza AgentRelay (hazlo en cada equipo, uno a uno)
```

Tras actualizar, abre una conversación nueva de Claude Code para que cargue las instrucciones. El gasto de cada ejecución (tokens) está en su informe. `update` se niega si la copia instalada tiene cambios locales; no modifica nada.

## Si algo no va

| Síntoma | Qué mirar |
|---|---|
| «Antigravity CLI no está instalado» | Linux y macOS: `curl -fsSL https://antigravity.google/cli/install.sh \| bash`; Windows (PowerShell): `irm https://antigravity.google/cli/install.ps1 \| iex`. Después abre una terminal nueva |
| Antigravity pide confiar en una carpeta | `agentrelay login antigravity` lo abre en una carpeta vacía de AgentRelay: responde «Yes» ahí, nunca en tu carpeta personal |
| «El modelo … no está disponible para el ejecutor» | `agentrelay use --list` muestra los modelos de cada ejecutor |
| «El repositorio tiene cambios sin confirmar» | Confirma o guarda los cambios antes de delegar, o usa `--allow-dirty` |
| «No existen estos archivos de "references"» | La ruta de una guía está mal escrita en la tarea |
| Una cuota gratuita se ha agotado | Se repone sola (la hora sale en `agentrelay cuota`); con el enrutado activo se pasa a la siguiente |
| El enrutado se salta Luna gratis | Codex tiene sesión con clave de API: `agentrelay login` con tu cuenta de ChatGPT |
| Gemini CLI: «This client is no longer supported» | Google cerró Gemini CLI para cuentas personales; usa Antigravity |
