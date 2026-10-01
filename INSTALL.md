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

Las comprobaciones de Node.js, Git, el ejecutor y la sesión deben salir con `[ok]`. Como aún no has ejecutado `setup`, es normal que `doctor` avise de que faltan las instrucciones globales y los comandos de Claude Code; también puede avisar de que este proyecto aún no tiene el bloque de AgentRelay.

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación para instalar el bloque global y los comandos de Claude Code, te ofrecerá instalar Cline y solo propondrá iniciar sesión si no hay una sesión activa. Como ya has iniciado sesión en el paso 3, normalmente mostrará que la sesión sigue activa. Si dices que no a instalar Cline, puedes hacerlo más tarde con `agentrelay executors add cline`):

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

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación y te ofrecerá instalar ejecutores opcionales, como Cline; puedes decir que no y añadirlos más tarde con `agentrelay executors add <nombre>`):

```sh
agentrelay setup
```

Listo. Pasa a [Cómo empezar a usarlo](#cómo-empezar-a-usarlo).

---

## macOS

> **macOS no está probado: no tenemos ningún Mac.** Está soportado por diseño, pero si lo usas te agradeceremos mucho tu experiencia: abre una [incidencia en GitHub](https://github.com/catlinux/AgentRelay/issues) contando si funcionó o qué falló, con tu versión de macOS, tu versión de Node (`node --version`) y la salida de `agentrelay doctor`.

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

**5. Prepara tu orquestador** (una sola vez; te pedirá confirmación y te ofrecerá instalar ejecutores opcionales, como Cline; puedes decir que no y añadirlos más tarde con `agentrelay executors add <nombre>`):

```sh
agentrelay setup
```

Listo. Pasa a [Cómo empezar a usarlo](#cómo-empezar-a-usarlo).

---

## Cómo empezar a usarlo

1. Abre tu proyecto en VS Code con la extensión **Claude Code** instalada y con la sesión iniciada.
2. En el terminal de ese proyecto ejecuta `agentrelay init`. Prepara el proyecto (y el repositorio git si todavía no existe). Según el estado del repositorio, puede pedir confirmación para prepararlo o para crear un commit; si ya hay cambios pendientes, añade el bloque y te indica que confirmes `CLAUDE.md` y dejes limpio el repositorio antes de delegar.
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
| `doctor` dice que Cline no está disponible | Instálalo con `agentrelay executors add cline`. |
| «no es un repositorio git» | Ejecuta `agentrelay init` en la carpeta del proyecto. |

## Actualizar y desinstalar

**Actualizar:** dentro de la carpeta de AgentRelay:

```sh
git pull
npm ci
```

Usa `npm ci` y no `npm install`: instala exactamente las versiones del `package-lock.json` sin modificarlo, mientras que `npm install` puede reescribirlo y hacer que el siguiente `git pull` falle.

Si `git pull` responde *«Your local changes to the following files would be overwritten by merge: package-lock.json»*, revisa primero los cambios con `git diff -- package-lock.json`. Si confirmas que solo los generó npm y no los necesitas, descártalos y repite:

```sh
git checkout -- package-lock.json
git pull
npm ci
```

Después, comprueba que todo sigue en orden:

```sh
agentrelay doctor
```

- Si aparece `[aviso] Las instrucciones globales del orquestador están desactualizadas`, ejecuta `agentrelay setup`: una versión nueva ha cambiado esas instrucciones (por ejemplo, el triaje). Se hace una vez por equipo.
- Si aparece `[aviso] Las instrucciones de AgentRelay de este proyecto están desactualizadas`, ejecuta `agentrelay init` dentro de ese proyecto. Se hace una vez por proyecto.
- Si tenías `agentrelay watch` abierto, ciérralo (Ctrl+C) y vuelve a lanzarlo para que use el código nuevo.
- No hace falta repetir `agentrelay login` ni volver a crear tu configuración. El CHANGELOG indica los cambios de cada versión.

**Desinstalar:**

```sh
agentrelay setup --uninstall
npm unlink -g agentrelay
```

Después borra la carpeta de AgentRelay. Los proyectos donde hayas ejecutado `agentrelay init` conservan su bloque en el `CLAUDE.md`, delimitado por las marcas `<!-- agentrelay:start -->` y `<!-- agentrelay:end -->`: puedes borrarlo a mano.
