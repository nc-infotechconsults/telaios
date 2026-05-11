# Contributing to TelaiOS

Thank you for your interest in contributing to **TelaiOS**! This document explains how to get involved, from reporting bugs to submitting code.

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

This project follows a simple golden rule: **be respectful and constructive**. Harassment, discrimination, or dismissive behaviour toward other contributors will not be tolerated.

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
- Your environment (OS, browser, Python/Bun versions, Docker Compose version).

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
| [Python](https://python.org) | 3.14 |
| [uv](https://docs.astral.sh/uv/) | latest |
| [Bun](https://bun.sh) | ≥ 1.x |
| [Docker Compose](https://docs.docker.com/compose/) | v2 |

### 1. Copy environment variables

```bash
cp server/.env.example server/.env
cp frontend/.env.example frontend/.env
# Fill in LLM API keys and other secrets
```

### 2. Start local infrastructure

```bash
docker compose -f docker-compose.dev.yml up
```

### 3. Install dependencies

```bash
cd server && uv sync
cd frontend && bun install
```

### 4. Run database migrations

```bash
cd server && uv run alembic upgrade head
```

### 5. Run the services

Use separate terminals:

```bash
# Terminal 1 — API server
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# Terminal 2 — Frontend dev server
cd frontend && bun run dev
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Server API | http://localhost:8000 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

### Subproject READMEs

Each subproject has its own `README.md` or `AGENTS.md` with service-specific details — check those before diving in.

---

## Coding Conventions

### TypeScript / React (frontend)

- Follow the existing code style; check for a local `.eslintrc` or formatting config.
- Use `async`/`await` over raw Promises.
- Prefer named exports.

### Python (server)

- Python 3.14+ — use type hints throughout.
- Follow [PEP 8](https://peps.python.org/pep-0008/) for formatting.
- Use `pydantic` models for data validation; use `pydantic-settings` for configuration.
- Write `pytest` tests for new behaviour.
- Database schema changes must always be made via new Alembic migration files — never edit existing migration files directly.

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
feat(server): add Ollama provider support
fix(frontend): handle missing project member on delete
docs: update contributing guidelines
chore: bump langchain-openai to 0.3.1
```

---

## Project Structure

| Path | Language | Purpose |
|------|----------|---------|
| `server/` | Python / FastAPI | Backend API, agent runtime, document processing |
| `frontend/` | TypeScript / React | Web application |
| `tests/` | Python | Root smoke / integration tests |
| `docs/` | Markdown | Design documents and specs |

---

## Review Process

1. A maintainer will review your PR, usually within a few business days.
2. Address review comments in follow-up commits on the same branch.
3. Once approved and CI is green, a maintainer will merge it.
4. Squash merges are preferred to keep the `main` history clean — the PR title becomes the merge commit message, so follow the commit convention above.

---

Thank you for contributing to TelaiOS!
