# Agent Panel Performance Optimization Plan

## Status: READY TO EXECUTE

## Overview
The Agent panel has been flagged as "performance poor and risks being not usable." A thorough audit identified 10 fixes across 9 files. All 10 fixes are approved for implementation.

## Fixes (in priority order)

### Fix 1: Throttle/batch SSE streaming updates (CRITICAL)
**File:** `ide/client/src/plugins/agent/agentStore.ts`
**Problem:** Every `message.part.updated` SSE event (dozens/sec) calls `set()`, triggering O(N) re-renders.
**Change:** Add module-level `_partBuffer: Map<string, AgentPart>` and flush every ~80ms via `setTimeout`. In the `message.part.updated` listener, push into buffer instead of calling `_addOrUpdatePart` directly. Flush applies all buffered parts in a single `setState`. On `session.idle`, flush immediately before final refresh.

### Fix 2: Hoist remarkPlugins + memoize MessageContent (CRITICAL)
**File:** `ide/client/src/plugins/agent/AgentConversation.tsx`
**Problem:** `remarkPlugins={[remarkGfm]}` creates a new array every render. `MessageContent` is not memoized.
**Change:** `const REMARK_PLUGINS = [remarkGfm] as const;` at module level. Use `REMARK_PLUGINS` in JSX. Wrap `MessageContent` in `React.memo`.

### Fix 3: Remove AnimatePresence from message list (HIGH)
**File:** `ide/client/src/plugins/agent/AgentConversation.tsx`
**Problem:** `AnimatePresence` wraps message list, doing O(N) diffing on every chunk.
**Change:** Remove `AnimatePresence` wrapper. Keep individual `motion.div` on `MessageBubble`.

### Fix 4: Defer computeMetrics to session.idle only (HIGH)
**File:** `ide/client/src/plugins/agent/agentStore.ts`
**Problem:** `_updateMessage` calls `computeMetrics()` on every event.
**Change:** Remove `computeMetrics` call from `_updateMessage`. It already runs in `session.idle`.

### Fix 5: Move duration timer to local component state (HIGH)
**Files:** `ide/client/src/plugins/agent/agentStore.ts` + `AgentMetrics.tsx`
**Problem:** `startDurationTick()` calls `setState` every 1s creating a new `metrics` object.
**Change:** Remove `startDurationTick`/`stopDurationTick`/`_durationInterval`. Add `streamingStartTime: number | null` to store. In `AgentMetrics`, use local `useState` + `useEffect` with `setInterval` to compute displayed duration.

### Fix 6: Memoize ToolCallCard + hoist animation configs (MEDIUM)
**File:** `ide/client/src/plugins/agent/ToolCallCard.tsx`
**Change:** Wrap in `React.memo`. Hoist motion animation configs to module constants. `useMemo` for `formatArgs` when expanded.

### Fix 7: Memoize SessionTab + useCallback handlers (MEDIUM)
**File:** `ide/client/src/plugins/agent/AgentSessionList.tsx`
**Change:** Wrap `SessionTab` in `React.memo`. Wrap `handleContextMenu`/`handleDelete` in `useCallback`.

### Fix 8: Fix auto-scroll during streaming (UX BUG)
**File:** `ide/client/src/plugins/agent/AgentConversation.tsx`
**Problem:** Auto-scroll depends on `messages.length` but content grows without length changing.
**Change:** Derive `lastPartCount` from store as scroll dependency, or use RAF loop while streaming.

### Fix 9: Dedup statusBar updates (MEDIUM)
**File:** `ide/client/src/plugins/agent/index.ts`
**Problem:** `subscribe` fires on every state change and calls `updateItem` even when text unchanged.
**Change:** Track `prevText` in closure, only update when changed.

### Fix 10: Minor fixes (LOW)
- **AgentPanel.tsx**: `useAgentStore((s) => s.sessions.length > 0)` instead of `s.sessions`
- **AgentOnboarding.tsx**: Remove unused `useAgentStore` import
- **AgentConversation.tsx**: Hoist motion animation config to module constants
- **AgentConversation.tsx**: Remove `isLastMessage` prop, compute inside `AgentConversation`

### Verification
`cd ide/client && bunx tsc --noEmit --pretty` must pass clean.