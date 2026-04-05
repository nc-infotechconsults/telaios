import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";

function BriefcaseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: "/", end: true, label: "Projects", icon: <BriefcaseIcon /> },
  { to: "/agents", end: false, label: "Agent Profiles", icon: <BotIcon /> },
  { to: "/settings", end: false, label: "Settings", icon: <SettingsIcon /> },
];

export default function Layout() {
  const location = useLocation();
  const { theme, toggle } = useTheme();

  const isFullHeight =
    location.pathname.includes("/projects/") ||
    location.pathname.includes("/execute");

  const isSettings = location.pathname.startsWith("/settings");

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* Demo mode banner */}
      {IS_DEMO && (
        <div
          className="shrink-0 flex items-center justify-center gap-2 bg-warning/15 border-b border-warning/30 px-4 py-1.5 text-xs font-medium text-warning"
          role="banner"
          aria-label="Demo mode active"
        >
          <span aria-hidden="true">🎭</span>
          <span>
            Demo mode — all data is mocked. Run{" "}
            <code className="font-mono bg-warning/10 px-1 rounded">npm run dev</code> to connect to the backend.
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar ── */}
        <aside
          className="w-56 shrink-0 flex flex-col border-r border-divider bg-content1"
          aria-label="Application sidebar"
        >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-divider shrink-0">
          <span className="text-primary text-xl leading-none" aria-hidden="true">⚙</span>
          <span className="font-bold text-sm leading-snug tracking-tight">
            SWE AI<br />Platform
          </span>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.icon}
                  <span>{item.label}</span>
                  {isActive && <span className="sr-only">(current page)</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer: theme toggle + version */}
        <div className="px-3 py-3 border-t border-divider shrink-0 flex items-center justify-between gap-2">
          <span className="text-xs text-default-300 pl-2">v0.1</span>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-default-500 hover:bg-default-100 hover:text-foreground transition-colors"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main
        className={
          isFullHeight
            ? "flex-1 overflow-hidden"
            : "flex-1 overflow-y-auto"
        }
      >
        {isFullHeight ? (
          <Outlet />
        ) : (
          <div className={`${isSettings ? "w-full px-8 py-8" : "max-w-6xl mx-auto px-8 py-8"}`}>
            <Outlet />
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

