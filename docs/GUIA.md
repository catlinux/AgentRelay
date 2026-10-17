# AgentRelay: qué hace y cómo se usa

Guía corta. Todos los comandos, explicados y con ejemplos, en [COMANDOS.md](COMANDOS.md); el detalle de cada opción está en [MANUAL.md](MANUAL.md) y las decisiones de diseño en [DISENO.md](DISENO.md).

## Qué es

AgentRelay reparte el trabajo entre dos IA para gastar menos de la cara:

- El **orquestador** (por ejemplo Claude Code) piensa: planifica, reparte, revisa y decide.
- El **ejecutor** (una IA más barata o gratuita) escribe el código.

Tú sigues hablando solo con el orquestador. Cuando hay que programar algo, este manda una tarea al ejecutor con `agentrelay run`, comprueba el resultado (diff y pruebas) y, si está bien, lo acepta. Si no, pide una corrección.

## Qué ejecutores usa

| Ejecutor | Qué es | Coste |
|---|---|---|
| **Codex** (por defecto) | GPT-6 Luna con tu cuenta de ChatGPT | Cuota gratuita de ChatGPT; con clave de API, lo que cobre OpenAI |
| **Gemini CLI** | Gemini con tu cuenta de Google (`agentrelay executors add gemini` y `agentrelay login gemini`) | Cuota diaria gratuita de Google; sin clave de API |
| **OpenCode** | Modelos gratuitos de OpenCode Zen, Mistral, OpenRouter y Z.AI, y DeepSeek de pago | Gratis (con límites) o lo que cobre DeepSeek |

Se cambia con `agentrelay use` (interactivo) o, por ejemplo, `agentrelay use opencode mistral/codestral-2508`.

## Flujo recomendado (gratis primero)

1. Una vez por equipo: `agentrelay login` (cuenta de ChatGPT, para Luna), `agentrelay executors add gemini` y `agentrelay login gemini` (cuenta de Google).
2. Activa el enrutado: `agentrelay set routing auto`. Cada tarea va a **Luna**; si se agota, a **Gemini**; si también, a la IA de pago, y si esa falla se te pregunta.
3. ¿Se acabó la cuota de una cuenta? `agentrelay cuenta` muestra tus cuentas numeradas, con su correo y lo que les queda, y te pregunta cuál usar (o directamente `agentrelay cuenta 2`). Para añadir otra: `agentrelay cuenta nueva luna` o `agentrelay cuenta nueva gemini`. OpenCode no se toca. Revisa las condiciones de OpenAI y Google sobre usar varias cuentas.
4. Para saber en cualquier momento cuánto queda: `agentrelay cuota` (en el chat, `/ar:cuota`). Muestra el porcentaje que queda de Luna (ventana de 5 h y semanal) y de Gemini (diaria, por modelo) y cuándo se renueva cada una. La consulta no gasta peticiones.

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

En Windows, si usas PowerShell: `agentrelay` funciona; el orquestador usa `agentrelay.cmd`.

## Modelos gratuitos y proveedores

Los proveedores gratuitos cambian de modelos a menudo. Puedes ver qué tienes conectado y, cuando quieras, medir los gratuitos de tu cuenta de OpenCode Go:

```sh
agentrelay providers             # qué proveedores tienes conectados, sus límites y avisos de privacidad
agentrelay evaluar --no-apply    # prueba los gratuitos y muestra la propuesta sin cambiar nada
agentrelay evaluar               # lo mismo, y aplica el resultado a routing.freeOrder
agentrelay evaluar --revert      # deshace el último cambio aplicado
```

- Se conectan con `agentrelay login opencode` (eliges el proveedor y pegas la clave). AgentRelay no guarda esas claves.
- **`evaluar` solo prueba los modelos `opencode-go/*-free` de tu cuenta de OpenCode Go** (nunca los de pago) y solo cuando tú lo pides: no hay evaluación automática ni en segundo plano.
- **Cada modelo resuelve cuatro tareas cortas** en una carpeta temporal, que se corrigen con pruebas que el modelo no ve. Es **apto** con 3 de 4 aprobadas y sin tocar archivos prohibidos. Si falla por cuota, red o sesión queda «no evaluado», no «suspendido».
- El resultado solo reescribe `routing.freeOrder` (los dos mejores, o tres si el tercero es claramente bueno), guarda el valor anterior para `--revert` y nunca toca `routing.paidOrder`. El informe queda en `~/.agentrelay/evaluar/`.
- `--models a,b` limita la evaluación a esos modelos `-free`; `--runs N` (1 a 3) repite cada tarea y usa la media.
- Descartados tras probarlos: Groq, NVIDIA y Google (ningún modelo apto), y Cline (OpenCode con DeepSeek rinde igual).

