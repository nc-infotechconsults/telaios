# AgentScope IDE

A standalone, container-native web IDE built from scratch. Open any Git repository or S3 bucket in an isolated workspace container and develop directly in your browser — on desktop or mobile.

## Features (Phase 1)

- **Monaco editor** — syntax highlighting for 70+ languages, multi-tab editing
- **File explorer** — create, rename, delete, move files and folders
- **Git workspace** — open any Git repository via URL
- **Container isolation** — each workspace runs in its own Docker container
- **DevContainer support** — respects `.devcontainer/devcontainer.json`
- **Auto-sleep** — idle containers pause automatically and resume on reconnect
- **Mobile-friendly** — responsive layout with bottom tab navigation

## Quick start

### Local development (no Docker required)

```bash
cp .env.example .env
# Set DISABLE_CONTAINERS=true in .env for local dev without Docker
bun install
bun run dev
```

Open http://localhost:5174

### Docker

```bash
cp .env.example .env
# Edit WORKSPACES_HOST_PATH to an absolute path on your host
docker compose up -d
```

Open http://localhost:5174

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| UI components | HeroUI + Tailwind CSS v4 |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| State management | Zustand |
| Panel layout | `react-resizable-panels` |
| Backend | Hono + Bun |
| Container management | Dockerode |
| Git operations | simple-git |
| File watching | chokidar |
| S3 workspace | `Bun.S3Client` (built-in) |

## Optional platform integration

When running alongside the full `swe-ai-platform`, set these env vars to enable AI agent context:

```env
PLATFORM_API_URL=http://localhost:3000
AGENT_SERVICE_URL=http://localhost:8000
PLATFORM_JWT_SECRET=<same as platform>
```

## Roadmap

- **Phase 2** — Integrated terminal (xterm.js + docker exec), Git panel (diff, commit, branch graph)
- **Phase 3** — S3 workspace source, DevContainer Features, file outline, Quick Open (Cmd+P)
- **Phase 4** — Database client (PostgreSQL, MySQL, MongoDB, Redis, SQLite)
- **Phase 5** — AI panel (chat, explain, edit), agent trace, PWA
