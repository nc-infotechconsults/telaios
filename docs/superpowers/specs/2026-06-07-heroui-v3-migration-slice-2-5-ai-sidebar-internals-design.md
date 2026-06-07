# HeroUI v3 Migration — Slice 2.5: AI Sidebar Internals

**Date:** 2026-06-07
**Status:** Draft — approved verbally via /goal, pending spec review
**Scope:** Sub-slice of Slice 2; migrates the 160-line inline AI sidebar markup in `AppShell.tsx` from glass classes to HeroUI v3 + Tailwind utilities.

---

## 0. Program context

Slice 2 (Shell) migrated the AI sidebar's outer `<aside>` wrapper to a Tailwind/HeroUI Surface but explicitly deferred its internals. This sub-slice closes that gap. After this, the entire `AppShell.tsx` is HeroUI/Tailwind — no glass classes inside it.

## 1. Context & problem

`frontend/src/components/shell/AppShell.tsx` contains the AI sidebar inline (lines ~285-445). The outer wrapper was migrated in Slice 2. Inside it remain three logical sections still using glass design classes:

| Section | Classes | Lines (approx) |
|---|---|---|
| Header (TEOS orb + title + collapse button + visibility menu trigger) | `.ai-head`, `.ai-head-title`, `.ai-orb` | 7 |
| Thread (empty state, messages, streaming indicator) | `.ai-thread`, `.ai-msg`, `.ai-msg-from`, `.ai-msg-spec`, `.ai-bubble`, `.ai-typing` | 60 |
| Input bar (textarea + send button + chip row) | `.ai-input-wrap`, `.ai-input`, `.ai-send`, `.ai-chip`, `.ai-chip-row` | 90 |

The state machinery (TEOS messages, SSE streaming, busy flag, draft, refs) is correct and stays. Only the JSX markup + styling needs to change.

## 2. Goals / non-goals

**Goals (Slice 2.5):**
1. All AI sidebar markup inside `AppShell.tsx` uses HeroUI v3 primitives + Tailwind utilities. Zero `.ai-*` glass classes remain inside the file.
2. Behaviors preserved: collapse toggle works, message thread auto-scrolls, streaming indicator + typing dots appear during `teosBusy`, send button is disabled when draft is empty or busy, textarea grows to ~140px and resets to 22px on send, suggestion chips populate the draft.
3. `tsc + vitest + vite build` all pass.

**Non-goals:**
- Anything outside the AI sidebar block.
- The standalone `frontend/src/components/AiSidebar.tsx` file (the 540-line version with sessions drawer + specialist menu + vis menu). It's unused; Slice 7 deletes.
- New features.
- The `MeshBackground.tsx` file. Slice 7.

## 3. Approach

Replace inline glass markup with HeroUI primitives + Tailwind utilities. Specifically:

