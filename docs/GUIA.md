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

Los proveedores gratuitos cambian de modelos a menudo, así que AgentRelay los vigila:

```sh
agentrelay providers          # qué proveedores tienes conectados, sus límites y avisos de privacidad
agentrelay rank               # el último ranquing de modelos
agentrelay rank --run --max 3 # recalcula (prueba hasta 3 modelos por proveedor; gasta algo de cuota)
```

- Se conectan con `agentrelay login opencode` (eliges el proveedor y pegas la clave). AgentRelay no guarda esas claves.
- **Cada modelo pasa tres pruebas** (fácil, media y difícil, con varios archivos). Es **apto** si supera la media y la difícil. Nivel **A** si además es rápido; nivel **B** si es más lento.
- Una vez al día, en segundo plano, se repite la evaluación de lo nuevo; un modelo ya probado no se repite hasta pasados 7 días. Los modelos retirados salen solos del ranquing.
- Tus revisiones afectan a la nota: `accept` suma, `fix`, `reject` y `escalate` restan, y eso desempata entre modelos parecidos.
- Descartados tras probarlos: Groq, NVIDIA y Google (ningún modelo apto), y Cline (OpenCode con DeepSeek rinde igual).

## Enrutado automático (opcional)

Por defecto AgentRelay usa siempre el ejecutor que tengas configurado. Si activas el enrutado, elige solo y cambia cuando se acaba la cuota:

```sh
agentrelay set routing auto --local   # en este proyecto (sin --local, en todos)
agentrelay set routing off --local    # para desactivarlo
```

Cada tarea empieza por el primero disponible de esta lista:

1. Luna con la cuota gratuita de ChatGPT (solo si Codex está conectado con tu cuenta; con clave de API se salta, porque se factura).
2. Los modelos gratuitos aptos del ranquing, los mejores primero (con esfuerzo alto, solo los de nivel A).
3. Los de pago, **sin tope de gasto**: DeepSeek Flash, después Luna por API (`agentrelay login --api`) y después DeepSeek Pro.

Si a media tarea se agota la cuota (o falta la sesión, o el modelo ya no existe), sigue con el siguiente sin gastar reintentos, hasta 5 cambios (`routing.maxSwitches`). La siguiente tarea vuelve a empezar por los gratuitos.

En el informe, la sección **Enrutado** dice con qué empezó, los cambios, los modelos saltados y, en negrita, si se ha usado alguno de pago.

## Mantenimiento

```sh
agentrelay doctor          # comprueba el entorno; con --fix arregla lo seguro
agentrelay update --yes    # actualiza AgentRelay (hazlo en cada equipo, uno a uno)
agentrelay setup           # tras actualizar, si quieres los comandos nuevos en Claude Code (/ar:...)
agentrelay usage           # consumo y coste de las ejecuciones del proyecto
```

`update` se niega si la copia instalada tiene cambios locales; no modifica nada.

## Si algo no va

| Síntoma | Qué mirar |
|---|---|
| «El modelo … no está disponible para el ejecutor» | `agentrelay use opencode <modelo>`; `agentrelay providers` para ver qué está conectado |
| Todo suspende la prueba fácil en `rank` | Que OpenCode no tenga procesos colgados (`opencode` en el administrador de tareas) y `agentrelay update --yes` |
| «El repositorio tiene cambios sin confirmar» | Confirma o guarda los cambios antes de delegar, o usa `--allow-dirty` |
| Una cuota gratuita se ha agotado | Se repone sola (la hora sale en `agentrelay doctor` para Luna); con el enrutado activo se pasa al siguiente |
| El enrutado se salta Luna gratis | Codex tiene sesión con clave de API: `agentrelay login` con tu cuenta de ChatGPT |
