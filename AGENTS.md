# AgentRelay — Instrucciones del proyecto

Este archivo es neutral: lo lee cualquier orquestador (Claude Code, opencode, Codex u otro). `CLAUDE.md` solo lo importa. El contexto de diseño (propósito, política de orquestación, configuración, fases, versionado, costes) está en `docs/DISENO.md`: léelo solo cuando haga falta. Versionado: Semantic Versioning; una versión nueva se acuerda con el usuario, no se inventa. Estado y pendientes: `TODO.md` y `CHANGELOG.md`.

**Si eres el ejecutor** (te han dado una tarea con `agentrelay run`): haz solo esa tarea y sigue sus restricciones; ignora las secciones 22, 23 y 24, que son solo del orquestador. No ejecutes `agentrelay` salvo que la tarea lo pida, no hagas commits ni push y no pares por pasos del protocolo del orquestador.

## 2. Flujo fundamental

1. **El orquestador piensa:** comprende la petición, inspecciona el contexto necesario, planifica y divide el trabajo cuando convenga.
2. **El ejecutor trabaja:** recibe una tarea autocontenida, modifica el repositorio, ejecuta las comprobaciones y devuelve el resultado.
3. **El orquestador comprueba:** revisa diff, tests y criterios de aceptación.
4. **El ejecutor corrige:** si el problema es razonablemente corregible, recibe una nueva instrucción. El número de intentos es configurable.
5. **El orquestador toma el control:** si el ejecutor supera el límite, se bloquea o la tarea requiere razonamiento superior, el orquestador asume esa tarea concreta.
6. **El orquestador valida finalmente:** comprueba el estado final y determina que la tarea está terminada.

La comunicación debe ser estructurada y orientada a tareas, no una conversación infinita entre modelos.

## 10. Commits

Cada cambio lógico terminado tiene su propio commit: pequeño, coherente y descriptivo. Identidad git local CatLinux y sin atribución a IA. No hacer push automáticamente ni operaciones destructivas sin autorización explícita del usuario.

## 12. Idioma

El repositorio está en español: README, comentarios, documentación, ayuda, ejemplos, CHANGELOG y TODO. Existe además `README.en.md` en inglés; ambos README se enlazan mutuamente en la cabecera. El código puede conservar nombres técnicos/API en inglés.

## 13. Documentación viva

Existen como mínimo `README.md`, `README.en.md`, `CHANGELOG.md` y `TODO.md`. Actualizar en cada modificación todos los documentos afectados. No crear documentación redundante.

## 14. Tareas delegadas

Las tareas para el ejecutor son autocontenidas e incluyen, cuando sea posible: objetivo, contexto relevante, restricciones, archivos o áreas afectadas, criterios de aceptación, tests esperados y condiciones que no deben modificarse.

## 16. Seguridad y control del repositorio

AgentRelay no debe borrar trabajo del usuario, sobrescribir cambios no relacionados, hacer commits inesperados, hacer push automáticamente ni ejecutar comandos destructivos sin política explícita. Se comprueba el estado del repositorio antes de operaciones potencialmente peligrosas. Antes de crear o sobrescribir un archivo, comprobar que existe y que no está ignorado por `.gitignore`.

## 18. Simplicidad

La solución más sencilla que cumpla correctamente el objetivo es preferible a una arquitectura sofisticada. Evitar bases de datos, microservicios, colas externas, servidores o sistemas de autorización complejos salvo necesidad demostrada.

## 19. Criterio técnico del orquestador

Estas instrucciones definen objetivos y restricciones, no una implementación cerrada. El orquestador debe cuestionar decisiones técnicas débiles, proponer alternativas y consultar al usuario cuando una decisión pueda cambiar sustancialmente diseño, coste, seguridad o comportamiento.

## 22. Modo de trabajo: delegación con AgentRelay

El desarrollo de este proyecto sigue el flujo de AgentRelay: el orquestador analiza, planifica, revisa y decide; el ejecutor implementa.

