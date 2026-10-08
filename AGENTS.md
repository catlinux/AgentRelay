# AgentRelay — Instrucciones del proyecto

Este archivo es neutral: lo lee cualquier orquestador (Claude Code, opencode, Codex u otro). `CLAUDE.md` solo lo importa. Las reglas generales (git y commits, idioma de las respuestas, simplicidad, sin atribución a IA) están en el `CLAUDE.md` global de cada equipo y no se repiten aquí. El contexto de diseño (propósito, política de orquestación, configuración, fases, versionado, costes) está en `docs/DISENO.md`: léelo solo cuando haga falta. Versionado: SemVer como en todos los proyectos, con la excepción de abajo (la versión se acuerda con el usuario, no se sube sola). Estado y pendientes: `TODO.md` y `CHANGELOG.md`.

**Si eres el ejecutor** (te han dado una tarea con `agentrelay run`): haz solo esa tarea y sigue sus restricciones; ignora el «Protocolo del orquestador» y el bloque de AgentRelay. No ejecutes `agentrelay` salvo que la tarea lo pida y no hagas commits ni push.

## Flujo fundamental

1. **El orquestador piensa:** comprende la petición, inspecciona el contexto necesario, planifica y divide el trabajo cuando convenga.
2. **El ejecutor trabaja:** recibe una tarea autocontenida, modifica el repositorio, ejecuta las comprobaciones y devuelve el resultado.
3. **El orquestador comprueba:** revisa diff, tests y criterios de aceptación.
4. **El ejecutor corrige:** si el problema es razonablemente corregible, recibe una nueva instrucción. El número de intentos es configurable.
5. **El orquestador toma el control:** si el ejecutor supera el límite, se bloquea o la tarea requiere razonamiento superior, el orquestador asume esa tarea concreta.
6. **El orquestador valida finalmente:** comprueba el estado final y determina que la tarea está terminada.

La comunicación debe ser estructurada y orientada a tareas, no una conversación infinita entre modelos.

## Idioma y documentación

Propio de este repositorio (la documentación mínima y el castellano ya son globales): el código puede conservar nombres técnicos/API en inglés; existe además `README.en.md` y ambos README se enlazan en la cabecera. Cada mejora, corrección o decisión acordada se anota en `TODO.md` en ese momento y se marca `[x]` al completarla.

## Producto: seguridad y simplicidad

- AgentRelay no debe borrar trabajo del usuario, sobrescribir cambios no relacionados, hacer commits inesperados, hacer push ni ejecutar comandos destructivos sin política explícita. Comprueba el estado del repositorio antes de operaciones potencialmente peligrosas.
- La solución más sencilla que cumpla el objetivo: sin bases de datos, microservicios, colas, servidores ni autorización compleja salvo necesidad demostrada.
- Estas instrucciones fijan objetivos y restricciones, no una implementación cerrada: cuestiona decisiones técnicas débiles y consulta al usuario cuando una decisión cambie sustancialmente diseño, coste, seguridad o comportamiento.

## Protocolo del orquestador (propio de este repositorio)

Complementa el bloque de AgentRelay del final; no lo repite.

- Usa siempre el `agentrelay` INSTALADO (copia separada), nunca `node bin/agentrelay.js` para orquestar: si una tarea rompe el código de desarrollo, la herramienta sigue funcionando. `node bin/agentrelay.js` es solo para probar cambios. La copia instalada se actualiza con `agentrelay update` solo con lo que esté en `main`; después `agentrelay doctor` avisa si hay que repetir `setup` o `init`. Si una tarea delegada rompe AgentRelay, la corriges tú.
- Al empezar: además de `.agentrelay/ESTADO.md`, lee `TODO.md` y la sección «Sin publicar» de `CHANGELOG.md`. Resuelve antes cualquier ejecución `running` o `awaiting_review`.
- No añadas con `git add -f` un archivo ignorado (`git check-ignore -v`). No crees archivos no pedidos.
- Al delegar: una tarea de documentación = un archivo. En `constraints` incluye siempre: no cambiar la versión, no escribir secuencias `\u` sueltas y usar la herramienta de edición, no scripts de PowerShell (hay archivos CRLF). Pon en `doNotModify` todo lo que no deba tocar.
- Al revisar: ejecuta `npm test` tú mismo (si falla, no aceptes); busca escapes `\u00` en los `.js` modificados y restáuralos a caracteres reales; comprueba que el cambio no deshace trabajo anterior (`git log -p` del archivo).
- **Excepción deliberada a la regla global de SemVer** (que pide subir la versión en cada trabajo acabado): en este repositorio, sin permiso explícito no se sube la versión ni se crean secciones de versión en `CHANGELOG.md` —todo va a «Sin publicar»— porque las versiones de la herramienta se liberan a mano. Tampoco se cambian `.gitignore`, `package.json` ni la licencia.
- Informe al usuario: qué hiciste tú, qué hizo el ejecutor, qué decidiste y qué queda; máximo 6 líneas, tras volver a ejecutar `git status --short` y `agentrelay list`. Los comandos del chat (`/ar:use alto`) y los del terminal (`agentrelay use alto`) nunca se mezclan en un mismo texto.