- **Header.** `.ai-head` → `<header className="flex items-center gap-2.5 border-b border-separator px-4 py-3">`. The TEOS orb keeps its inline gradient (a brand-specific visual, not glass-style); convert to a small div with Tailwind utility classes mirroring the original gradient. Collapse button: HeroUI `<Button isIconOnly size="sm" variant="tertiary" aria-label="Collapse sidebar">`.
- **Thread container.** `.ai-thread` → `<div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">`. Empty state (no messages) gets a HeroUI `<div className="flex flex-col items-center justify-center gap-3 text-center text-muted py-8">` with the TEOS orb (larger) + a tagline.
- **Message bubbles.** `.ai-msg` → `<div className="flex flex-col gap-1" data-role={m.role}>`. `.ai-msg-from` → `<span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">`. `.ai-bubble` for user messages → `<div className="self-end rounded-2xl rounded-tr-sm bg-accent px-3 py-2 text-sm text-accent-foreground max-w-[85%]">`. `.ai-bubble` for assistant → `<div className="self-start rounded-2xl rounded-tl-sm bg-surface-secondary px-3 py-2 text-sm text-foreground max-w-[85%]">`. The specialist tag stays inline since it uses brand-defined per-specialist colors.
- **Typing indicator.** Replace `.ai-typing` + `<span>` dots with a small inline element using Tailwind's `animate-bounce` + staggered animation-delay via inline style. (HeroUI has a `Spinner` component but a typing indicator with three bouncing dots is more idiomatic for chat.)
- **Streaming caret.** The inline-styled blinking span (`width: 7, height: 13, background: #0a84ff, animation: blink 1s infinite`) becomes a Tailwind div: `<span className="inline-block w-[7px] h-[13px] bg-accent ml-0.5 rounded-sm animate-pulse" />`. Keep the existing `blink` keyframe if `animate-pulse` doesn't have the right cadence; otherwise use the Tailwind utility.
- **Input bar.** `.ai-input-wrap` → `<footer className="flex flex-col gap-2 border-t border-separator px-3 py-3">`. `.ai-input` row → `<div className="flex items-end gap-1.5 rounded-2xl bg-surface-secondary border border-border px-3 py-2 has-[textarea:focus]:border-accent">`. The auto-growing textarea stays as a plain `<textarea>` with Tailwind classes (HeroUI's `<TextArea>` is heavier-weight and doesn't fit this chat-style inline-grow pattern). Send button: HeroUI `<Button isIconOnly size="sm" color="accent" isDisabled={!teosDraft.trim() || teosBusy} onPress={() => sendTeosMessage(teosDraft)}><i className="fa-solid fa-paper-plane" /></Button>`.
- **Suggestion chips.** If there's a chip row for quick prompts (`.ai-chip-row`/`.ai-chip`), convert to HeroUI `<Chip>` components in a flex-wrap row.

The TEOS orb is a brand visual — preserve its gradient + glow shadow via Tailwind utilities or a small inline style. (It's defined in glass CSS today as `.ai-orb { background: var(--accent-grad); box-shadow: 0 0 0 2px ... }`.) Re-implementation: a `<span>` with Tailwind classes + a single CSS var consumption (`bg-[image:var(--accent-grad)]` or a runtime style.background).

## 4. Files touched

| Path | Action |
|------|--------|
| `frontend/src/components/shell/AppShell.tsx` | modify (replace the AI sidebar JSX block; preserve all state/refs/effects) |

Total: 1 file.

## 5. Verification

- [ ] `cd frontend && ./node_modules/.bin/tsc --noEmit` clean.
- [ ] `cd frontend && npm run test:run` 12/12 pass.
- [ ] `cd frontend && ./node_modules/.bin/vite build` clean.
- [ ] Dev server: navigate to `/projects/<id>`. AI sidebar shows TEOS header + empty state. Toggle collapse — width animates to 0. Send a message (DEMO mode auto-replies after 1.8s) — user bubble appears on the right (accent), assistant bubble on the left (surface). Typing dots animate during busy. Streaming caret blinks during stream.
- [ ] No `.ai-*` class references remain in `AppShell.tsx`.

## 6. Risk + rollback

**Risks:** *Auto-growing textarea regression* — the existing JS height adjustment (`taRef.current.style.height = "22px"; taRef.current.style.height = scrollHeight + "px"`) is unrelated to styling and continues to work. *TEOS orb visual* — the radial-gradient pseudo-element from the glass `.ai-orb` is non-trivial to reproduce in Tailwind; if the orb looks wrong, keep a small `<span className="ai-orb">` styled by the glass CSS until Slice 7. (That fallback is acceptable scoped to one visual element.)

**Rollback:** single-file revert.

## 7. Follow-ups

- Slice 4-6: page migrations.
- Slice 7: delete `index.css` glass blocks (including `.ai-*`, `.ai-orb`, `.ai-typing`, `@keyframes blink`), `MeshBackground.tsx`, the unused standalone `AiSidebar.tsx`, the legacy `@theme inline` token bridge.
