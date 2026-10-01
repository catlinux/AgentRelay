# AgentRelay — Reglas del proyecto

## Flujo

1. El orquestador comprende la petición, planifica y divide el trabajo.
2. El ejecutor recibe una tarea autocontenida, modifica el repositorio, ejecuta las comprobaciones y devuelve el resultado.
3. El orquestador revisa diff, tests y criterios de aceptación.
4. El ejecutor corrige si el problema es razonablemente corregible.
5. El orquestador toma el control si el ejecutor supera el límite o la tarea requiere razonamiento superior.
6. El orquestador valida finalmente el estado final.

## Delegación

- Delegar tareas de implementación bien acotadas con `agentrelay run -`, pasando una tarea JSON con `objective`, `context`, `files`, `constraints`, `acceptanceCriteria`, `validation` y `doNotModify`.
- El repositorio debe estar limpio antes de delegar.
- El orquestador decide directamente: cambios triviales, decisiones de diseño, documentación sensible.
- La revisión del ejecutor no sustituye la del orquestador. Decidir con `agentrelay review <id> --decision accept|fix|escalate|reject`.

## Commits

- Commits pequeños, coherentes y descriptivos.
- Identidad git local CatLinux, sin atribución a IA.
- No hacer push automáticamente.

## Seguridad

- No borrar trabajo del usuario ni sobrescribir cambios no relacionados.
- No hacer commits inesperados ni operaciones destructivas sin autorización explícita.
- Comprobar el estado del repositorio antes de operaciones potencialmente peligrosas.

## Idioma

- Repositorio en español: README, comentarios, documentación, ayuda, ejemplos, CHANGELOG y TODO.
- `README.en.md` en inglés. Ambos README enlazados mutuamente.
- El código puede conservar nombres técnicos/API en inglés.
