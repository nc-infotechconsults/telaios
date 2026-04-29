# Contributing to Telaios

Thank you for your interest in contributing to **Telaios**! This document explains how to get involved, from reporting bugs to submitting code.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Development Setup](#development-setup)
- [Coding Conventions](#coding-conventions)
- [Commit Message Convention](#commit-message-convention)
- [Project Structure](#project-structure)
- [Review Process](#review-process)

---

## Code of Conduct

This project follows a simple golden rule: **be respectful and constructive**. Harassment, discrimination, or dismissive behaviour toward other contributors will not be tolerated. If you experience or witness a problem, reach out to the maintainers.

---

## Getting Started

1. **Fork** the repository and clone your fork.
2. Set up your local development environment (see [Development Setup](#development-setup)).
3. Create a branch from `main` for your change.
4. Make your changes, write tests, and verify everything works.
5. Open a pull request against `main`.

---

## How to Contribute

### Reporting Bugs

Use the [bug report issue template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- A clear, descriptive title.
- Steps to reproduce the problem.
- What you expected to happen vs. what actually happened.
- Relevant logs, screenshots, or error messages.
- Your environment (OS, browser, Node/Python/Bun versions, Docker Compose version).

### Suggesting Features

Use the [feature request issue template](.github/ISSUE_TEMPLATE/feature_request.yml). Describe:

- The problem you are trying to solve or the value it adds.
- Your proposed solution or approach.
- Any alternatives you have considered.

### Submitting Pull Requests

- Open an issue first for non-trivial changes so the approach can be discussed before you invest time coding.
- Keep PRs focused — one logical change per PR.
- Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely.
- Make sure all CI checks pass before requesting review.
- Link the PR to the relevant issue (use `Closes #<issue-number>` in the description).

---

## Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | ≥ 1.x |
| [Python](https://python.org) | 3.12 |
| [Docker Compose](https://docs.docker.com/compose/) | v2 |

### 1. Copy environment variables

```bash
cp .env.example .env
# Fill in LLM API keys and other secrets
```

### 2. Start local infrastructure

```bash
bun run docker:dev   # starts PostgreSQL, Redis, MinIO
```

### 3. Install dependencies

```bash
bun install
bun run apps:install      # installs JS workspace deps
bun run agent:install     # installs Python agent-service deps
```

### 4. Run the services

```bash
bun run data:dev       # data-api  → http://localhost:3000
bun run agent:dev      # agent-service → http://localhost:8000
bun run frontend:dev   # frontend  → http://localhost:5173
```

### Subproject READMEs

Each service has its own `README.md` or `AGENTS.md` with service-specific details — check those before diving in.

---

## Coding Conventions

### TypeScript / JavaScript (frontend, data-api)

- Follow the existing code style; check for a local `.eslintrc` or formatting config in each sub-package.
- Use `async`/`await` over raw Promises.
- Prefer named exports.
- Never edit existing database migration files — always create a new migration file for schema changes.

### Python (agent-service)

- Python 3.12+ — use type hints throughout.
- Follow [PEP 8](https://peps.python.org/pep-0008/) for formatting.
- Use `pydantic` models for data validation; use `pydantic-settings` for configuration.
- Write `pytest` tests for new behaviour.

### General

- Do not commit secrets, API keys, or credentials.
- Do not remove or weaken existing tests.
- Update documentation when you change behaviour or add features.

---

## Commit Message Convention

We use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting / whitespace (no logic change) |
| `refactor` | Code restructuring without changing behaviour |
| `test` | Adding or updating tests |
| `chore` | Build scripts, dependency bumps, tooling |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration changes |

**Examples:**

```
feat(agent-service): add Ollama provider support
fix(data-api): handle missing project member on delete
docs: update contributing guidelines
chore: bump langchain-openai to 0.3.1
```

---

## Project Structure

| Path | Language | Purpose |
|------|----------|---------|
| `frontend/` | TypeScript / React | Web application |
| `data-api/` | TypeScript / Bun | REST API + database |
| `agent-service/` | Python | LLM planning & agent execution |
| `packages/shared/` | TypeScript | Shared utilities |
| `tests/` | TypeScript | Root smoke / integration tests |
| `docs/` | Markdown | Design documents and specs |

---

## Review Process

1. A maintainer will review your PR, usually within a few business days.
2. Address review comments in follow-up commits on the same branch.
3. Once approved and CI is green, a maintainer will merge it.
4. Squash merges are preferred to keep the `main` history clean — the PR title becomes the merge commit message, so follow the commit convention above.

---

Thank you for contributing to Telaios! 🎉
