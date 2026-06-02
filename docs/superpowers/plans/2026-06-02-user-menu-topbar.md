# User Menu Topbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move user identity + actions into a topbar dropdown (option C: avatar + name + role + chevron), relocate the workspace chip to the sidebar bottom, and remove the old sidebar user row from both layouts.

**Architecture:** All changes are inline edits to `ProjectLayout.tsx` and `OperatorLayout.tsx`. A new `userMenuOpen` boolean state drives the topbar dropdown in each layout. The workspace chip in `ProjectLayout` is cut from its current position (below the brand) and pasted at the sidebar bottom in place of the user row. `OperatorLayout` gets only the topbar dropdown + user row removal (no workspace chip to move).

**Tech Stack:** React 18, TypeScript, existing `AuthContext` (`useAuth`), existing `ThemeContext` (`useTheme`), existing CSS classes (`glass`, `vis-backdrop`, `sb-row`, `tb-btn`).

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/ProjectLayout.tsx` | Add `userMenuOpen` state; destructure `setTheme`; replace `tb-avatar` div with user button + dropdown; cut workspace switcher from sidebar top; paste it at sidebar bottom; delete user row |
| `frontend/src/pages/operator/OperatorLayout.tsx` | Import `useTheme`; add `userMenuOpen` state; replace `tb-avatar` div with user button + dropdown; delete user row |

---

## Task 1: ProjectLayout — add state + update `useTheme` destructuring

**Files:**
- Modify: `frontend/src/components/ProjectLayout.tsx:101,123`

- [ ] **Step 1: Add `setTheme` to the `useTheme` destructure (line 101)**

Find:
```tsx
const { theme, toggle: toggleTheme } = useTheme();
```

Replace with:
```tsx
const { theme, toggle: toggleTheme, setTheme } = useTheme();
```

(`toggleTheme` is still referenced in the sidebar user row and must stay until Task 3 removes that row.)

- [ ] **Step 2: Add `userMenuOpen` state (after `switcherOpen` state, around line 123)**

Find:
```tsx
const [switcherOpen, setSwitcherOpen] = useState(false);
```

Replace with:
```tsx
const [switcherOpen, setSwitcherOpen] = useState(false);
const [userMenuOpen, setUserMenuOpen] = useState(false);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProjectLayout.tsx
git commit -m "refactor(layout): add userMenuOpen state, swap to setTheme"
```

---

## Task 2: ProjectLayout — replace topbar avatar with user button + dropdown

**Files:**
- Modify: `frontend/src/components/ProjectLayout.tsx:554`

- [ ] **Step 1: Replace the static `tb-avatar` div with the interactive user menu**

Find (line 554):
```tsx
          <div className="tb-avatar">{userInitials}</div>
