# HeroUI v3 Migration — Slice 2.5 Implementation Plan (AI Sidebar Internals)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 148-line inline AI sidebar JSX block in `AppShell.tsx` (lines 285-432) with HeroUI v3 primitives + Tailwind utilities. State machinery is preserved untouched.

**Architecture:** Single-file atomic edit. The AI sidebar's outer `<aside>` was migrated in Slice 2; this slice replaces the 5 sub-sections inside (header, session meta, thread, input bar, sessions drawer) with HeroUI/Tailwind. The TEOS orb is a brand visual preserved via inline `style.background = "var(--accent-grad)"` (the bridge still emits `--accent-grad` post-Slice-3 for legacy consumers; safe to read here too).

**Tech Stack:** HeroUI v3 (`Button`, `Chip`, `Avatar`), Tailwind v4 utilities.

**Spec:** `docs/superpowers/specs/2026-06-07-heroui-v3-migration-slice-2-5-ai-sidebar-internals-design.md`

---

## File Structure

| Path | Action |
|------|--------|
| `frontend/src/components/shell/AppShell.tsx` | modify (replace lines 285-432 JSX block; preserve all state/refs/effects above it) |

---

## Task 1: Pre-flight

- [ ] **Step 1: Verify baseline.**
  ```bash
  git log --oneline -3 && git status
  cd frontend && ./node_modules/.bin/tsc --noEmit && npm run test:run 2>&1 | tail -5
  ```
  Expected: latest commits include the Slice 2.5 spec; tsc clean; 12/12 vitest.

- [ ] **Step 2: Confirm `--accent-grad` still emitted post-Slice-3.**
  ```bash
  grep -n 'accent-grad' frontend/src/lib/appSettings.ts
  ```
  Expected: one match (`s.setProperty("--accent-grad", …)`) inside `applyAppSettingsToDocument`. The TEOS orb reads this.

---

## Task 2: Replace the AI sidebar JSX block

**Files:**
- Modify: `frontend/src/components/shell/AppShell.tsx` (lines 285-432)

- [ ] **Step 1: Add a CSS variable for the TEOS orb's gradient if not already present.** The bridge keeps emitting `--accent-grad`. No additional CSS needed.

