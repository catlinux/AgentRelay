# AgentRelay

<div align="center">

**Compilación**

[![Windows](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-windows.yml?branch=main&label=Windows&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-windows.yml) [![Linux](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-linux.yml?branch=main&label=Linux&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-linux.yml) [![macOS](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-macos.yml?branch=main&label=macOS&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-macos.yml)

**Agentes**

![Orquestador](https://img.shields.io/badge/orquestador-Claude%20Code-D97757?style=flat-square&labelColor=24292f) ![Ejecutor](https://img.shields.io/badge/ejecutor%20por%20defecto-Codex%20%2B%20GPT--6%20Luna-10A37F?style=flat-square&labelColor=24292f) ![Ejecutor opcional](https://img.shields.io/badge/ejecutor%20opcional-OpenCode-6E56CF?style=flat-square&labelColor=24292f)

**Proyecto**

![Versión](https://img.shields.io/github/package-json/v/catlinux/AgentRelay?label=versi%C3%B3n&color=e8590c&style=flat-square&labelColor=24292f) [![Licencia](https://img.shields.io/badge/licencia-WNCL--CU--1.0-0969da?style=flat-square&labelColor=24292f)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&labelColor=24292f) [![Último commit](https://img.shields.io/github/last-commit/catlinux/AgentRelay?label=%C3%BAltimo%20commit&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/commits/main)

</div>

**Español** · [English](README.en.md) · [Instalación](INSTALL.md) · [Manual de uso](docs/MANUAL.md)

Orquestador multiplataforma de agentes de IA para desarrollo de software. Un modelo potente (el **orquestador**, por ejemplo Claude Code) piensa, planifica y revisa; una IA más barata (el **ejecutor**) escribe el código. AgentRelay hace de puente: entrega la tarea, comprueba el resultado con tus pruebas y se lo devuelve al orquestador para que decida.

Así gastas menos del modelo caro sin perder supervisión.

> **Estado:** versión 0.2.0. La interfaz puede cambiar antes de la 1.0.0.

## Cómo funciona

```
tú ──petición──▶ orquestador ──tarea──▶ AgentRelay ──▶ ejecutor (escribe el código)
                     ▲                      │
                     │                      ├─ ejecuta tus pruebas
                     │                      ├─ si fallan, el ejecutor corrige (máx. 2 veces)
                     └──── informe ◀────────┘
                  aceptar · corregir · asumirla · rechazar
```

AgentRelay nunca hace commits ni push: los cambios quedan en tu carpeta para que los revises.

## Ejecutores

| Ejecutor | Qué usa | Coste |
|---|---|---|
| **Codex** (por defecto, incluido) | Tu cuenta de ChatGPT, modelo GPT-6 Luna | Incluido en el plan gratuito |
| **OpenCode** (opcional) | Modelos gratuitos de varios proveedores (OpenCode Zen, NVIDIA, Groq, Google, Mistral, OpenRouter, Z.AI) y DeepSeek de pago | Gratis o lo que cobre el proveedor |

Cambias de uno a otro con un solo comando: `agentrelay use` (interactivo) o `agentrelay use opencode`. `agentrelay providers` muestra los proveedores conectados, sus límites y un aviso de privacidad; la revisión diaria evalúa con tres pruebas los modelos gratuitos de todos los proveedores conectados y `agentrelay rank` muestra el ranquing. Con `agentrelay set routing auto`, AgentRelay pasa automáticamente de los gratuitos a los de pago cuando se agota la cuota; consulta [el manual](docs/MANUAL.md) para más detalles.

## Requisitos

- Node.js 20 o superior y Git.
- Una cuenta de ChatGPT (vale la gratuita) para Codex, o el ejecutor que prefieras.
- Windows, Linux o macOS (macOS sin probar: ver [Limitaciones](#limitaciones)).

## Instalación

Guía para cada sistema, con instaladores para Windows y Debian: **[INSTALL.md](INSTALL.md)**. En resumen:

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link            # deja disponible el comando "agentrelay"
agentrelay setup    # prepara Claude Code y conecta tu cuenta de ChatGPT
```

## Empezar en 3 pasos

```sh
cd mi-proyecto
agentrelay start    # 1. prepara el proyecto y comprueba que todo funciona
agentrelay watch    # 2. (en otro terminal) mira trabajar al ejecutor
```

3. En el chat de tu orquestador, pide lo que quieras en lenguaje normal. Él delega, revisa y te informa.

Para cambiar de IA: `agentrelay use`. Para ver dónde estás: `agentrelay status`. Si algo falla: `agentrelay doctor`.

**Los mismos comandos en el terminal y en el chat de Claude Code:** `agentrelay status` ↔ `/ar:status`, `agentrelay use opencode` ↔ `/ar:use opencode`, `agentrelay rank` ↔ `/ar:rank`… (todos menos `watch`). `agentrelay help` los lista.

**Todo lo demás, con ejemplos: [Manual de uso](docs/MANUAL.md).**

## Seguridad

- El ejecutor trabaja con **aprobación automática** dentro del repositorio: puede editar archivos y ejecutar comandos. Úsalo en repositorios que controles.
- AgentRelay no hace commits, stash, checkout ni push, y no toca el índice de git.
- Se niega a delegar si hay cambios sin confirmar, y detecta si el ejecutor crea commits o toca archivos protegidos.
- Las credenciales no se guardan en AgentRelay: las gestiona cada ejecutor.

## Limitaciones

- Las tareas se ejecutan de una en una.
- Todavía no hay panel en VS Code: se usa desde el terminal y desde el chat del orquestador.
- Probado en Windows y Linux (Debian). **macOS no está probado: no tenemos ningún Mac.** Si lo usas en macOS, abre una [incidencia en GitHub](https://github.com/catlinux/AgentRelay/issues) contando si funcionó, con tu versión de macOS, de Node (`node --version`) y la salida de `agentrelay doctor`.

Pendientes y cambios: [TODO.md](TODO.md) y [CHANGELOG.md](CHANGELOG.md). Diseño interno: [docs/DISENO.md](docs/DISENO.md).

## Desarrollo

```sh
npm test
```

Los tests usan simuladores de los ejecutores y no llaman a ningún modelo. La integración continua (`.github/workflows/`) los ejecuta en Windows, Linux y macOS con varias versiones de Node.

## Créditos y licencia

**AgentRelay** está desarrollado y mantenido por **CatLinux**.
Copyright (C) 2026 CatLinux.

Licencia [WNCL-CU-1.0](LICENSE): puedes usarlo gratis para cualquier fin, también comercial, y modificarlo y compartirlo sin coste. Nadie puede cobrar por el software ni por su uso; solo se pueden cobrar servicios de soporte e implementación.

Las copias y los forks deben conservar esta atribución y enlazar a https://github.com/catlinux/AgentRelay.

### Material de terceros

| Componente | Autor | Licencia | Enlace |
| --- | --- | --- | --- |
| Cline CLI (ejecutor opcional; se instala desde `agentrelay use`) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
| Codex CLI (dependencia npm, no incluida en el repositorio) | OpenAI | Apache-2.0 | https://github.com/openai/codex |