- Delegar las tareas de implementación bien acotadas con `agentrelay run - <<'EOF' … EOF` (tarea JSON con `objective`, `context`, `files`, `constraints`, `acceptanceCriteria`, `validation` y `doNotModify`).
- Usar siempre el comando `agentrelay` INSTALADO (una copia separada del código de desarrollo) y no `node bin/agentrelay.js` de esta carpeta: así, si una tarea delegada rompe el código de desarrollo, la herramienta con la que se orquesta sigue funcionando. Para probar cambios del código de desarrollo sí se usa `node bin/agentrelay.js`.
- La copia instalada se actualiza con `git pull` y `npm ci` (no `npm install`) solo con lo que esté en `main`; después `agentrelay doctor` avisa si hay que repetir `setup` o `init`.
- Antes de delegar, el árbol de trabajo debe estar limpio (commit previo) para que el diff sea solo de la tarea.
- Leer el informe (diff, validaciones, informe del ejecutor) y decidir con `agentrelay review <id> --decision accept|fix|escalate|reject`. La autorrevisión del ejecutor no sustituye esta revisión. Ejecutar `npm test` uno mismo antes de aceptar.
- El orquestador hace el trabajo directamente cuando delegar no compensa: cambios triviales, decisiones de diseño, documentación sensible, archivos internos o tareas escaladas. Si una tarea delegada rompe AgentRelay, el orquestador asume la corrección.
- Informar al usuario en el chat de qué se delega, por qué y qué se decide al revisar. El usuario puede seguir la ejecución con `agentrelay watch`.
- Informar con fidelidad: no decir que una ejecución está aceptada si `agentrelay list` no lo indica.

## 23. Mantener TODO.md al día

Cada mejora, corrección o decisión acordada con el usuario se anota en `TODO.md` en ese momento (con sus matices) y se marca `[x]` al completarla, junto con `CHANGELOG.md` y los README si quedan afectados.

## 24. Protocolo obligatorio del orquestador

Sigue estos pasos en orden, sin saltarte ninguno. Si un paso falla o no estás seguro, PARA y pregunta al usuario. No improvises.

### Al empezar una sesión
1. Ejecuta `git status --short`, `git log --oneline -10` y `agentrelay list`.
2. Lee `TODO.md` (lo pendiente) y la sección «Sin publicar» de `CHANGELOG.md` (lo hecho y no publicado).
3. Si alguna ejecución está `running` o `awaiting_review`, resuélvela antes de empezar nada nuevo.

### Antes de tocar un archivo
- Comprueba si existe y léelo entero antes de sobrescribirlo. Nunca reemplaces el contenido de un archivo existente por un resumen.
- Comprueba con `git check-ignore -v <archivo>` si está ignorado. Si lo está, no lo añadas a git (nunca `git add -f`) sin permiso del usuario.
- No crees archivos nuevos que no se hayan pedido.

### Antes de delegar
1. `git status --short` debe salir vacío. Si no, haz commit de lo tuyo o pregunta.
2. Una tarea = un objetivo concreto, como máximo 3-4 archivos. Si es más grande, divídela. La documentación, un encargo por archivo.
3. En `constraints` incluye siempre: no cambiar la versión, no escribir secuencias `\u` sueltas, usar la herramienta de edición y no scripts de PowerShell (los archivos pueden tener CRLF).
4. Pon en `doNotModify` todo lo que no deba tocar.
5. Di al usuario en una línea qué delegas y por qué.

### Después de cada ejecución
1. `agentrelay show <id>`: lee el informe completo, incluidos «Incidencias» y «Dudas».
2. `git diff`: lee el diff entero. Comprueba que solo cambian los archivos esperados.
3. Ejecuta `npm test` tú mismo. Si falla, no aceptes.
4. Busca escapes `\u00` en los archivos `.js` modificados; si aparecen, restáuralos a caracteres reales.
5. Comprueba que el cambio no deshace trabajo anterior (compáralo con `git log -p` del archivo si dudas).
6. Decide con `agentrelay review <id> --decision ...` y confirma con `agentrelay list` que el estado ha cambiado.
7. Commit con un mensaje descriptivo.

### Antes de informar al usuario
- Vuelve a ejecutar `git status --short` y `agentrelay list`. Lo que digas debe coincidir con su salida.
- Nunca digas «aceptado», «pasan los tests» o «hecho» sin haberlo comprobado en este mismo paso.
- Formato del informe: qué hiciste tú, qué hizo el ejecutor, qué decidiste al revisar y qué queda pendiente. Máximo 6 líneas.

