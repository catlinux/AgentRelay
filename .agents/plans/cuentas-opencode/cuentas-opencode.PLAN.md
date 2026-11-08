# Varias cuentas de OpenCode con rotación

Objetivo: con varias cuentas de una integración de OpenCode (el usuario tiene 3 de OpenCode Go), AgentRelay cambia sola a la siguiente cuando se acaba el crédito.

Hecho (commit dbc14b2): `src/cuentas-opencode.js` (listar, activar, `prepararCuenta`, `rotarCuenta`) e integración en `src/orchestrator.js` (`attempt()` activa la cuenta y registra `account` en el intento y en `attempt_start`; `continueCycle` rota ante `classifyExecutorError === 'quota'` antes de `switchRoute`; evento `account_switch`, `state.accountSwitches`; `cuentaHooks` para tests). Probado a mano contra la CLI real: Go → Go 2 → Go 3 → null.

Reglas para todos los pasos: versión sin tocar, CHANGELOG solo en «Sin publicar» (lo hace el orquestador), un archivo de documentación por tarea, sin escapes `\u`, sin scripts de PowerShell. Ejecutor: AgentRelay, esfuerzo medio salvo que se diga.

## Pasos

1. [ ] **Tests** (`test/cuentas-opencode.test.js` nuevo, `test/routing.test.js`). Módulo: con un `run` falso que responde a `auth list --format json` y `auth switch`, comprobar el orden de alta, que con una sola cuenta no hace nada, la elección de la guardada, saltar las agotadas y que `rotarCuenta` devuelve null al final. Orquestador: con `cuentaHooks`, un fallo `insufficient_quota` rota y repite con el mismo modelo sin consumir `route.switches`, y cuando `rotar` devuelve null sigue `switchRoute`; un 429 no rota. Terminado: `npm test` sin fallos nuevos.
2. [ ] **`agentrelay cuenta opencode [<número>]`** (`src/cuenta-cmd.js`, `src/cli.js`, `src/help.js`). Lista numerada de las credenciales de cada integración con 2 o más (etiqueta, en uso según AgentRelay, agotada hasta X según quota-state) y con número activa esa (`activarCredencial`). Quitar «OpenCode no se toca» de la ayuda. Terminado: tests de cuenta y help pasan; regenerar `/ar:` si `help.js` lo exige.
3. [ ] **`watch` e informe** (`src/events.js`, `src/report.js`): línea para `account_switch` («Cuenta de OpenCode Go agotada: OpenCode Go → OpenCode Go 2») y sección en el informe con `state.accountSwitches`. Esfuerzo bajo.
4. [ ] **Documentación**, una tarea por archivo: `docs/DISENO.md` (sustituir «nunca entre cuentas del mismo proveedor» por la regla nueva: se rota entre cuentas de una integración de OpenCode y, agotadas todas, entre proveedores), `docs/COMANDOS.md` (regenerado si sale de la ayuda), `docs/GUIA.md`, `README.md` y `README.en.md`. Esfuerzo bajo.
5. [ ] **Prueba real** (usuario): al agotarse una cuenta de Go, guardar el texto del error y comprobar en `watch` el cambio; afinar `classifyExecutorError` si hace falta.
