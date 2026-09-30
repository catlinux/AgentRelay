# Installing AgentRelay

[Español](INSTALL.md) · **English** · [Back to the README](README.en.md)

Pick your system: [Windows](#windows) · [Linux](#linux) · [macOS](#macos).

Before you start you need a **ChatGPT account** (the free one is enough; if you do not have one, you can create it at [chatgpt.com](https://chatgpt.com)). AgentRelay includes **Codex**, the agent that does the work, and uses the **GPT-6 Luna** model, which is included in the free plan. You do not need any API key.

---

## Windows

Open **PowerShell**.

**1. Install Node.js and Git** (if you already have them, skip this step; check with `node --version` and `git --version`):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Close and reopen PowerShell.

**2. Download and install AgentRelay:**

```powershell
cd $HOME\Documents
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

**3. Connect your ChatGPT account** (once; the browser opens to sign in):

```powershell
agentrelay login
```

If you already use Codex in VS Code with your account, the session is shared and this step is already done.

**4. Check that everything is fine:**

```powershell
agentrelay doctor
```

Every line should show `[ok]`, including the `Sesión` one.

**5. Set up your orchestrator** (once; it asks for confirmation):

```powershell
agentrelay setup
```

Done. Go to [Getting started](#getting-started).

---

## Linux

Open a terminal. The example commands are for Debian and Ubuntu.

**1. Install Git and Node.js 20 or later** (check with `node --version` and `git --version`):

```sh
sudo apt install git
```

For Node.js, many distributions ship a version that is too old. The easiest way is [nvm](https://github.com/nvm-sh/nvm) (installed for your user, no `sudo`). Follow its installation instructions and then:

```sh
nvm install 22
```

**2. Download and install AgentRelay:**

```sh
cd ~
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

If `npm link` fails with a permissions error, do not use `sudo`: create an alias instead (add it to `~/.bashrc`):

```sh
alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'
```

**3. Connect your ChatGPT account** (once; the browser opens to sign in):

```sh
agentrelay login
```

If the machine has no browser (for example over SSH), use `agentrelay login --device`: it shows a code you enter from another device. If you already use Codex in VS Code with your account, the session is shared and this step is already done.

**4. Check that everything is fine:**

```sh
agentrelay doctor
```

**5. Set up your orchestrator** (once; it asks for confirmation):

```sh
agentrelay setup
```

Done. Go to [Getting started](#getting-started).

---

## macOS

> macOS is supported by design but has not been tested yet. If you run into a problem, please open an issue on GitHub.

Open **Terminal**.

**1. Install Git and Node.js 20 or later** (check with `node --version` and `git --version`). With [Homebrew](https://brew.sh):

```sh
brew install git node
```

**2. Download and install AgentRelay:**

```sh
cd ~
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

If `npm link` fails with a permissions error, create an alias (add it to `~/.zshrc`):

```sh
alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'
```

**3. Connect your ChatGPT account** (once; the browser opens to sign in):

```sh
agentrelay login
```

If the machine has no browser (for example over SSH), use `agentrelay login --device`: it shows a code you enter from another device. If you already use Codex in VS Code with your account, the session is shared and this step is already done.

**4. Check that everything is fine:**

```sh
agentrelay doctor
```

**5. Set up your orchestrator** (once; it asks for confirmation):

```sh
agentrelay setup
```

Done. Go to [Getting started](#getting-started).

---

## Getting started

1. Open your project in VS Code with the **Claude Code** extension installed and signed in.
2. In that project's terminal run `agentrelay init` **once**. It prepares the project (and the git repository if it does not exist yet) and asks for confirmation.
3. Open a second terminal and keep `agentrelay watch` running to see live what the agent does.
4. Ask Claude for the work in the chat, in your own words. For example: *"Add a function that validates emails and delegate the implementation with AgentRelay."*

Want to try it first on a demo project? Follow the ["Try AgentRelay in 5 minutes"](README.en.md#try-agentrelay-in-5-minutes) section of the README.

---

## If something goes wrong

| Symptom | What to do |
|---|---|
| `agentrelay: command not found` | Repeat `npm link` in the AgentRelay folder, or open a new terminal. On Linux and macOS you can use the alias shown above. |
| `agentrelay doctor` reports a failure for the executor | Run `npm install` again in the AgentRelay folder and repeat `doctor`. |
| `EBADENGINE` warnings during `npm install` | They are warnings: some dependencies prefer Node 22. It works with Node 20. To avoid them, upgrade to Node 22. |
| "Authentication Fails" when delegating (Cline only) | The provider key is not configured or is wrong: repeat the Cline setup described in the README. |
| `doctor` or `run` say there is no session | Run `agentrelay login` and sign in with your ChatGPT account. On a machine without a browser (for example over SSH), use `agentrelay login --device`. |
| "no es un repositorio git" (not a git repository) | Run `agentrelay init` in the project folder. |

## Updating and uninstalling

**Update:** inside the AgentRelay folder:

```sh
git pull
npm ci
```

Use `npm ci` rather than `npm install`: it installs exactly the versions in `package-lock.json` without changing it, while `npm install` may rewrite it and make the next `git pull` fail.

If `git pull` answers *"Your local changes to the following files would be overwritten by merge: package-lock.json"*, discard those changes (npm generates them; you lose nothing) and repeat:

```sh
git checkout -- package-lock.json
git pull
npm ci
```

If you had `agentrelay watch` open, stop it (Ctrl+C) and start it again. There is no need to repeat `init` or `setup` unless the CHANGELOG says so.

**Uninstall:**

```sh
agentrelay setup --uninstall
npm unlink -g agentrelay
```

Then delete the AgentRelay folder. Projects where you ran `agentrelay init` keep their block in `CLAUDE.md`, delimited by the `<!-- agentrelay:start -->` and `<!-- agentrelay:end -->` markers: you can delete it by hand.