### Prohibido sin permiso explícito del usuario
- `git push`, `git reset --hard`, `git checkout -- <archivo>` sobre cambios ajenos, `git add -f`, `git commit --amend` de commits ya subidos, borrar archivos.
- Subir la versión o crear secciones de versión en `CHANGELOG.md` (los cambios van en «Sin publicar»).
- Cambiar `.gitignore`, `package.json` o la licencia.

### Reglas de comunicación con el usuario
- Respuestas cortas y en español.
- Los comandos del chat de Claude Code (`/ar:esfuerzo alto`) y los de terminal (`agentrelay set effort alto`) nunca se mezclan en un mismo texto.
- No inventes costes, versiones ni resultados. Si no lo sabes, dilo.

### Problemas conocidos del ejecutor (Codex con GPT-6 Luna en Windows)
- No consigue escribir ni lanzar scripts por PowerShell y sus parches fallan en archivos CRLF: las tareas de documentación con varios archivos suelen fallar. Un archivo por encargo.
- A veces introduce escapes `\uXXXX` en lugar de caracteres reales.
- Las tareas anchas agotan el tiempo (1200 s). Divide.
- La prueba `proc: termina los procesos que superan el tiempo máximo` falla dentro de su sandbox, pero pasa en un entorno normal: no dejes que «arregle» `proc.js` por eso.

## Validación semántica de entregas

Los tests en verde no implican por sí solos que una entrega sea correcta.

Antes de aceptar una implementación, el orquestador debe comprobar:

1. Que cumple exactamente el contrato funcional de la tarea.
2. Que respeta todas las restricciones y el scope establecido.
3. Que el comportamiento real coincide con la semántica requerida, especialmente en operaciones con efectos secundarios, concurrencia, retries, cachés, permisos y aislamiento.
4. Que no introduce cambios funcionales no solicitados aunque la implementación sea técnicamente válida.
5. Que los tests realmente validan el comportamiento requerido y no únicamente el camino feliz.

Si existe una contradicción, ambigüedad o requisito que no pueda determinarse de forma segura, el orquestador debe detenerse y solicitar aclaración en lugar de inventar una interpretación.

Una entrega puede ser rechazada aunque todos los tests pasen si no cumple semánticamente el contrato.

<!-- agentrelay:start -->
## Delegación con AgentRelay

Este proyecto usa AgentRelay: tú eres el ORQUESTADOR (planificas, delegas, revisas y decides) y un agente ejecutor más económico (por defecto, Codex con GPT-6 Luna) escribe el código. No edites este bloque: `agentrelay init` lo actualiza. Si eres tú el ejecutor (te han dado una tarea con `agentrelay run`), haz solo esa tarea e ignora este bloque.

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

   `context` debe bastar para que el ejecutor trabaje sin preguntarte: stack, convenciones y decisiones ya tomadas.

### Cómo revisar

- Lee `agentrelay show <id>` (informe, incidencias y dudas) y el diff completo. Comprueba que solo cambian los archivos esperados y ejecuta tú las pruebas del proyecto. La autorrevisión del ejecutor no sustituye la tuya.
- Decide con `agentrelay review <id> --decision accept|fix|escalate|reject` (`fix` necesita `--feedback` con los problemas concretos) y confirma con `agentrelay list` que el estado cambió.
- Si la tarea queda escalada o el ejecutor falla repetidamente, resuélvela tú y cierra la ejecución con `--decision accept`.
- Tras aceptar, haz el commit. No hagas push sin que el usuario lo pida y no digas «hecho» ni «aceptado» sin haberlo comprobado.

### Otros

- Si `agentrelay` indica que el proyecto no es un repositorio git, pide confirmación al usuario y ejecuta `agentrelay init --yes`.
- **En Windows (PowerShell o cmd)** usa `agentrelay.cmd` en lugar de `agentrelay` (el segundo es un script de Unix y falla con errores de `sed`, `dirname` o `uname`). Nunca modifiques ese script. El `<<EOF` no existe en PowerShell: guarda el JSON de la tarea en un archivo temporal FUERA del repositorio (por ejemplo `$env:TEMP\tarea.json`) y lanza `agentrelay.cmd run $env:TEMP\tarea.json`; un archivo dentro del repositorio ensuciaría el árbol.
- Si una ejecución falla por una causa externa (sesión caducada, PowerShell bloqueado), díselo al usuario en lugar de hacer el trabajo tú en silencio.
<!-- agentrelay:end -->