### Problemas conocidos de los ejecutores (cualquiera)

- Los parches pueden fallar en archivos CRLF y algunos ejecutores no pueden lanzar scripts por PowerShell: las tareas de documentación con varios archivos suelen fallar. Un archivo por encargo.
- A veces introducen escapes `\uXXXX` en lugar de caracteres reales.
- Las tareas anchas agotan el tiempo. Divide.
- La prueba `proc: termina los procesos que superan el tiempo máximo` puede fallar dentro de un sandbox y pasar en un entorno normal: no dejes que «arreglen» `proc.js` por eso.

## Validación semántica de entregas

Los tests en verde no bastan. Antes de aceptar, comprueba que la entrega cumple exactamente el contrato de la tarea y su scope, que el comportamiento real coincide con la semántica pedida (efectos secundarios, concurrencia, reintentos, cachés, permisos, aislamiento), que no añade cambios funcionales no pedidos y que los tests validan el comportamiento y no solo el camino feliz. Ante una contradicción o ambigüedad, para y pregunta. Una entrega puede rechazarse aunque todos los tests pasen.

<!-- agentrelay:start -->
## Delegación con AgentRelay

Este proyecto usa AgentRelay: tú eres el ORQUESTADOR (planificas, delegas, revisas y decides) y un agente ejecutor más económico (el configurado en AgentRelay) escribe el código. No edites este bloque: `agentrelay init` lo actualiza. Si eres tú el ejecutor (te han dado una tarea con `agentrelay run`), haz solo esa tarea e ignora este bloque.

**Regla principal: delega por defecto.** Toda implementación que no sea trivial (crear o modificar código, tests, configuración o documentación de más de unas pocas líneas) se delega con `agentrelay run`. Escribirla tú gasta tu consumo, que es justo lo que AgentRelay quiere ahorrar. Hazla tú solo si es trivial (1-3 líneas), una decisión de diseño, algo sensible o una tarea ya escalada; y en ese caso di en una línea por qué no delegas.

**Al empezar cualquier sesión, ponte al día:** lee `.agentrelay/ESTADO.md` (o ejecuta `agentrelay status`, que lo muestra y `agentrelay status --write` lo actualiza). Resume dónde está el proyecto, qué ejecuciones hay y qué hacer ahora. Si el usuario te pide continuar, parte de ahí en lugar de preguntarle.

### Cómo delegar

1. Repositorio limpio: `git status --short` debe salir vacío. Si hay trabajo sin confirmar, haz commit antes (sin secretos como `.env`). Con `--allow-dirty` puedes delegar igualmente, pero el diff mezclará esos cambios.
2. Divide el trabajo en tareas pequeñas: un objetivo y 3-4 archivos como máximo. Una tarea ancha agota el tiempo.
3. Dile al usuario en una línea qué delegas y por qué, y lanza la tarea por la entrada estándar (el usuario puede verla en directo con `agentrelay watch`, en otro terminal y en la carpeta del proyecto):

```
agentrelay run - <<'EOF'
{ "objective": "...", "context": "...", "files": ["..."], "constraints": ["..."], "acceptanceCriteria": ["..."], "validation": ["npm test"], "doNotModify": ["..."] }
EOF
```

   `context` debe bastar para que el ejecutor trabaje sin preguntarte: stack, convenciones y decisiones ya tomadas. Opcionalmente, `effort` (low, medium, high, xhigh) y `model` ajustan el esfuerzo y el modelo solo para esa tarea: esfuerzo bajo en las sencillas, alto en las difíciles.

### Cómo revisar

- Lee `agentrelay show <id>` (informe, incidencias y dudas) y el diff completo. Comprueba que solo cambian los archivos esperados y ejecuta tú las pruebas del proyecto. La autorrevisión del ejecutor no sustituye la tuya.
- Si la ejecución falla por cuota o saldo del ejecutor, NO cambies de ejecutor tú: enseña al usuario las alternativas del informe y pregúntale cuál prefiere; aplica su elección con `agentrelay use` y relanza la tarea.
- Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos) y confirma con `agentrelay list` que el estado cambió.
- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.
- Tras aceptar, haz el commit. No hagas push sin aprobación del usuario y no digas «hecho» ni «aceptado» sin haberlo comprobado.

### Otros

- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.
- **En Windows (PowerShell o cmd)** usa `agentrelay.cmd` en lugar de `agentrelay` (el segundo es un script de Unix y falla con errores de `sed`, `dirname` o `uname`). Nunca modifiques ese script. El `<<EOF` no existe en PowerShell: guarda el JSON de la tarea en un archivo temporal FUERA del repositorio (por ejemplo `$env:TEMP\tarea.json`) y lanza `agentrelay.cmd run $env:TEMP\tarea.json`; un archivo dentro del repositorio ensuciaría el árbol.
- Si una ejecución falla por una causa externa (sesión caducada, PowerShell bloqueado), díselo al usuario en lugar de hacer el trabajo tú en silencio.
<!-- agentrelay:end -->
