# AgentRelay

<div align="center">

**Build**

[![Windows](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-windows.yml?branch=main&label=Windows&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-windows.yml) [![Linux](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-linux.yml?branch=main&label=Linux&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-linux.yml) [![macOS](https://img.shields.io/github/actions/workflow/status/catlinux/AgentRelay/ci-macos.yml?branch=main&label=macOS&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/actions/workflows/ci-macos.yml)

**Agents**

![Orquestador](https://img.shields.io/badge/orchestrator-Claude%20Code-D97757?style=flat-square&labelColor=24292f) ![Ejecutor](https://img.shields.io/badge/default%20executor-Codex%20%2B%20GPT--6%20Luna-10A37F?style=flat-square&labelColor=24292f) ![Ejecutor opcional](https://img.shields.io/badge/optional%20executor-Cline-6E56CF?style=flat-square&labelColor=24292f)

**Project**

![Versión](https://img.shields.io/github/package-json/v/catlinux/AgentRelay?label=version&color=e8590c&style=flat-square&labelColor=24292f) [![Licencia](https://img.shields.io/badge/license-WNCL--CU--1.0-0969da?style=flat-square&labelColor=24292f)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&labelColor=24292f) [![Último commit](https://img.shields.io/github/last-commit/catlinux/AgentRelay?label=last%20commit&style=flat-square&labelColor=24292f)](https://github.com/catlinux/AgentRelay/commits/main)

</div>

[Español](README.md) · **English** · [Installation guide](INSTALL.en.md) · [User manual (Spanish)](docs/MANUAL.md)

Cross-platform orchestrator of AI agents for software development. A powerful model (the **orchestrator**, for example Claude Code) thinks, plans and reviews; a cheaper AI (the **executor**) writes the code. AgentRelay is the bridge: it hands over the task, checks the result with your tests and returns it to the orchestrator to decide.

You spend less of the expensive model without losing supervision.

> **Status:** version 0.1.0 (MVP). The interface may change before 1.0.0.

## How it works

```
you ──request──▶ orchestrator ──task──▶ AgentRelay ──▶ executor (writes the code)
                     ▲                      │
                     │                      ├─ runs your tests
                     │                      ├─ if they fail, the executor fixes it (max. 2 times)
                     └───── report ◀────────┘
                  accept · fix · take over · reject
```

AgentRelay never commits or pushes: changes stay in your folder for you to review.

## Executors

| Executor | What it uses | Cost |
|---|---|---|
| **Codex** (default, bundled) | Your ChatGPT account, GPT-6 Luna model | Included in the free plan |
| **OpenCode** (optional) | OpenCode free models | Free |
| **Cline** (optional) | Any provider with an API key (e.g. DeepSeek) | Whatever the provider charges |

Switch between them with a single command: `agentrelay use` (interactive) or `agentrelay use opencode`.

## Requirements

- Node.js 20 or later and Git.
- A ChatGPT account (the free one works) for Codex, or the executor you prefer.
- Windows, Linux or macOS (macOS untested: see [Limitations](#limitations)).

## Installation

Step-by-step guide for each system: **[INSTALL.en.md](INSTALL.en.md)**. In short:

```sh
git clone https://github.com/catlinux/AgentRelay.git
cd AgentRelay
npm install
npm link            # makes the "agentrelay" command available
agentrelay setup    # prepares Claude Code and connects your ChatGPT account
```

## Get started in 3 steps

```sh
cd my-project
agentrelay start    # 1. prepares the project and checks everything works
agentrelay watch    # 2. (in another terminal) watch the executor work
```

3. In your orchestrator's chat, ask for what you want in plain language. It delegates, reviews and reports back.

To switch AI: `agentrelay use`. To see where you are: `agentrelay status`. If something fails: `agentrelay doctor`.

**Everything else, with examples: [User manual](docs/MANUAL.md)** (in Spanish; the commands and examples are the same).

## Security

- The executor works with **automatic approval** inside the repository: it can edit files and run commands. Use it on repositories you control.
- AgentRelay does not commit, stash, checkout or push, and does not touch the git index.
- It refuses to delegate with uncommitted changes, and detects whether the executor creates commits or touches protected files.
- Credentials are not stored in AgentRelay: each executor manages its own.

## Limitations

- Tasks run one at a time.
- There is no VS Code panel yet: it is used from the terminal and from the orchestrator's chat.
- Tested on Windows and Linux (Debian). **macOS is untested: we do not have a Mac.** If you use it on macOS, please open a [GitHub issue](https://github.com/catlinux/AgentRelay/issues) telling us whether it worked, with your macOS version, Node version (`node --version`) and the output of `agentrelay doctor`.

Roadmap and changes: [TODO.md](TODO.md) and [CHANGELOG.md](CHANGELOG.md) (in Spanish).

## Development

```sh
npm test
```

Tests use executor simulators and never call a model. Continuous integration (`.github/workflows/`) runs them on Windows, Linux and macOS with several Node versions.

## Credits and license

**AgentRelay** is developed and maintained by **CatLinux**.
Copyright (C) 2026 CatLinux.

Licensed under [WNCL-CU-1.0](LICENSE): free to use for any purpose, including commercial work, and to modify and share at no cost. No one may charge for the software or its use; only support and implementation services may be paid.

Copies and forks must keep this attribution and link to https://github.com/catlinux/AgentRelay.

### Third-party material

| Component | Author | License | Link |
| --- | --- | --- | --- |
| Cline CLI (optional executor; installed from `agentrelay use`) | Cline Bot Inc. | Apache-2.0 | https://github.com/cline/cline |
| Codex CLI (npm dependency, not included in the repository) | OpenAI | Apache-2.0 | https://github.com/openai/codex |
