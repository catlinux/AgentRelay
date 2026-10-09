# Installing AgentRelay

[Español](INSTALL.md) · **English** · [Back to the README](README.en.md)

You need **Node.js 20 or later**, **Git** and a **ChatGPT account** (the free one works; create it at [chatgpt.com](https://chatgpt.com)). AgentRelay ships with **Codex**, the agent that does the work; GPT-6 Luna is in the free plan.

> **macOS is untested: we do not have a Mac.** It is supported by design; if you use it, please tell us whether it worked in an [issue](https://github.com/catlinux/AgentRelay/issues) (macOS version, Node version and the output of `agentrelay doctor`).

## Option A: installer (in preparation)

They do the steps of option B for you: Node.js and Git if missing, repository clone, dependencies, the `agentrelay` command, `setup` and `doctor`. **They have not been tested on a real machine yet**; when in doubt, use option B.

| System | What is there | How |
|---|---|---|
| Windows | `installer\windows\install.ps1` and an Inno Setup wizard (`agentrelay.iss`) | `powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1 -DryRun` shows what it would do without installing anything; remove `-DryRun` to install (`-InstallDir`, `-Executors cline,opencode`, `-Login`). The `.exe`: `winget install JRSoftware.InnoSetup` and `ISCC.exe /DAppVersion=<version> installer\windows\agentrelay.iss` (output in `.agentrelay\installer\`). |
| Debian / Ubuntu | `installer/debian/install.sh`, a windowed wizard (`install-gui.sh`, needs Zenity) and `build-deb.sh` | `bash installer/debian/install.sh --dry-run` shows the steps; `--install-deps` allows installing Git and Node.js with `sudo`; also `--executors` and `--login`. It adds `~/.local/bin` to the PATH permanently (in `~/.profile`, `~/.bashrc` and `~/.zshrc`; `--no-path` avoids it): open a new terminal afterwards. `build-deb.sh` builds the wizard's `.deb` package. |

AgentRelay is always installed as a git clone in your home folder, so `agentrelay update` keeps working.

## Option B: manual

**1. Install Node.js and Git** (check with `node --version` and `git --version`):

| System | Commands |
|---|---|
| Windows (PowerShell) | `winget install OpenJS.NodeJS.LTS` and `winget install Git.Git`; close and reopen PowerShell |
| Debian / Ubuntu | `sudo apt install git`; for Node.js use [nvm](https://github.com/nvm-sh/nvm) (no `sudo`) and `nvm install 22`, because the distribution package is usually too old |
| macOS | `brew install git node` |

**2. Download and install AgentRelay:**

```sh
cd ~          # on Windows: cd $HOME\Documents
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link
```

If `npm link` gives a permission error, do not use `sudo`: create an alias (`alias agentrelay='node ~/AgentRelay/bin/agentrelay.js'` in `~/.bashrc` or `~/.zshrc`). On Windows the command is `agentrelay.cmd` from PowerShell or cmd.

**3. Connect your ChatGPT account** (once; the browser opens):

```sh
agentrelay login
```

Without a browser (for example over SSH): `agentrelay login --device`. If you already use Codex in VS Code with your account, the session is shared and this step is already done.

**4. Check that everything is fine:**

```sh
agentrelay doctor
```

**5. Set up your orchestrator** (once per machine; it asks for confirmation and offers the optional OpenCode executor, which you can also add later with `agentrelay executors add <name>`):

```sh
agentrelay setup
```

`setup` writes the delegation instructions to `~/.claude/CLAUDE.md` and the `/ar:` commands to `~/.claude/commands/ar/`. **They are only loaded in new Claude Code sessions**: close and reopen it. If it cannot write the file, it says so clearly and exits with an error.

## Getting started

1. Open your project in VS Code with the **Claude Code** extension signed in.
2. In the project terminal: `agentrelay start` (prepares the project and checks that everything works; asks before changing anything).
3. In another terminal: `agentrelay watch`, to watch the executor work.
4. In the Claude chat, ask for the work in your own words: *"Add a function that validates emails and delegate the implementation with AgentRelay."*

Want to try it first? See ["Delegar a mano"](docs/MANUAL.md#6-delegar-a-mano-sin-orquestador) in the manual (Spanish).

## If something fails

Always start with `agentrelay doctor`: it says what is wrong and which command fixes it.

| Symptom | What to do |
|---|---|
| `agentrelay: command not found` | Repeat `npm link` in the AgentRelay folder, open a new terminal, or use the alias. |
| Executor failure | `npm install` again in the AgentRelay folder and repeat `doctor`. |
| "No session" | `agentrelay login` (or `login --device`). |
| `EBADENGINE` warnings in `npm install` | Just warnings: it works with Node 20; Node 22 avoids them. |
| OpenCode unavailable | `agentrelay executors add opencode`. |
| "not a git repository" | `agentrelay start` in the project folder. |

## Updating

`agentrelay update` does it all (download, dependencies, `setup` and `doctor`). By hand, inside the AgentRelay folder: `git pull` and `npm ci` (not `npm install`, which can rewrite `package-lock.json` and make the next `git pull` fail). Then `agentrelay doctor`:

- If it warns about outdated global instructions: `agentrelay setup` (once per machine).
- If it warns about outdated project instructions: `agentrelay init` inside the project.
- Close and reopen `agentrelay watch` and Claude Code so they use the new code.

## Uninstalling

Before deleting the folder, from inside it:

```sh
agentrelay setup --uninstall --yes     # removes the block, the /ar: commands and the Claude Code hook
npm unlink -g agentrelay               # removes the command link (Linux installer: rm ~/.local/bin/agentrelay)
rm -rf ~/.agentrelay                   # optional: settings, profiles and optional executors
```

Then delete the AgentRelay folder. Git, Node and your ChatGPT session (`~/.codex/`) are not touched. Projects where you ran `agentrelay init` keep the block in `AGENTS.md`/`CLAUDE.md` (between `<!-- agentrelay:start -->` and `<!-- agentrelay:end -->`) and the `.agentrelay/` folder; delete them by hand if you want.
