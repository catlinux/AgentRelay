# AgentRelay: qué hace y cómo se usa

Guía corta. El detalle de cada opción está en [MANUAL.md](MANUAL.md) y las decisiones de diseño en [DISENO.md](DISENO.md).

## Qué es

AgentRelay reparte el trabajo entre dos IA para gastar menos de la cara:

- El **orquestador** (por ejemplo Claude Code) piensa: planifica, reparte, revisa y decide.
- El **ejecutor** (una IA más barata o gratuita) escribe el código.

Tú sigues hablando solo con el orquestador. Cuando hay que programar algo, este manda una tarea al ejecutor con `agentrelay run`, comprueba el resultado (diff y pruebas) y, si está bien, lo acepta. Si no, pide una corrección.

## Qué ejecutores usa

| Ejecutor | Qué es | Coste |
|---|---|---|
| **Codex** (por defecto) | GPT-6 Luna con tu cuenta de ChatGPT | Cuota gratuita de ChatGPT; con clave de API, lo que cobre OpenAI |
| **OpenCode** | Modelos gratuitos de OpenCode Zen, Mistral, OpenRouter y Z.AI, y DeepSeek de pago | Gratis (con límites) o lo que cobre DeepSeek |

Se cambia con `agentrelay use` (interactivo) o, por ejemplo, `agentrelay use opencode mistral/codestral-2508`.

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
2. Los modelos gratuitos de `routing.freeOrder`, en el orden que tú fijes (por defecto Cat Jam y LongCat de OpenCode Go; no dependen del esfuerzo de la tarea).
3. La de pago de `routing.paidOrder`: por defecto solo DeepSeek V4.1 Flash de OpenCode Go (limitada por tu suscripción). Se cambia con `agentrelay orden pago <nombre>`.

Una gratuita se prueba **dos veces seguidas**: si las dos fallan por cuota, saldo o límite de velocidad, salta a la siguiente (si el error ya dice cuándo se restablece, salta a la primera). Si falta la sesión o el modelo ya no existe, salta enseguida. Si la IA de pago falla, la tarea **se detiene y se te pregunta qué IA usar**: nunca continúa sola con otra. La siguiente tarea vuelve a empezar por los gratuitos.

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
| Una cuota gratuita se ha agotado | Se repone sola (la hora sale en `agentrelay doctor` para Luna); con el enrutado activo se pasa al siguiente |
| El enrutado se salta Luna gratis | Codex tiene sesión con clave de API: `agentrelay login` con tu cuenta de ChatGPT |
