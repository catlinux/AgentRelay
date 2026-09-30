# Instalación de AgentRelay

**Español** · [English](INSTALL.en.md) · [Volver al README](README.md)

Elige tu sistema: [Windows](#windows) · [Linux](#linux) · [macOS](#macos).

Antes de empezar necesitas una **cuenta de ChatGPT** (vale la gratuita; si no tienes, puedes crearla en [chatgpt.com](https://chatgpt.com)). AgentRelay incluye **Codex**, el agente que hace el trabajo, y usa el modelo **GPT-6 Luna**, que está incluido en el plan gratuito. No necesitas ninguna clave de API.

---

## Windows

Abre **PowerShell**.

**1. Instala Node.js y Git** (si ya los tienes, salta este paso; comprueba con `node --version` y `git --version`):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Cierra y vuelve a abrir PowerShell.

**2. Descarga e instala AgentRelay:**

```powershell
cd $HOME\Documents
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

**3. Conecta tu cuenta de ChatGPT** (una sola vez; se abre el navegador para iniciar sesión):

```powershell
agentrelay login
```

Si ya usas Codex en VS Code con tu cuenta, la sesión se comparte y este paso ya está hecho.

**4. Comprueba que todo está bien:**

```powershell
agentrelay doctor
```

Todas las líneas deben salir con `[ok]`, incluida la de `Sesión`.

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación):

```powershell
agentrelay setup
```

Listo. Pasa a [Cómo empezar a usarlo](#cómo-empezar-a-usarlo).

---

## Linux

Abre un terminal. Los comandos de ejemplo son para Debian y Ubuntu.

**1. Instala Git y Node.js 20 o superior** (comprueba con `node --version` y `git --version`):

```sh
sudo apt install git
```

Para Node.js, el paquete de muchas distribuciones es demasiado antiguo. Lo más sencillo es usar [nvm](https://github.com/nvm-sh/nvm) (se instala en tu usuario, sin `sudo`). Sigue sus instrucciones de instalación y después:

```sh
nvm install 22
```

**2. Descarga e instala AgentRelay:**

```sh
cd ~
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

Si `npm link` da un error de permisos, no uses `sudo`: crea un alias en su lugar (añádelo a `~/.bashrc`):

```sh
alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'
```

**3. Conecta tu cuenta de ChatGPT** (una sola vez; se abre el navegador para iniciar sesión):

```sh
agentrelay login
```

Si el equipo no tiene navegador (por ejemplo, por SSH), usa `agentrelay login --device`: muestra un código que introduces desde otro dispositivo. Si ya usas Codex en VS Code con tu cuenta, la sesión se comparte y este paso ya está hecho.

**4. Comprueba que todo está bien:**

```sh
agentrelay doctor
```

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación):

```sh
agentrelay setup
```

Listo. Pasa a [Cómo empezar a usarlo](#cómo-empezar-a-usarlo).

---

## macOS

> macOS está soportado por diseño, pero todavía no se ha probado. Si encuentras un problema, por favor abre una incidencia en GitHub.

Abre **Terminal**.

**1. Instala Git y Node.js 20 o superior** (comprueba con `node --version` y `git --version`). Con [Homebrew](https://brew.sh):

```sh
brew install git node
```

**2. Descarga e instala AgentRelay:**

```sh
cd ~
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

Si `npm link` da un error de permisos, crea un alias (añádelo a `~/.zshrc`):

```sh
alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'
```

**3. Conecta tu cuenta de ChatGPT** (una sola vez; se abre el navegador para iniciar sesión):

```sh
agentrelay login
```

Si el equipo no tiene navegador (por ejemplo, por SSH), usa `agentrelay login --device`: muestra un código que introduces desde otro dispositivo. Si ya usas Codex en VS Code con tu cuenta, la sesión se comparte y este paso ya está hecho.

**4. Comprueba que todo está bien:**

```sh
agentrelay doctor
```

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación):

```sh
agentrelay setup
```

Listo. Pasa a [Cómo empezar a usarlo](#cómo-empezar-a-usarlo).

---

## Cómo empezar a usarlo

1. Abre tu proyecto en VS Code con la extensión **Claude Code** instalada y con la sesión iniciada.
2. En el terminal de ese proyecto ejecuta **una vez** `agentrelay init`. Prepara el proyecto (y el repositorio git si todavía no existe) y te pide confirmación.
3. Abre un segundo terminal y deja ejecutándose `agentrelay watch` para ver en directo lo que hace el agente.
4. Pídele el trabajo a Claude en el chat, con tus palabras. Por ejemplo: *«Añade una función que valide emails y delega la implementación con AgentRelay.»*

¿Quieres probarlo antes en un proyecto de demostración? Sigue la sección [«Probar AgentRelay en 5 minutos»](README.md#probar-agentrelay-en-5-minutos) del README.

---

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| `agentrelay: command not found` | Repite `npm link` en la carpeta de AgentRelay, o abre un terminal nuevo. En Linux y macOS puedes usar el alias indicado arriba. |
| `agentrelay doctor` marca fallo en el ejecutor | Ejecuta `npm install` otra vez en la carpeta de AgentRelay y repite `doctor`. |
| `doctor` o `run` dicen que no hay sesión iniciada | Ejecuta `agentrelay login` y entra con tu cuenta de ChatGPT. Si el equipo no tiene navegador (por ejemplo, por SSH), usa `agentrelay login --device`. |
| Avisos `EBADENGINE` durante `npm install` | Son avisos: algunas dependencias prefieren Node 22. Con Node 20 funciona. Si quieres evitarlos, actualiza a Node 22. |
| «Authentication Fails» al delegar (solo si usas Cline) | La clave del proveedor no está configurada o es incorrecta: repite la configuración de Cline descrita en el README. |
| «no es un repositorio git» | Ejecuta `agentrelay init` en la carpeta del proyecto. |

## Actualizar y desinstalar

**Actualizar:** dentro de la carpeta de AgentRelay:

```sh
git pull
npm ci
```

Usa `npm ci` y no `npm install`: instala exactamente las versiones del `package-lock.json` sin modificarlo, mientras que `npm install` puede reescribirlo y hacer que el siguiente `git pull` falle.

Si `git pull` responde *«Your local changes to the following files would be overwritten by merge: package-lock.json»*, descarta esos cambios (los genera npm; no pierdes nada) y repite:

```sh
git checkout -- package-lock.json
git pull
npm ci
```

Si tenías `agentrelay watch` abierto, ciérralo (Ctrl+C) y vuelve a lanzarlo. No hace falta repetir `init` ni `setup`, salvo que el CHANGELOG lo indique.

**Desinstalar:**

```sh
agentrelay setup --uninstall
npm unlink -g agentrelay
```

Después borra la carpeta de AgentRelay. Los proyectos donde hayas ejecutado `agentrelay init` conservan su bloque en el `CLAUDE.md`, delimitado por las marcas `<!-- agentrelay:start -->` y `<!-- agentrelay:end -->`: puedes borrarlo a mano.