```

Replace with:
```tsx
          {/* User menu */}
          <div style={{ position: "relative" }}>
            <button
              className="tb-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 4px", borderRadius: 8, height: 32 }}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0,
              }}>
                {userInitials}
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, textAlign: "left" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{user?.display_name ?? "User"}</span>
                <span style={{ fontSize: 10, color: "var(--fg-3)", textTransform: "capitalize" }}>{user?.system_role ?? "member"}</span>
              </div>
              <Icon name="chevd" size="sm" style={{ color: "var(--fg-3)", fontSize: 10, transform: userMenuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
            </button>

            {userMenuOpen && (
              <>
                <div className="vis-backdrop" onClick={() => setUserMenuOpen(false)} />
                <div
                  className="glass"
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    width: 240, borderRadius: 10, border: "0.5px solid var(--hairline)",
                    boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden",
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: "14px 14px 12px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>
                      {userInitials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.display_name ?? "User"}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{user?.email ?? ""}</div>
                    </div>
                  </div>
                  {/* Account settings */}
                  <div style={{ padding: 4 }}>
                    <button
                      className="sb-row"
                      style={{ width: "100%", borderRadius: 7, padding: "8px 10px", gap: 8 }}
                      onClick={() => { setUserMenuOpen(false); window.location.href = "/settings"; }}
                    >
                      <Icon name="settings" size="sm" />
                      <span>Account settings</span>
                    </button>
                  </div>
                  {/* Theme */}
                  <div style={{ padding: "0 4px 4px", borderTop: "0.5px solid var(--hairline)", paddingTop: 4 }}>
                    <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name="spark" size="sm" style={{ color: "var(--fg-3)" }} />
                      <span style={{ flex: 1, fontSize: 13 }}>Theme</span>
                      <div style={{
                        display: "flex", background: "var(--glass-weak)",
                        border: "0.5px solid var(--hairline)", borderRadius: 6,
                        overflow: "hidden", fontSize: 11,
                      }}>
                        <button
                          style={{
                            padding: "3px 10px", border: "none", fontSize: 11, cursor: "pointer",
                            fontWeight: theme === "light" ? 600 : 400,
                            background: theme === "light" ? "var(--glass)" : "transparent",
                            color: theme === "light" ? "var(--fg)" : "var(--fg-3)",
                            borderRight: "0.5px solid var(--hairline)",
                          }}
                          onClick={() => setTheme("light")}
                        >
                          Light
                        </button>
                        <button
                          style={{
                            padding: "3px 10px", border: "none", fontSize: 11, cursor: "pointer",
                            fontWeight: theme === "dark" ? 600 : 400,
                            background: theme === "dark" ? "var(--glass)" : "transparent",
                            color: theme === "dark" ? "var(--fg)" : "var(--fg-3)",
                          }}
                          onClick={() => setTheme("dark")}
                        >
                          Dark
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Logout */}
                  <div style={{ padding: "0 4px 4px", borderTop: "0.5px solid var(--hairline)", paddingTop: 4 }}>
                    <button
                      className="sb-row"
                      style={{ width: "100%", borderRadius: 7, padding: "8px 10px", gap: 8, color: "#ff375f" }}
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                    >
                      <Icon name="arrow" size="sm" style={{ transform: "rotate(180deg)" }} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProjectLayout.tsx
git commit -m "feat(layout): add user menu dropdown in topbar"
```

---

## Task 3: ProjectLayout — move workspace chip to sidebar bottom, remove user row

**Files:**
- Modify: `frontend/src/components/ProjectLayout.tsx:319-386,456-500`

- [ ] **Step 1: Remove the workspace switcher block from its current position**

Find and delete the entire block (lines 319–386). It starts after `<div className="sb-brand">` closes and before `<div className="sb-section">`:

```tsx
          {/* Workspace switcher */}
          <div style={{ position: "relative" }}>
            <button
              className="workspace-switch"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: 0 }}
              onClick={() => setSwitcherOpen((v) => !v)}
            >
              <div className="ws-avatar" style={{ background: projectColor }}>
                {wsView ? "T" : projectName.charAt(0).toUpperCase()}
              </div>
              <div className="ws-meta">
                <b>{wsView ? "TelaiOS" : projectName}</b>
                <span>{wsView ? "Admin Console" : "Switch workspace"}</span>
              </div>
              <div className="ws-arrows">
                <Icon name="chevd" size="sm" style={{ transform: switcherOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
              </div>
            </button>

            {switcherOpen && (
              <>
                <div className="vis-backdrop" style={{ zIndex: 90 }} onClick={() => setSwitcherOpen(false)} />
                <div
                  className="glass"
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                    borderRadius: 10, border: "0.5px solid var(--hairline)",
                    boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden",
                  }}
                >
                  <button
                    className="sb-row"
                    style={{ width: "100%", borderRadius: 0, padding: "9px 12px", gap: 8 }}
                    data-active={!!wsView}
                    onClick={() => { setSwitcherOpen(false); window.location.href = "/"; }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name="settings" size="sm" style={{ color: "#fff", fontSize: 10 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>Admin Console</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>Workspace governance</div>
                    </div>
                  </button>
                  {sidebarProjects.length > 0 && (
                    <div style={{ borderTop: "0.5px solid var(--hairline)", padding: "4px 0" }}>
                      {sidebarProjects.map((p) => (
                        <button
                          key={p.id}
                          className="sb-row"
                          style={{ width: "100%", borderRadius: 0, padding: "7px 12px", gap: 8 }}
                          data-active={projectId === p.id && !wsView}
                          onClick={() => { setSwitcherOpen(false); window.location.href = `/projects/${p.id}`; }}
                        >
                          <span className="proj-dot" style={{ background: p.color, width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5 }}>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
```

- [ ] **Step 2: Remove the now-unused `toggle: toggleTheme` alias from the `useTheme` destructure**

Find:
```tsx
const { theme, toggle: toggleTheme, setTheme } = useTheme();
```

Replace with:
```tsx
const { theme, setTheme } = useTheme();
```

- [ ] **Step 3: Replace the user row with the workspace switcher at the sidebar bottom**

Find (lines ~474–499 after the previous edit shifts line numbers slightly):
```tsx
            {/* User row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 4px" }}>
              <div
                style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0,
                }}
              >
                {userInitials}
              </div>
              <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.display_name || user?.email || "User"}
              </span>
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                style={{ padding: 4, borderRadius: 6, color: "var(--fg-3)", fontSize: 13 }}
              >
                {theme === "dark" ? "☀" : "☽"}
              </button>
              <button onClick={logout} title="Log out" style={{ padding: 4, borderRadius: 6, color: "var(--fg-3)" }}>
                <Icon name="arrow" size="sm" style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
```

Replace with the workspace switcher block (paste the exact block deleted in Step 1 — the `{/* Workspace switcher */}` comment + `<div style={{ position: "relative" }}>...</div>`):

```tsx
            {/* Workspace switcher */}
            <div style={{ position: "relative" }}>
              <button
                className="workspace-switch"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                onClick={() => setSwitcherOpen((v) => !v)}
              >
                <div className="ws-avatar" style={{ background: projectColor }}>
                  {wsView ? "T" : projectName.charAt(0).toUpperCase()}
                </div>
                <div className="ws-meta">
                  <b>{wsView ? "TelaiOS" : projectName}</b>
                  <span>{wsView ? "Admin Console" : "Switch workspace"}</span>
                </div>
                <div className="ws-arrows">
                  <Icon name="chevd" size="sm" style={{ transform: switcherOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
                </div>
              </button>

              {switcherOpen && (
                <>
                  <div className="vis-backdrop" style={{ zIndex: 90 }} onClick={() => setSwitcherOpen(false)} />
                  <div
                    className="glass"
                    style={{
                      position: "absolute", bottom: "calc(100% + 6px)", top: "auto", left: 0, right: 0,
                      borderRadius: 10, border: "0.5px solid var(--hairline)",
                      boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden",
                    }}
                  >
                    <button
                      className="sb-row"
                      style={{ width: "100%", borderRadius: 0, padding: "9px 12px", gap: 8 }}
                      data-active={!!wsView}
                      onClick={() => { setSwitcherOpen(false); window.location.href = "/"; }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                        background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon name="settings" size="sm" style={{ color: "#fff", fontSize: 10 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Admin Console</div>
                        <div style={{ fontSize: 11, color: "var(--fg-3)" }}>Workspace governance</div>
                      </div>
                    </button>
                    {sidebarProjects.length > 0 && (
                      <div style={{ borderTop: "0.5px solid var(--hairline)", padding: "4px 0" }}>
                        {sidebarProjects.map((p) => (
                          <button
                            key={p.id}
                            className="sb-row"
                            style={{ width: "100%", borderRadius: 0, padding: "7px 12px", gap: 8 }}
                            data-active={projectId === p.id && !wsView}
                            onClick={() => { setSwitcherOpen(false); window.location.href = `/projects/${p.id}`; }}
                          >
                            <span className="proj-dot" style={{ background: p.color, width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} />
                            <span style={{ fontSize: 12.5 }}>{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
```

> **Note:** The dropdown now uses `bottom: "calc(100% + 6px)"` instead of `top` so it opens upward from the sidebar bottom.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProjectLayout.tsx
git commit -m "feat(layout): move workspace chip to sidebar bottom, remove user row"
```

---

## Task 4: OperatorLayout — topbar user button + dropdown, remove user row

**Files:**
- Modify: `frontend/src/pages/operator/OperatorLayout.tsx`

- [ ] **Step 1: Add `useTheme` import**

Find:
```tsx
import { useAuth } from "../../context/AuthContext";
```

Replace with:
```tsx
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
```

- [ ] **Step 2: Add `useTheme` destructure + `userMenuOpen` state inside the component**

Find:
```tsx
  const { user, logout } = useAuth();
  const [view, setView] = useState<OperatorView>("overview");
  const [mode, setMode] = useState<OperatorMode>("saas");
```

Replace with:
```tsx
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<OperatorView>("overview");
  const [mode, setMode] = useState<OperatorMode>("saas");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
```

- [ ] **Step 3: Remove the sidebar user row**

Find and delete the entire user row block (lines ~158–202):
```tsx
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px 4px",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {userInitials}
              </div>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "var(--fg-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.display_name || user?.email || "Operator"}
              </span>
              <button
                onClick={logout}
                title="Log out"
                style={{ padding: 4, borderRadius: 6, color: "var(--fg-3)" }}
              >
                <Icon name="arrow" size="sm" style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
```

- [ ] **Step 4: Replace the topbar `tb-avatar` div with the user button + dropdown**

Find (lines ~264–269):
```tsx
          <div
            className="tb-avatar"
            style={{ background: "linear-gradient(135deg, #ff9f0a, #ff375f)" }}
          >
            {userInitials}
          </div>
```

Replace with:
```tsx
          {/* User menu */}
          <div style={{ position: "relative" }}>
            <button
              className="tb-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 4px", borderRadius: 8, height: 32 }}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 600, color: "#fff", flexShrink: 0,
              }}>
                {userInitials}
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, textAlign: "left" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{user?.display_name ?? "Operator"}</span>
                <span style={{ fontSize: 10, color: "var(--fg-3)", textTransform: "capitalize" }}>{user?.system_role ?? "operator"}</span>
              </div>
              <Icon name="chevd" size="sm" style={{ color: "var(--fg-3)", fontSize: 10, transform: userMenuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
            </button>

            {userMenuOpen && (
              <>
                <div className="vis-backdrop" onClick={() => setUserMenuOpen(false)} />
                <div
                  className="glass"
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    width: 240, borderRadius: 10, border: "0.5px solid var(--hairline)",
                    boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden",
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: "14px 14px 12px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>
                      {userInitials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.display_name ?? "Operator"}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{user?.email ?? ""}</div>
                    </div>
                  </div>
                  {/* Account settings */}
                  <div style={{ padding: 4 }}>
                    <button
                      className="sb-row"
                      style={{ width: "100%", borderRadius: 7, padding: "8px 10px", gap: 8 }}
                      onClick={() => { setUserMenuOpen(false); window.location.href = "/settings"; }}
                    >
                      <Icon name="settings" size="sm" />
                      <span>Account settings</span>
                    </button>
                  </div>
                  {/* Theme */}
                  <div style={{ padding: "0 4px 4px", borderTop: "0.5px solid var(--hairline)", paddingTop: 4 }}>
                    <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name="spark" size="sm" style={{ color: "var(--fg-3)" }} />
                      <span style={{ flex: 1, fontSize: 13 }}>Theme</span>
                      <div style={{
                        display: "flex", background: "var(--glass-weak)",
                        border: "0.5px solid var(--hairline)", borderRadius: 6,
                        overflow: "hidden", fontSize: 11,
                      }}>
                        <button
                          style={{
                            padding: "3px 10px", border: "none", fontSize: 11, cursor: "pointer",
                            fontWeight: theme === "light" ? 600 : 400,
                            background: theme === "light" ? "var(--glass)" : "transparent",
                            color: theme === "light" ? "var(--fg)" : "var(--fg-3)",
                            borderRight: "0.5px solid var(--hairline)",
                          }}
                          onClick={() => setTheme("light")}
                        >
                          Light
                        </button>
                        <button
                          style={{
                            padding: "3px 10px", border: "none", fontSize: 11, cursor: "pointer",
                            fontWeight: theme === "dark" ? 600 : 400,
                            background: theme === "dark" ? "var(--glass)" : "transparent",
                            color: theme === "dark" ? "var(--fg)" : "var(--fg-3)",
                          }}
                          onClick={() => setTheme("dark")}
                        >
                          Dark
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Logout */}
                  <div style={{ padding: "0 4px 4px", borderTop: "0.5px solid var(--hairline)", paddingTop: 4 }}>
                    <button
                      className="sb-row"
                      style={{ width: "100%", borderRadius: 7, padding: "8px 10px", gap: 8, color: "#ff375f" }}
                      onClick={() => { setUserMenuOpen(false); logout(); }}
                    >
                      <Icon name="arrow" size="sm" style={{ transform: "rotate(180deg)" }} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/operator/OperatorLayout.tsx
git commit -m "feat(operator): user menu dropdown in topbar, remove sidebar user row"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify ProjectLayout (project or workspace view)**

Open http://localhost:5173 (or configured port). Check:

1. Topbar shows `[avatar] [name] [role] [▾]` button at the right edge
2. Clicking it opens the dropdown with user header, Account settings, Theme toggle, Log out
3. Theme toggle switches between Light and Dark (segments reflect current state)
4. Log out calls logout and redirects to login
5. Clicking outside the dropdown (backdrop) closes it
6. The workspace chip is at the **bottom** of the sidebar (below inbox/members/settings in project mode, or below admin nav in workspace mode)
7. Workspace chip dropdown opens **upward** and still lists Admin Console + projects
8. No user row remains anywhere in the sidebar

- [ ] **Step 3: Verify OperatorLayout**

Navigate to `/operator`. Check:

1. Topbar shows orange-gradient `[avatar] [name] [role] [▾]` button
2. Dropdown opens with the same structure (orange avatar gradient in header)
3. Theme toggle works
4. Log out works
5. No user row at the bottom of the sidebar (only the "Exit Operator" button remains)

- [ ] **Step 4: Final commit if any polish fixes were made**

```bash
git add -p
git commit -m "fix(layout): user menu polish"
```
