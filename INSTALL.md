# Instalación de AgentRelay

**Español** · [English](INSTALL.en.md) · [Volver al README](README.md)

Elige tu sistema: [Windows](#windows) · [Linux](#linux) · [macOS](#macos).

Antes de empezar necesitas una **clave de API de DeepSeek** (o de otro proveedor que soporte Cline). Es la que usará el agente que hace el trabajo. No la compartas ni la pegues en capturas de pantalla.

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

**3. Configura tu proveedor** (solo si no usas ya Cline en VS Code con tu clave; si lo usas, ya está hecho):

```powershell
npx cline auth --provider deepseek --apikey TU_CLAVE --modelid deepseek-v4-pro
```

**4. Comprueba que todo está bien:**

```powershell
agentrelay doctor
```

Todas las líneas deben salir con `[ok]`.

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

**3. Configura tu proveedor** (desde la carpeta `~/AgentRelay`):

```sh
npx cline auth --provider deepseek --apikey TU_CLAVE --modelid deepseek-v4-pro
```

Si `npx cline` dice `cline: not found`, prueba con `./node_modules/.bin/cline auth …` en su lugar.

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

**3. Configura tu proveedor** (desde la carpeta `~/AgentRelay`):

```sh
npx cline auth --provider deepseek --apikey TU_CLAVE --modelid deepseek-v4-pro
```

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
| Avisos `EBADENGINE` durante `npm install` | Son avisos: algunas dependencias prefieren Node 22. Con Node 20 funciona. Si quieres evitarlos, actualiza a Node 22. |
| «Authentication Fails» al delegar | La clave del proveedor no está configurada o es incorrecta: repite el paso 3. |
| «no es un repositorio git» | Ejecuta `agentrelay init` en la carpeta del proyecto. |

## Actualizar y desinstalar

**Actualizar:** dentro de la carpeta de AgentRelay, ejecuta `git pull` y `npm install`.

**Desinstalar:**

```sh
agentrelay setup --uninstall
npm unlink -g agentrelay
```

Después borra la carpeta de AgentRelay. Los proyectos donde hayas ejecutado `agentrelay init` conservan su bloque en el `CLAUDE.md`, delimitado por las marcas `<!-- agentrelay:start -->` y `<!-- agentrelay:end -->`: puedes borrarlo a mano.
