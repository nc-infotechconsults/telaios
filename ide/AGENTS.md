# IDE — AGENTS.md

## Project overview
A standalone, container-native web IDE. Each workspace is an isolated Docker container with a cloned repository mounted as a volume. The IDE server manages container lifecycles and proxies file/git operations.

## Workspace structure
```
ide/
├── client/     React 18 + Vite + HeroUI + Monaco editor (port 5174)
└── server/     Hono + Bun backend — workspace, git, db, AI routes (port 4000)
```

## Setup commands
```bash
# From ide/ directory
bun install              # install all workspaces
bun run dev              # start client + server concurrently

# Individual services
bun run client:dev       # Vite dev server on :5174
bun run server:dev       # Hono server on :4000 (bun --watch)
```

## Development without Docker
Set `DISABLE_CONTAINERS=true` in `.env` — the server will clone repos and serve files directly from `WORKSPACES_ROOT` without spinning up workspace containers. The terminal panel will not be available in this mode.

## Key environment variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | IDE server port |
| `WORKSPACES_ROOT` | `/tmp/ide-workspaces` | Where repos are cloned (server FS path) |
| `WORKSPACES_HOST_PATH` | same as ROOT | Host path for Docker bind mounts |
| `DISABLE_CONTAINERS` | `false` | Skip Docker container creation |
| `DEFAULT_CONTAINER_IMAGE` | `ghcr.io/devcontainers/base:ubuntu` | Fallback workspace image |
| `SLEEP_TIMEOUT_MINUTES` | `30` | Idle minutes before container auto-sleeps |

## Architecture
```
Browser → ide-client (:5174) → /api/* proxy → ide-server (:4000)
                                            → /ws/*  proxy → ide-server (:4000)

ide-server → Docker socket → Workspace container (one per workspace)
           → WORKSPACES_ROOT/{id}/ → git clone + file ops
```

## Adding a new API route
1. Create `server/src/routes/<name>.ts` — export a `Hono` sub-app
2. Mount it in `server/src/index.ts` via `app.route('/api/<name>', router)`
3. Add corresponding client API helpers to `client/src/lib/api.ts`

## Code style
- TypeScript strict mode everywhere
- Zod schemas for all request/response validation
- Services own business logic; routes are thin validation + delegation
- Zustand stores on the client — one store per domain (workspace, editor, git, db)
