# Workspace Settings — Design Spec
**Date:** 2026-06-02

## Problem

Settings are currently managed at the project level (`ProjectSettings`), but most settings apply to the entire organisation (integrations, AI model, knowledge indexing, branding, etc.). This breaks uniformity across projects and makes it impossible to enforce consistent policies.

## Decision

Move all settings management to the workspace (organisation) level. Delete `ProjectSettings`. `WorkspaceSettings` becomes the single settings surface, structured as a sidebar-nav panel — the same UX pattern already used by `ProjectSettings`.

## Architecture

### Files changed
- **`frontend/src/pages/workspace/WorkspaceSettings.tsx`** — rewritten with full sidebar-nav settings panel (8 sections)
- **`frontend/src/pages/project/ProjectSettings.tsx`** — deleted
- **`frontend/src/components/ProjectLayout.tsx`** — remove `settings` from `bottomNav`, `ProjectView` type, import, and `renderView` switch case

### No route changes
`/settings` already maps to `wsView="settings"` in `main.tsx`.

## WorkspaceSettings Sections

| Section | Content |
|---------|---------|
| Branding | Brand name, brand color (existing API-backed fields) |
| Appearance | Dark mode default, accent color, glass blur, density, reduce motion, AI sidebar default |
| TEOS assistant | Auto-route toggle, handover dividers, preferred specialist, default session visibility, auto-title, citations, active model, reasoning effort |
| Notifications | DND toggle, quiet hours schedule, per-event-type matrix (in-app / email / digest) |
| Knowledge sources | Auto re-index schedule, chunk size, embedding model, path exclusion globs |
| Integrations | All connected services (GitHub, GitLab, Bitbucket, Figma, Notion, Confluence, Google Drive, Linear, Slack, Okta) |
| Keyboard | Key scheme selector, shortcut reference list |
| Privacy & data | Session learning, telemetry, session retention period, export/delete actions |

## Extensibility

`SetRow` accepts an optional `scope?: "workspace" | "project"` prop (defaults to `"workspace"`). Currently unused in rendering — reserved for future per-project override UI. No restructuring required when project-level customisation is added.

## What is NOT in scope

- Account/profile section → being moved to top-bar menu in a separate session
- Billing → already at `/billing`
- Security / SSO → already at `/security`
- People → already at `/people`