- [ ] **Step 2: Replace the entire AI sidebar block.** Find the block starting at `{!wsView && <aside` (Slice 2's outer wrapper, line ~285) and ending at `</aside>}` (line ~433). Keep the outer `<aside>` element with its existing Tailwind classes — only the **children** change.

  Replace the children (lines 291-432) with the following JSX. (The new code re-uses local state: `teosMessages`, `teosBusy`, `teosDraft`, `teosStreamContent`, `taRef`, `threadRef`, `showSessions`, `setShowSessions`, `setAiCollapsed`, `setTeosMessages`, `setTeosDraft`, `sendTeosMessage`, `SPECIALISTS`. All already declared above in the file.)

  ```tsx
  {/* Header */}
  <header className="flex items-center gap-2.5 border-b border-separator px-4 py-3">
    <span
      aria-hidden
      className="block size-[18px] shrink-0 rounded-full"
      style={{
        background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))",
        boxShadow: "0 0 0 2px rgba(10,132,255,0.18), 0 0 12px rgba(191,90,242,0.5)",
      }}
    />
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="text-[13.5px] font-semibold text-foreground">TEOS</span>
      <span className="text-[10.5px] text-muted">Always-on assistant</span>
    </div>
    <div className="ms-auto flex items-center gap-1">
      <Button isIconOnly size="sm" variant="tertiary" aria-label="Sessions" onPress={() => setShowSessions(true)}>
        <Icon name="inbox" size="sm" />
      </Button>
      <Button isIconOnly size="sm" variant="tertiary" aria-label="New session" onPress={() => setTeosMessages([])}>
        <Icon name="plus" size="sm" />
      </Button>
      <Button isIconOnly size="sm" variant="tertiary" aria-label="Hide sidebar" onPress={() => setAiCollapsed(true)}>
        <Icon name="chev" size="sm" />
      </Button>
    </div>
  </header>

  {/* Session meta */}
  <div className="flex items-center gap-2 border-b border-separator px-4 py-2 text-[11.5px] text-muted">
    <Button size="sm" variant="tertiary" className="h-7 gap-1.5 px-2 text-[11.5px]" aria-label="Visibility">
      <Icon name="users" size="sm" />
      <span>Team</span>
      <Icon name="chevd" size="sm" className="opacity-60" />
    </Button>
    <div className="flex items-center">
      <Avatar size="sm" className="size-5 bg-success text-success-foreground ring-2 ring-surface -me-1.5">
        <Avatar.Fallback>EN</Avatar.Fallback>
      </Avatar>
      <Avatar size="sm" className="size-5 bg-accent text-accent-foreground ring-2 ring-surface">
        <Avatar.Fallback>SO</Avatar.Fallback>
      </Avatar>
    </div>
    <span>2 active</span>
  </div>

  {/* Thread */}
  <div ref={threadRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
    {teosMessages.length === 0 && (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-muted">
        <span
          aria-hidden
          className="block size-7 rounded-full"
          style={{
            background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))",
            boxShadow: "0 0 0 2px rgba(10,132,255,0.18), 0 0 12px rgba(191,90,242,0.5)",
          }}
        />
        <div className="mt-3 text-sm font-semibold text-foreground">How can I help?</div>
        <p className="mt-1 max-w-[280px] text-xs text-muted">
          I'll route to the right specialist — Designer, Planner, Reviewer, Coder, Explorer, Reverse Engineer or Q&amp;A — based on what you ask.
        </p>
      </div>
    )}
    {teosMessages.map((m, i) => {
      const spec = m.specialist ? SPECIALISTS[m.specialist] : null;
      const isUser = m.role === "user";
      return (
        <div key={i} className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
          <div className="flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {isUser ? "You" : "TEOS"}
            {!isUser && spec && (
              <span className="flex items-center gap-1" style={{ color: spec.color }}>
                <Icon name={spec.icon} size="sm" />
                {spec.name}
              </span>
            )}
          </div>
          <div
            className={
              isUser
                ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                : "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-secondary px-3.5 py-2 text-sm text-foreground"
            }
          >
            {m.text}
          </div>
        </div>
      );
    })}
    {teosBusy && (
      <div className="flex flex-col items-start gap-1">
        <div className="px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">TEOS</div>
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-secondary px-3.5 py-2 text-sm text-foreground">
          {teosStreamContent ? (
            <>
              {teosStreamContent}
              <span className="ms-0.5 inline-block h-3 w-[7px] rounded-sm bg-accent align-baseline animate-pulse" />
            </>
          ) : (
            <span className="inline-flex items-center gap-1 py-1">
              <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
      </div>
    )}
  </div>

  {/* Input bar */}
  <footer className="flex flex-col gap-2 border-t border-separator px-3 py-3">
    <div className="flex flex-wrap gap-1.5">
      {["How does auth work?", "Plan a new feature", "Review this code"].map((s, i) => (
        <Chip
          key={i}
          size="sm"
          variant="secondary"
          className="cursor-pointer"
          onClick={() => sendTeosMessage(s)}
        >
          {s}
        </Chip>
      ))}
    </div>
    <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface-secondary px-3 py-2 focus-within:border-accent">
      <textarea
        ref={taRef}
        value={teosDraft}
        placeholder="Ask TEOS or describe a task…"
        onChange={(e) => setTeosDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendTeosMessage(teosDraft);
          }
        }}
        className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        style={{ height: 22, maxHeight: 140 }}
      />
      <Button
        isIconOnly
        size="sm"
        color="accent"
        isDisabled={!teosDraft.trim() || teosBusy}
        onPress={() => sendTeosMessage(teosDraft)}
        aria-label="Send message"
      >
        <Icon name="send" size="sm" />
      </Button>
    </div>
  </footer>

  {/* Sessions drawer */}
  {showSessions && (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-separator px-4 py-3">
        <Icon name="inbox" size="sm" />
        <span className="text-[13.5px] font-semibold text-foreground">Sessions</span>
        <div className="flex-1" />
        <Button isIconOnly size="sm" variant="tertiary" aria-label="Close sessions" onPress={() => setShowSessions(false)}>
          <Icon name="chev" size="sm" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        {[
          { id: "s-1", title: "Ship SSO via Okta — end-to-end",      time: "now",     visibility: "team",    specs: ["explorer", "planner"] },
          { id: "s-2", title: "Redesign the billing dashboard",       time: "1h ago",  visibility: "team",    specs: ["designer"] },
          { id: "s-3", title: "How does our refresh-token flow work?", time: "2d ago", visibility: "private", specs: ["qa"] },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setTeosMessages([]); setShowSessions(false); }}
            className="mb-1.5 flex w-full flex-col gap-1.5 rounded-xl border border-border bg-surface-secondary px-3 py-2.5 text-start hover:border-accent"
          >
            <div className="flex items-baseline gap-2">
              <span className="flex-1 truncate text-[13px] font-medium text-foreground">{s.title}</span>
              <span className="text-[10.5px] text-muted">{s.time}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.specs.map((sp) => {
                const specialist = SPECIALISTS[sp as keyof typeof SPECIALISTS];
                if (!specialist) return null;
                return (
                  <span
                    key={sp}
                    className="inline-flex items-center gap-1 rounded-md bg-default px-1.5 py-0.5 text-[10.5px]"
                    style={{ color: specialist.color }}
                  >
                    <Icon name={specialist.icon} size="sm" />
                    {specialist.name}
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  )}
  ```

  The outer `<aside>` already has `relative` semantics (Tailwind defaults to `static`, but `overflow-hidden` + `flex flex-col` already on it provide the containment). Add `relative` to the outer `<aside>` className so the sessions drawer's `absolute inset-0` positions correctly:

  ```diff
  -<aside
  -  aria-label="TEOS AI assistant"
  -  className={`row-span-2 col-start-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface transition-[width,opacity] duration-300 ${
  +<aside
  +  aria-label="TEOS AI assistant"
  +  className={`relative row-span-2 col-start-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface transition-[width,opacity] duration-300 ${
  ```

- [ ] **Step 3: Type-check.**
  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean. Common issues: `Avatar.Fallback` not exported (use `Avatar` standalone with text inside instead); `Chip` not accepting `onClick` (wrap in a Button or use `as="button"`). Fix per HeroUI's exact API as needed.

- [ ] **Step 4: vitest + build.**
  ```bash
  npm run test:run 2>&1 | tail -5
  ./node_modules/.bin/vite build 2>&1 | tail -5
  ```
  Expected: 12/12 vitest pass; build clean.

- [ ] **Step 5: Browser smoke.**
  Boot dev server. Navigate to `/projects/<some-id>` (any project).
  - AI sidebar renders on the right.
  - Empty state shows TEOS orb + "How can I help?" + tagline.
  - Click a suggestion Chip → message appears as user bubble (right, accent bg) → typing dots appear briefly → assistant bubble appears (left, surface bg).
  - Type in textarea → Send button enables.
  - Click Sessions icon → drawer slides over the thread with 3 session rows.
  - Click "Hide" chevron → sidebar collapses (width animates to 0). Re-open via whatever toggle exists.

- [ ] **Step 6: Confirm no glass classes remain.**
  Run: `grep -nE 'ai-head|ai-thread|ai-msg|ai-input|ai-send|ai-chip|ai-empty|ai-orb|ai-typing|sessions-drawer|session-row|session-title|spec-trail|vis-btn|vis-wrap|vis-chev|tm-avatar|tm-online|participants-stack|session-meta' frontend/src/components/shell/AppShell.tsx`
  Expected: empty (no matches).

- [ ] **Step 7: Commit.**
  ```bash
  git add frontend/src/components/shell/AppShell.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): migrate AI sidebar internals to HeroUI v3 + Tailwind

  Replaces the 148-line inline glass JSX block in AppShell.tsx (header,
  session meta with visibility pill + participants avatars, message
  thread with empty state + streaming caret + typing dots, input bar
  with suggestion chips + textarea + send, sessions drawer) with
  HeroUI primitives (Button, Chip, Avatar) and Tailwind utilities.

  The TEOS orb retains its --accent-grad gradient via inline style
  (the appSettings bridge still emits the var for the gradient
  visual — it's a brand element, not glass styling).

  All AI sidebar state, refs, effects, and the sendTeosMessage flow
  are preserved untouched. The standalone glass index.css classes
  (.ai-*, .session-*, .tm-*, .vis-*, .spec-trail-*, .participants-stack)
  are no longer referenced from AppShell — Slice 7 deletes them from
  index.css.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Memory update

- [ ] Append to `~/.claude/projects/-Users-nicocardone-Desktop-DEV-PERSONALI-telaios/memory/project_heroui_v3_migration.md` a Slice 2.5 completion note (or update the existing Slice 2 entry).

---

## Verification checklist

- [ ] tsc clean
- [ ] vitest 12/12 pass
- [ ] vite build clean
- [ ] Browser: AI sidebar renders, empty state + message thread + input + sessions drawer all functional
- [ ] No `.ai-*`/`.session-*`/`.tm-*`/`.vis-*`/`.spec-trail-*`/`.participants-stack` glass classes in `AppShell.tsx`
- [ ] Memory updated
