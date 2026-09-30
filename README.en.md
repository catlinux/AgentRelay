# AgentRelay

[Español](README.md) · **English**

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
| Executor | [Cline CLI](https://www.npmjs.com/package/cline) with any provider Cline supports (default: DeepSeek `deepseek-v4-pro`) | available |
| Orchestrator | Any agent or person able to run commands; designed for Claude Code | available (via CLI) |

The design allows adding other executors and providers later.

## Requirements

- Node.js 20 or later.
- Git. The working directory must be a git repository.
- A provider configured in Cline (for example, a DeepSeek API key).

Windows, Linux and macOS.

## Installation

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install         # also installs Cline CLI, the executor
npm link            # makes the "agentrelay" command available
```

Without `npm link` you can also use `node <path>/bin/agentrelay.js`.

Cline CLI is installed as a dependency of AgentRelay and that copy is used. It shares its configuration with the Cline extension for VS Code (`~/.cline/data`): if you already configured it, there is nothing else to do. Otherwise, configure the provider once:

```sh
npx cline auth --provider deepseek --apikey <your-api-key> --modelid deepseek-v4-pro
```

(from the AgentRelay folder)

To update later: `git pull` and `npm install` in the AgentRelay folder.

## Try AgentRelay in 5 minutes

The repository includes a small demo project (`examples/demo`) and a task for it (`examples/demo-task.json`): add a `slugify` function with its tests. It costs less than one cent with DeepSeek.

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

You will see each executor step live:

```
[00:00] ▶ Intento 1 (implement) · deepseek/deepseek-v4-pro
[00:07]   piensa: I need to add and export a `slugify(text)` function in `src/text.js`…
[00:07]   lee: ./src/text.js, ./spec/text.spec.js, ./package.json
[00:18]   edita: ./src/text.js
[00:20]   ejecuta: npm test
[00:22]   tokens 39080/1339 · 0.0056 USD
[00:25] ✔ Intento 1 completado en 23 s (done)
[00:25]   validando…
[00:26]   validación `npm test`: correcta
[00:26] ■ Estado: awaiting_review (el nivel 3 revisa siempre)
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

- `agentrelay run` and `agentrelay review` print activity to stderr as it happens (phases, files the executor reads or edits, commands it runs, its summarized reasoning, tokens, cost and validations). `--quiet` turns it off.
- `agentrelay watch` follows, from **another terminal**, runs started by another process, for example an orchestrator such as Claude Code. Without an id it follows the latest run and switches to each new one until you press Ctrl+C; with an id it shows that run and exits when it is no longer in progress.

In VS Code: open a split terminal, run `agentrelay watch` in one and work in the other or in the orchestrator's chat.

Check the environment from the repository you will work on:

```sh
agentrelay doctor
```

## Usage

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

Other commands: `agentrelay list`, `agentrelay watch [id]`, `agentrelay check [id]`, `agentrelay init` (creates `agentrelay.config.json`).

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

`agentrelay.config.json` at the repository root (optional) and `agentrelay.config.local.json` for local settings that should not be versioned. Command-line options take precedence.

```json
{
  "level": 3,
  "executor": {
    "type": "cline",
    "command": "cline",
    "provider": "deepseek",
    "model": "deepseek-v4-pro",
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

- `executor.command`: program to run; also accepts an array, e.g. `["node", "/path/to/cline"]`.
- `executor.thinking`: `none`, `low`, `medium`, `high` or `xhigh`; `null` uses the provider's default.
- `validation.commands`: commands run for every task, in addition to the task's own.
- `policy`: overrides level values, e.g. `{ "maxRetries": 3, "review": "selective", "selfReview": { "normal": "pass" } }`.

Credentials are not stored in AgentRelay's configuration: the executor manages them.

## Using Claude Code as the orchestrator

Claude Code can use AgentRelay directly from its terminal. Example instructions for your project's `CLAUDE.md`:

```markdown
## Delegation with AgentRelay
- Delegate well-scoped implementation tasks with `agentrelay run - <<'EOF' … EOF`,
  writing a JSON task with objective, files, acceptanceCriteria, validation and doNotModify.
- Read the report (diff, validations, executor report) and decide with
  `agentrelay review <id> --decision accept|fix|escalate|reject`.
- If the task is escalated, solve it yourself and close it with `--decision accept`.
```

To see live what the executor does while you talk to Claude Code, keep `agentrelay watch` open in a VS Code terminal.

## Generated files

Each run is stored in `.agentrelay/runs/<id>/` inside the repository: task, state, prompts sent, executor output (NDJSON), events (`events.ndjson`), `diff.patch` and `report.md`. The `.agentrelay/` directory ignores itself and does not show up in `git status`.

## Usage and costs

For each attempt AgentRelay records tokens, duration and the **estimated cost reported by the executor** (Cline computes it from its price tables). It is not an invoice: check real usage with your provider. AgentRelay cannot measure the orchestrator's usage.

Keep in mind that pay-per-use API access and subscriptions are different things: the executor needs access that its CLI supports.

## Security

- The executor works with **automatic tool approval** inside the repository: it can edit files and run commands. Use it on repositories you control.
- AgentRelay does not commit, stash, checkout or push, and does not touch the git index.
- By default it refuses to delegate on a repository with uncommitted changes.
- It detects whether the executor creates commits or modifies protected files.

## Limitations of version 0.0.2

- A single executor (Cline CLI). Tasks run one at a time.
- There is no VS Code panel yet: it is used from the terminal (it is on the roadmap).
- The CLI output and reports are in Spanish.
- The executor's structured report depends on the model returning it; otherwise its final text is shown. Objective data (diff, validations) is always computed by AgentRelay.
- The separate self-review pass starts a new executor session.
- Validated on Windows; Linux and macOS are supported by design but have not been tested on those systems yet.

See [TODO.md](TODO.md) and [CHANGELOG.md](CHANGELOG.md).

## Development

```sh
npm test
```

Tests use an executor simulator and do not call any model.

## Credits and license

**AgentRelay** is developed and maintained by **CatLinux**.
Copyright (C) 2026 CatLinux.

Licensed under [WNCL-CU-1.0](LICENSE): free to use for any purpose, including commercial work, and to modify and share at no cost. No one may charge for the software or its use; only support and implementation services may be paid.

Copies and forks must keep this attribution and link to https://github.com/catlinux/AgentRelay.

### Third-party material

| Component | Author | License | Link |
| --- | --- | --- | --- |
| Cline CLI (npm dependency, not included in the repository) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
