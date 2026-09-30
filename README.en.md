# AgentRelay

[![Windows](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-windows.yml?branch=main&label=Windows)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-windows.yml) [![Linux](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-linux.yml?branch=main&label=Linux)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-linux.yml) [![macOS](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-macos.yml?branch=main&label=macOS)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-macos.yml) [![License](https://img.shields.io/badge/license-WNCL--CU--1.0-blue)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933) ![Version](https://img.shields.io/github/package-json/v/catlinux/AgentRelay) [![Last commit](https://img.shields.io/github/last-commit/catlinux/AgentRelay)](https://github.com/catlinux/AgentRelay/commits/main) ![Ejecutor](https://img.shields.io/badge/default%20executor-Codex%20%2B%20GPT--6%20Luna-black)

[Español](README.md) · **English** · [Installation guide](INSTALL.en.md)

Cross-platform AI agent orchestrator for software development. It lets a high-capability model (the **orchestrator**) delegate concrete tasks to a cheaper agent (the **executor**), validate the result objectively and review it before accepting it.

The goal is to reduce premium model usage without giving up supervision: the orchestrator plans, decides and validates; the executor implements.

> **Status:** version 0.0.2, working prototype. The interface may change before 0.1.0.

## How it works

```
orchestrator ──task──▶ AgentRelay ──▶ executor (implements)
                          │
                          ├─ objective validations (tests, build, lint…)
                          ├─ automatic correction when they fail (bounded retries)
                          ├─ executor self-review (depending on level and task)
                          ▼
             report: diff, files, validations, executor report, usage
                          │
orchestrator ◀────────────┘  accept · fix · escalate · reject
```

1. The orchestrator describes a self-contained task (objective, acceptance criteria, validation commands…).
2. AgentRelay hands it to the executor, which works directly on the repository.
3. AgentRelay computes the diff, runs the validations and checks that protected files were not touched.
4. If something fails, the executor receives the errors and corrects them, up to the retry limit.
5. Depending on the level, the executor reviews its own work (self-review).
6. The result ends up **accepted**, **awaiting review** or **escalated** to the orchestrator.
7. The orchestrator reviews and decides: accept (with a final validation), request a fix, take the task over, or reject it.

AgentRelay never commits, stashes or pushes: changes stay in the working tree for you to review.

## Available integrations

| Role | Integration | Status |
|---|---|---|
| Executor (default) | OpenAI's [Codex CLI](https://github.com/openai/codex) using your ChatGPT account session, no API key; model `gpt-6-luna`, included in the free plan | available |
| Executor | [Cline CLI](https://www.npmjs.com/package/cline) with any provider Cline supports (e.g. DeepSeek `deepseek-v4-pro`) | available |
| Orchestrator | Any agent or person able to run commands; designed for Claude Code | available (via CLI) |

The design allows adding other executors and providers later.

## Requirements

- Node.js 20 or later (22 or later is recommended: with Node 20, Cline warns that it cannot read the system certificate store; this only matters on networks with corporate or self-signed certificates).
- Git. The working directory must be a git repository.
- A ChatGPT account (the free one is enough) for the default executor, Codex. With Cline as the executor, a configured provider instead (for example, a DeepSeek API key).

Windows, Linux and macOS (macOS untested: see [Limitations](#limitations-of-version-002)).

## Installation

> **Step-by-step guide for Windows, Linux and macOS: [INSTALL.en.md](INSTALL.en.md).** What follows is a summary.

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install         # also installs Codex CLI, the default executor
npm link            # makes the "agentrelay" command available
agentrelay login    # connect your ChatGPT account (the browser opens)
```

Without `npm link` you can also use `node <path>/bin/agentrelay.js`.

`agentrelay login` is done once. If you already use Codex in VS Code with your account, the session is shared and it is not needed. On a machine without a browser (for example over SSH), use `agentrelay login --device`: it shows a code you enter from another device. `agentrelay doctor` checks that the session is active, and `agentrelay run` stops before starting, with a clear message, if there is none.

The Codex copy is installed as a dependency of AgentRelay and is used before any other you may have on the `PATH` or in the VS Code extension.

**Optional executors.** `npm install` installs only the core and Codex: it is light and has no vulnerability warnings. Other executors are installed when you want them, in a folder of your user (`~/.agentrelay/executors`), never inside AgentRelay's folder, so updates do not affect them:

```sh
agentrelay executors               # lists executors, which ones are installed and which one is in use
agentrelay executors add cline     # installs Cline (DeepSeek or other providers with an API key)
```

`agentrelay setup` also offers to install them (or `agentrelay setup --executors cline`, without questions). When Cline is installed, AgentRelay shows the command to configure its provider; if you already use the Cline extension in VS Code, it shares its configuration (`~/.cline/data`) and nothing else is needed. To use it, set `{ "executor": { "type": "cline" } }` in `agentrelay.config.local.json`.

To update later, in the AgentRelay folder: `git pull` and then `npm ci` (it installs exactly the versions in `package-lock.json` without changing it; `npm install` may rewrite it and make the next `git pull` fail). If `git pull` says your local changes to `package-lock.json` would be overwritten, discard them with `git checkout -- package-lock.json` (npm regenerates them; you lose nothing) and run `git pull` again. If you had `agentrelay watch` open, stop it (Ctrl+C) and start it again so it uses the new code. There is no need to repeat `init` or `setup` unless the CHANGELOG says so.

## Try AgentRelay in 5 minutes

The repository includes a small demo project (`examples/demo`) and a task for it (`examples/demo-task.json`): add a `slugify` function with its tests. With the default executor (Codex and GPT-6 Luna, ChatGPT free plan) there is no per-token cost.

**1. Create a copy of the demo as a git repository** (outside the AgentRelay folder).

PowerShell (Windows):

```powershell
$AR = "C:\path\to\AgentRelay"
Copy-Item -Recurse "$AR\examples\demo" "$HOME\agentrelay-demo"
cd "$HOME\agentrelay-demo"
git init
git add -A
git commit -m "demo"
```

Bash (Linux/macOS/Git Bash):

```sh
AR=/path/to/AgentRelay
cp -r "$AR/examples/demo" ~/agentrelay-demo
cd ~/agentrelay-demo
git init && git add -A && git commit -m "demo"
```

**2. Check the environment:**

```sh
agentrelay doctor
```

**3. Delegate the task and watch it work.** In PowerShell:

```powershell
agentrelay run "$AR\examples\demo-task.json"
```

In Bash: `agentrelay run "$AR/examples/demo-task.json"`.

You will see each executor step live, with the time of each line and the actions summarised in plain language:

```
12:00:00  ▶ Ejecución 20261001-100000-ab12 · nivel 3 (equilibrado)
  Añadir una función slugify con sus tests

12:00:00  ▶ Intento 1 (implementación) · gpt-6-luna
12:00:07    · lee src/text.js
12:00:18    ✎ edita: src/text.js
12:00:20    · ejecuta los tests
12:00:22    · tokens: 39,1 mil entrada · 1,3 mil salida
12:00:23  ✔ Intento 1 completado en 23 s (done)
12:00:23    · validando…
12:00:26    · validación `npm test`: correcta
12:00:26  ■ Listo para tu revisión (el nivel 3 revisa siempre)
  Siguiente paso: agentrelay review 20261001-100000-ab12 --decision accept|fix|escalate|reject
```

(The CLI output is currently in Spanish.) When it finishes, the full report is printed: diff, validations and executor report.

**4. Review and decide.** Look at the changes with `git diff` or in your editor, then:

```sh
agentrelay review <id> --decision fix --feedback "slugify must throw TypeError when it does not receive a string"
agentrelay review <id> --decision accept
```

The `<id>` appears on the first line of the run and in `agentrelay list`. With `fix` you will see the executor correct its work live; `accept` re-runs the validations before accepting.

**5. Try another level:** `agentrelay run <task> --level 4` adds a self-review in a second run; `--level 1` accepts automatically when validations pass. First commit or discard the changes from the previous test (`git stash -u`, `git checkout .` or a commit), because AgentRelay needs a clean repository.

## Watching the work live

- `agentrelay run` and `agentrelay review` print activity to stderr as it happens (phases, files the executor reads or edits, what it runs, its summarized reasoning, tokens, cost and validations), with the local time on every line. It uses colours when the terminal supports them; they are turned off by the `NO_COLOR` environment variable or when the output is redirected to a file. `--quiet` turns it off.
- `agentrelay watch` follows, from **another terminal**, runs started by another process, for example an orchestrator such as Claude Code. Without an id it follows the latest run and switches to each new one until you press Ctrl+C; with an id it shows that run and exits when it is no longer in progress.

In VS Code: open a split terminal, run `agentrelay watch` in one and work in the other or in the orchestrator's chat.

Check the environment from the repository you will work on:

```sh
agentrelay doctor
```

Set up your orchestrator once:

```sh
agentrelay setup
```

## Usage

**Who writes what.** In normal use you talk to your orchestrator (for example, Claude Code in VS Code) and ask for the work in plain language; the orchestrator writes the JSON task and runs `agentrelay`. For it to know how, run `agentrelay setup` once and, in each project, `agentrelay init` (see ["Preparing the orchestrator and projects"](#preparing-the-orchestrator-and-projects)). The steps below describe what happens underneath and also let you use AgentRelay by hand, for example to try it out.

### 1. Describe the task

A JSON file (see [`examples/demo-task.json`](examples/demo-task.json)):

```json
{
  "title": "Add slugify to the text utilities",
  "objective": "Add and export slugify(text) in src/text.js.",
  "complexity": "normal",
  "files": ["src/text.js", "test/text.test.js"],
  "acceptanceCriteria": ["slugify('Hello World') returns 'hello-world'"],
  "validation": ["npm test"],
  "doNotModify": ["package.json"]
}
```

| Field | Description |
|---|---|
| `objective` | Required. What must be achieved. |
| `title` | Short title (defaults to the first line of the objective). |
| `context` | Relevant context for the executor. |
| `type` | `feature`, `fix`, `refactor`, `docs`, `test`… (informative). |
| `complexity` | `trivial`, `normal` (default) or `complex`. Affects self-review and review. |
| `files` | Affected files or areas. |
| `constraints` | Constraints. |
| `acceptanceCriteria` | Acceptance criteria. |
| `validation` | Validation commands (run from the repository root). |
| `doNotModify` | Files that must not change; an entry ending in `/` protects a directory. |
| `selfReview` | Forces the self-review mode: `none`, `inline` or `pass`. |

### 2. Delegate

```sh
agentrelay run task.json
# or through standard input:
agentrelay run - < task.json
```

Progress goes to stderr and the report to stdout (`--json` for structured output). The repository must be clean; `--allow-dirty` allows delegating with pending changes (they will be part of the diff).

### 3. Review

```sh
agentrelay show                    # report of the latest run
agentrelay review <id> --decision accept
agentrelay review <id> --decision fix --feedback "The empty case returns null; it must return ''"
agentrelay review <id> --decision escalate    # the orchestrator takes the task over
agentrelay review <id> --decision reject
```

- `accept` first runs a **final validation**; if it fails, the run is not accepted (unless `--force`).
- `fix` sends the feedback to the executor, validates again and leaves the task awaiting review again. It counts as a retry.
- `escalate` marks the task for the orchestrator to solve. It can later be validated with `agentrelay check <id>` and accepted with `accept`.

Other commands: `agentrelay list`, `agentrelay watch [id]`, `agentrelay check [id]`, `agentrelay setup` and `agentrelay init` (see below).

Exit codes: `0` success, `1` error, `2` task escalated.

## Orchestration levels

| Level | Name | Orchestrator review | Retries | Automatic correction | Self-review (trivial / normal / complex) |
|---|---|---|---|---|---|
| 1 | Maximum savings | only on failures or serious signals | 3 | yes | none / none / inline |
| 2 | Savings | selective (when there are risk signals) | 2 | yes | none / inline / pass |
| 3 | Balanced *(default)* | always | 2 | yes | none / inline / pass |
| 4 | Quality | always; requires validations | 1 | yes | inline / pass / pass |
| 5 | Maximum supervision | always; requires validations | 1 | no: failures go to the orchestrator | inline / pass / pass |

Choose it with `level` in the configuration or `--level` per run.

**Risk signals** (selective review): complex task, no validations, more than 5 changed files, or issues reported by the executor. **Serious signals** (also at level 1): the executor made no changes, created commits or has questions, or the level requires validations and the task has none.

More steps do not automatically mean more quality: every phase has a cost, and AgentRelay tries objective validations first, then executor self-review, and orchestrator review only when needed.

## Executor self-review

- **none**: the executor implements and returns the result.
- **inline**: the implementation prompt includes a self-review checklist (criteria, validations, obvious errors, unnecessary files). No extra runs.
- **pass**: additionally, once validations pass, a second run receives the diff and validation results, reviews the work and fixes what it finds.

The separate pass is skipped when redundant: no changes, or a small change (depending on the level) already covered by passing validations.

Self-review does not replace the orchestrator's review: the executor checks whether it did what it was asked; the orchestrator checks whether the solution solves the problem and meets the criteria.

## Retries and escalation

- If validations fail or the executor ends with an error, AgentRelay sends it the errors to correct (levels 1-4), up to the retry limit.
- If the executor reports it is blocked or asks for escalation, the task is escalated without further retries.
- When retries run out, the task is **escalated**: the orchestrator takes it over.
- Fixes requested by the orchestrator (`fix`) share the same limit (`--force` allows one more attempt).

## Configuration

All configuration can be done in text files with **comments** (`//` and `/* */`) and trailing commas (JSON with comments). There are three places, from lowest to highest priority:

| File | Purpose |
|---|---|
| `~/.agentrelay/config.json` (or `AGENTRELAY_HOME/config.json`) | **Your personal settings**, valid in every project: executor, model, reasoning effort (`thinking`), level, timeouts. |
| `agentrelay.config.json` at the repository root (optional) | Project-specific things: validation commands, policy, level. It can be versioned. |
| `agentrelay.config.local.json` (optional) | Local project settings that should not be versioned. |

Command-line options take precedence over all of them.

```sh
agentrelay config init            # creates your personal file, explained option by option
agentrelay config init --project  # creates the project one
agentrelay config                 # shows the effective configuration and where each value comes from
agentrelay config path            # shows where the files are and which exist
```

The file created by `config init` contains **every option commented out** with its explanation, valid values and default: uncomment only what you want to change, and whatever you leave commented keeps following the default even if it changes in future versions. AgentRelay validates the values with clear messages and warns about typos ("did you mean `model`?").

Default values:

```json
{
  "level": 3,
  "executor": {
    "type": "codex",
    "command": "codex",
    "provider": null,
    "model": "gpt-6-luna",
    "thinking": null,
    "timeoutSeconds": 1200,
    "extraArgs": []
  },
  "validation": {
    "commands": [],
    "timeoutSeconds": 600
  },
  "policy": {},
  "report": { "maxDiffChars": 60000, "maxOutputChars": 4000 }
}
```

- `executor.type`: `codex` (default) or `cline`. Choosing one applies its defaults for `command`, `provider` and `model` (for `cline`: `cline`, `deepseek`, `deepseek-v4-pro`), which you can override.
- `executor.command`: program to run; also accepts an array, e.g. `["node", "/path/to/cline"]`.
- `executor.thinking`: `none`, `low`, `medium`, `high` or `xhigh`; `null` uses the provider's default.
- `validation.commands`: commands run for every task, in addition to the task's own.
- `policy`: overrides level values, e.g. `{ "maxRetries": 3, "review": "selective", "selfReview": { "normal": "pass" } }`.

Credentials are not stored in AgentRelay's configuration: the executor manages them.

### Using Codex (ChatGPT account)

It is the default executor and works with your ChatGPT account session, without pay-per-use API access. AgentRelay uses the copy installed with it (`@openai/codex`) and, if it is missing, looks for one on the `PATH` and finally in the one bundled with the OpenAI extension for VS Code. Connect your account once with `agentrelay login`. To use another model your account offers, change it in `agentrelay.config.local.json`:

```json
{ "executor": { "model": "gpt-5.5" } }
```

The available models depend on your account; `agentrelay doctor` shows the executor, the model and the session. Codex works in its `workspace-write` sandbox: it can write inside the repository but not outside it. To use Cline, set `"type": "cline"`.

## Preparing the orchestrator and projects

AgentRelay can set up the instructions the orchestrator needs, so you do not paste anything by hand in each project. Today it is designed for Claude Code.

**Once, when installing:**

```sh
agentrelay setup
```

After asking for confirmation, it adds a block delimited by `<!-- agentrelay:start -->` … `<!-- agentrelay:end -->` markers to Claude Code's global instructions file (`~/.claude/CLAUDE.md`). That way, in any project, Claude knows it can delegate with AgentRelay and that it should prepare the project with `agentrelay init` when needed. It only touches what is between the markers and can be removed with `agentrelay setup --uninstall`. Without an interactive terminal, add `--yes`.

**In each project:**

```sh
agentrelay init
```

- Adds the block with the delegation instructions to the project's `CLAUDE.md`. If the file does not exist it is created; if it exists, the block is appended without touching anything else, and running it again only updates what is between the markers. You can add your own instructions in the same file.
- If the repository was clean, it offers to commit only that file (AgentRelay needs a repository without pending changes to delegate).
- If the folder is **not a git repository**, it prepares one: it shows what it will do and which files will be included, and after your confirmation runs `git init`, creates a `.gitignore` with secret patterns (`.env`, keys, `wp-config.php`…) if there was none, and makes a first commit. It never modifies an existing `.gitignore` and never pushes. It warns if the folder looks served publicly by a web server (`/var/www`, `public_html`…), because `.agentrelay/` must not be reachable from the Internet.
- `--with-config` also creates `agentrelay.config.json`.

Claude can run `agentrelay init` for you when it detects the project is not prepared; without an interactive terminal it needs `--yes` (it will ask you for confirmation first in the conversation).

Note: `CLAUDE.md` is usually versioned. If the repository is public, the AgentRelay block will be visible in it.

To see live what the executor does while you talk to the orchestrator, keep `agentrelay watch` open in a VS Code terminal.

## Generated files

Each run is stored in `.agentrelay/runs/<id>/` inside the repository: task, state, prompts sent, executor output (NDJSON), events (`events.ndjson`), `diff.patch` and `report.md`. The `.agentrelay/` directory ignores itself and does not show up in `git status`.

## Usage and costs

For each attempt AgentRelay records tokens, duration and the **estimated cost reported by the executor** (Cline computes it from its price tables; Codex reports no cost, so only tokens are recorded). It is not an invoice: check real usage with your provider. AgentRelay cannot measure the orchestrator's usage.

Keep in mind that pay-per-use API access and subscriptions are different things: the executor needs access that its CLI supports.

## Security

- The executor works with **automatic tool approval** inside the repository: it can edit files and run commands. Use it on repositories you control.
- AgentRelay does not commit, stash, checkout or push, and does not touch the git index.
- By default it refuses to delegate on a repository with uncommitted changes.
- It detects whether the executor creates commits or modifies protected files.

## Limitations of version 0.0.2

- Two executors: Codex CLI (bundled, default) and Cline CLI (optional). Codex has been tested on Windows only. Tasks run one at a time.
- There is no VS Code panel yet: it is used from the terminal (it is on the roadmap).
- The CLI output and reports are in Spanish.
- The executor's structured report depends on the model returning it; otherwise its final text is shown. Objective data (diff, validations) is always computed by AgentRelay.
- The separate self-review pass starts a new executor session.
- Validated on Windows; Linux has been tested on Debian with Node 20 (the Codex executor, on Windows only so far). **macOS is untested: we do not have a Mac.** If you use it on macOS, we would really appreciate your feedback: open an [issue on GitHub](https://github.com/catlinux/AgentRelay/issues) telling us whether it worked or what failed, and include your macOS version, your Node version (`node --version`) and the output of `agentrelay doctor`.

See [TODO.md](TODO.md) and [CHANGELOG.md](CHANGELOG.md).

## Development

```sh
npm test
```

Tests use an executor simulator and do not call any model.

**Continuous integration** (GitHub Actions, `.github/workflows/` folder) installs AgentRelay with `npm ci` and runs the tests on Windows, Linux (x64 and arm64, and several distributions) and macOS (Apple Silicon and Intel) with Node 20, 22, 24 and the latest version. It cannot check the ChatGPT sign-in or a real delegation, which require an account.

## Credits and license

**AgentRelay** is developed and maintained by **CatLinux**.
Copyright (C) 2026 CatLinux.

Licensed under [WNCL-CU-1.0](LICENSE): free to use for any purpose, including commercial work, and to modify and share at no cost. No one may charge for the software or its use; only support and implementation services may be paid.

Copies and forks must keep this attribution and link to https://github.com/catlinux/AgentRelay.

### Third-party material

| Component | Author | License | Link |
| --- | --- | --- | --- |
| Cline CLI (optional executor; installed with `agentrelay executors add cline`) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
| Codex CLI (npm dependency, not included in the repository) | OpenAI | Apache-2.0 | https://github.com/openai/codex |
