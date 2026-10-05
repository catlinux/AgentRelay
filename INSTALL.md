# Instalación de AgentRelay

**Español** · [English](INSTALL.en.md) · [Volver al README](README.md)

Necesitas **Node.js 20 o superior**, **Git** y una **cuenta de ChatGPT** (vale la gratuita; puedes crearla en [chatgpt.com](https://chatgpt.com)). AgentRelay incluye **Codex**, el agente que hace el trabajo; GPT-6 Luna está en el plan gratuito.

> **macOS no está probado: no tenemos ningún Mac.** Está soportado por diseño; si lo usas, cuéntanos si funcionó en una [incidencia](https://github.com/catlinux/AgentRelay/issues) (versión de macOS, de Node y salida de `agentrelay doctor`).

## Opción A: instalador (en preparación)

Hacen por ti los pasos de la opción B: Node.js y Git si faltan, clon del repositorio, dependencias, comando `agentrelay`, `setup` y `doctor`. **Aún no están probados en un equipo real**; si dudas, usa la opción B.

| Sistema | Qué hay | Cómo |
|---|---|---|
| Windows | `installer\windows\install.ps1` y un asistente de Inno Setup (`agentrelay.iss`) | `powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1 -DryRun` muestra lo que haría sin instalar nada; quita `-DryRun` para instalar (`-InstallDir`, `-Executors cline,opencode`, `-Login`). El `.exe`: `winget install JRSoftware.InnoSetup` y `ISCC.exe /DAppVersion=<versión> installer\windows\agentrelay.iss` (queda en `.agentrelay\installer\`). |
| Debian / Ubuntu | `installer/debian/install.sh`, un asistente con ventanas (`install-gui.sh`, necesita Zenity) y `build-deb.sh` | `bash installer/debian/install.sh --dry-run` muestra los pasos; `--install-deps` permite instalar Git y Node.js con `sudo`; también `--executors` y `--login`. Deja `~/.local/bin` en el PATH de forma permanente (en `~/.profile`, `~/.bashrc` y `~/.zshrc`; `--no-path` lo evita): abre una terminal nueva después. `build-deb.sh` genera el paquete `.deb` del asistente. |

AgentRelay se instala siempre como un clon de git en tu carpeta personal, así que `agentrelay update` sigue funcionando.

## Opción B: manual

**1. Instala Node.js y Git** (comprueba con `node --version` y `git --version`):

| Sistema | Comandos |
|---|---|
| Windows (PowerShell) | `winget install OpenJS.NodeJS.LTS` y `winget install Git.Git`; cierra y abre PowerShell |
| Debian / Ubuntu | `sudo apt install git`; para Node.js usa [nvm](https://github.com/nvm-sh/nvm) (sin `sudo`) y `nvm install 22`, porque el paquete de la distribución suele ser antiguo |
| macOS | `brew install git node` |

**2. Descarga e instala AgentRelay:**

```sh
cd ~          # en Windows: cd $HOME\Documents
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

Si `npm link` da un error de permisos, no uses `sudo`: crea un alias (`alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'` en `~/.bashrc` o `~/.zshrc`). En Windows el comando se llama `agentrelay.cmd` desde PowerShell o cmd.

**3. Conecta tu cuenta de ChatGPT** (una vez; se abre el navegador):

```sh
agentrelay login
```

Sin navegador (por ejemplo, por SSH): `agentrelay login --device`. Si ya usas Codex en VS Code con tu cuenta, la sesión se comparte y este paso ya está hecho.

**4. Comprueba que todo está bien:**

```sh
agentrelay doctor
```

**5. Prepara tu orquestador** (una vez por equipo; te pide confirmación y te ofrece ejecutores opcionales como Cline u OpenCode, que también puedes añadir luego con `agentrelay executors add <nombre>`):

```sh
agentrelay setup
```

`setup` escribe las instrucciones de delegación en `~/.claude/CLAUDE.md` y los comandos `/ar:` en `~/.claude/commands/ar/`. **Solo se cargan en sesiones nuevas de Claude Code**: ciérralo y ábrelo de nuevo. Si no puede escribir el archivo, lo dice con claridad y sale con error.

## Empezar a usarlo

1. Abre tu proyecto en VS Code con la extensión **Claude Code** y la sesión iniciada.
2. En el terminal del proyecto: `agentrelay start` (prepara el proyecto y comprueba que todo funciona; pide confirmación antes de cambiar nada).
3. En otro terminal: `agentrelay watch`, para ver trabajar al ejecutor.
4. En el chat de Claude, pide el trabajo con tus palabras: *«Añade una función que valide emails y delega la implementación con AgentRelay.»*

¿Prefieres probarlo antes? Mira [«Delegar a mano»](docs/MANUAL.md#6-delegar-a-mano-sin-orquestador) en el manual.

## Si algo falla

Empieza siempre por `agentrelay doctor`: dice qué falla y qué comando lo arregla.

| Síntoma | Qué hacer |
|---|---|
| `agentrelay: command not found` | Repite `npm link` en la carpeta de AgentRelay, abre un terminal nuevo, o usa el alias. |
| Fallo en el ejecutor | `npm install` otra vez en la carpeta de AgentRelay y repite `doctor`. |
| «No hay sesión iniciada» | `agentrelay login` (o `login --device`). |
| Avisos `EBADENGINE` en `npm install` | Solo son avisos: con Node 20 funciona; Node 22 los evita. |
| Cline u OpenCode no disponible | `agentrelay executors add cline` o `opencode`. |
| «no es un repositorio git» | `agentrelay start` en la carpeta del proyecto. |

## Actualizar

`agentrelay update` lo hace todo (descarga, dependencias, `setup` y `doctor`). A mano, dentro de la carpeta de AgentRelay: `git pull` y `npm ci` (no `npm install`, que puede reescribir `package-lock.json` y hacer fallar el siguiente `git pull`). Después, `agentrelay doctor`:

- Si avisa de instrucciones globales desactualizadas: `agentrelay setup` (una vez por equipo).
- Si avisa de instrucciones del proyecto desactualizadas: `agentrelay init` dentro del proyecto.
- Cierra y vuelve a abrir `agentrelay watch` y Claude Code para que usen lo nuevo.

## Desinstalar

Antes de borrar la carpeta, desde ella:

```sh
agentrelay setup --uninstall --yes     # quita el bloque, los comandos /ar: y el hook de Claude Code
npm unlink -g agentrelay               # quita el enlace del comando (en Linux del instalador: rm ~/.local/bin/agentrelay)
rm -rf ~/.agentrelay                   # opcional: configuración, perfiles y ejecutores opcionales
```

Después borra la carpeta de AgentRelay. No se toca Git, Node ni tu sesión de ChatGPT (`~/.codex/`). En los proyectos donde hiciste `agentrelay init` queda el bloque en `AGENTS.md`/`CLAUDE.md` (entre `<!-- agentrelay:start -->` y `<!-- agentrelay:end -->`) y la carpeta `.agentrelay/`; bórralos a mano si quieres.