## Enrutado automático (opcional)

Ver o cambiar el orden es un solo comando: `agentrelay orden` (muestra cada IA y su estado), `agentrelay orden pago deepseek-pro-go` (cambia la principal de pago), `agentrelay orden gratis cat-jam longcat-2.5-preview` y `agentrelay orden reset`. Nombres de pago: `deepseek-flash-go`, `deepseek-pro-go`, `deepseek-flash-api`, `deepseek-pro-api`, `luna-go`, `luna-api`.

Por defecto AgentRelay usa siempre el ejecutor que tengas configurado. Si activas el enrutado, elige solo y cambia cuando se acaba la cuota:

```sh
agentrelay set routing auto --local   # en este proyecto (sin --local, en todos)
agentrelay set routing off --local    # para desactivarlo
```

Cada tarea empieza por el primero disponible de esta lista:

1. Luna con la cuota gratuita de ChatGPT (solo si Codex está conectado con tu cuenta; con clave de API se salta, porque se factura).
2. Las gratuitas de `routing.freeOrder`, si añades alguna (por defecto ninguna): modelos `-free` de OpenCode Go con `agentrelay orden gratis cat-jam`. Gemini CLI ya no funciona gratis con cuentas personales (Google lo cerró en junio de 2026); se está estudiando Antigravity CLI como sustituto.
3. La de pago de `routing.paidOrder`: por defecto solo DeepSeek V4.1 Flash de OpenCode Go (limitada por tu suscripción). Se cambia con `agentrelay orden pago <nombre>`.

Cada **gratuita** se prueba dos veces seguidas (con 5 s de pausa) si falla por cuota, saldo, límite de velocidad o un fallo pasajero de conexión, y a la segunda salta a la siguiente; si el error ya dice cuándo se restablece la cuota, salta sin reintentar. La **IA de pago** se prueba hasta tres veces (pausas de 5 y 15 s) solo ante un fallo pasajero (límite de velocidad, red, 502/503/504, saturación); un error definitivo (saldo insuficiente, credenciales, modelo inexistente) la detiene a la primera. Si la IA de pago sigue fallando, la tarea **se detiene y se te pregunta qué IA usar**: nunca continúa sola con otra. La siguiente tarea vuelve a empezar por los gratuitos.

En el informe, la sección **Enrutado** dice con qué empezó, los cambios, los modelos saltados y, en negrita, si se ha usado alguno de pago.

## Mantenimiento

```sh
agentrelay doctor          # comprueba el entorno; con --fix arregla lo seguro
agentrelay update --yes    # actualiza AgentRelay (hazlo en cada equipo, uno a uno)
agentrelay setup           # tras actualizar, si quieres los comandos nuevos en Claude Code (/ar:...)
```

El gasto de cada ejecución (tokens y coste estimado) está en su informe, en la tabla de intentos. `update` se niega si la copia instalada tiene cambios locales; no modifica nada.

## Si algo no va

| Síntoma | Qué mirar |
|---|---|
| «El modelo … no está disponible para el ejecutor» | `agentrelay use opencode <modelo>`; `agentrelay providers` para ver qué está conectado |
| Todos los modelos salen «no evaluados» en `evaluar` | Que OpenCode no tenga procesos colgados (`opencode` en el administrador de tareas) y `agentrelay update --yes` |
| «El repositorio tiene cambios sin confirmar» | Confirma o guarda los cambios antes de delegar, o usa `--allow-dirty` |
| Una cuota gratuita se ha agotado | Se repone sola (la hora sale en `agentrelay cuota`); con el enrutado activo se pasa al siguiente |
| Gemini dice «Manual authorization is required» | Falta la sesión de Google: `agentrelay login gemini` en un terminal con navegador |
| El enrutado se salta Luna gratis | Codex tiene sesión con clave de API: `agentrelay login` con tu cuenta de ChatGPT |
