import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { getSettings } from "../lib/api";
import {
  loadCachedAppSettings,
  persistAndApplyAppSettings,
  subscribeToAppSettingsUpdates,
} from "../lib/appSettings";
import type { AppSettings } from "../types";
import MeshBackground from "./MeshBackground";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const COLLAPSED_KEY = "sidebar_collapsed";

// ─── Icons ───────────────────────────────────────────────────────────────────

function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}
function BotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function AnalyticsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  end: boolean;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", end: true, label: "Projects", icon: <BriefcaseIcon /> },
  { to: "/library", end: false, label: "Library", icon: <BotIcon /> },
  { to: "/analytics", end: false, label: "Analytics", icon: <AnalyticsIcon /> },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: "/users", end: false, label: "Users", icon: <UsersIcon /> },
  { to: "/settings", end: false, label: "Settings", icon: <SettingsIcon /> },
];

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 10px",
        borderRadius: 10,
        border: "none",
        borderLeft: active ? "2.5px solid #0a84ff" : "2.5px solid transparent",
        background: active ? "var(--glass-strong)" : "none",
        cursor: "pointer",
        color: active ? "var(--label-primary)" : "var(--label-secondary)",
        fontSize: 13.5,
        fontWeight: active ? 500 : 400,
        textAlign: "left",
        marginBottom: 1,
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "var(--hover-glass)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "none";
      }}
    >
      <span style={{ width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {item.icon}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--label-tertiary)",
        padding: "10px 12px 4px",
      }}
    >
      {label}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const [appSettings, setAppSettings] = useState<AppSettings>(loadCachedAppSettings);

  // Desktop: expanded (false) or icon-only collapsed (true)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
  });

  // Mobile: drawer open or closed
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    return subscribeToAppSettingsUpdates(setAppSettings);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    getSettings()
      .then((settings) => {
        persistAndApplyAppSettings(settings);
        // syncThemeWithDefault removed — not needed here since we use toggle
      })
      .catch(() => {
        // Best-effort refresh: keep cached settings if request fails.
      });
  }, [user]);

  void appSettings; // used for future brand customisation
  void collapsed;   // kept for future collapse support

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  void toggleCollapsed; // available for future collapse button

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Helper: is this nav item's path active?
  function isActive(item: NavItem): boolean {
    if (item.end) {
      return location.pathname === item.to;
    }
    return location.pathname.startsWith(item.to);
  }

  // ── Sidebar inner content ──
  const SidebarInner = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Brand */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "0.5px solid var(--hairline)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            T
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1.2 }}>TelaiOS</div>
            <div style={{ fontSize: 10, color: "var(--label-tertiary)" }}>v2.4</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        aria-label="Main navigation"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 8px" }}
      >
        <SectionHeader label="Workspace" />
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.to}
            item={item}
            active={isActive(item)}
            onClick={() => navigate(item.to)}
          />
        ))}

        {user?.system_role === "admin" && (
          <>
            <SectionHeader label="Administration" />
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavButton
                key={item.to}
                item={item}
                active={isActive(item)}
                onClick={() => navigate(item.to)}
              />
            ))}
          </>
        )}
      </nav>

      {/* User strip */}
      <div
        style={{
          borderTop: "0.5px solid var(--hairline)",
          padding: "8px 10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {user?.display_name?.charAt(0)?.toUpperCase() ?? "U"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--label-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user?.display_name || user?.email || "User"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--label-secondary)",
              fontSize: 14,
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-glass)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            {theme === "dark" ? "☀" : "☽"}
          </button>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--label-tertiary)",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-glass)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <MeshBackground />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gridTemplateRows: "auto 1fr",
          width: "100vw",
          height: "100vh",
          padding: 10,
          gap: 10,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar ── */}
        <nav
          className="glass-panel"
          aria-label="Application sidebar"
          style={{
            gridRow: "1 / span 2",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <SidebarInner />
        </nav>

        {/* ── Main content ── */}
        <main
          className="glass-panel"
          style={{
            gridColumn: 2,
            gridRow: "1 / span 2",
            overflow: "auto",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Demo banner */}
          {IS_DEMO && (
            <div
              role="banner"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "6px 16px",
                fontSize: 11,
                fontWeight: 500,
                background: "rgba(255, 149, 0, 0.12)",
                color: "var(--color-orange)",
                borderBottom: "0.5px solid var(--separator)",
                borderRadius: "var(--radius-glass) var(--radius-glass) 0 0",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>
                Demo mode — all data is mocked. Run{" "}
                <code style={{ fontFamily: "monospace", padding: "0 4px", borderRadius: 4, background: "rgba(255,149,0,0.10)" }}>npm run dev</code> to connect to the backend.
              </span>
            </div>
          )}

          <div
            style={{
              padding: "20px 24px",
              maxWidth: "var(--width-max)",
              margin: "0 auto",
            }}
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.30)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        aria-label="Application sidebar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100%",
          width: 260,
          zIndex: 50,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 300ms ease-out",
          background: "var(--glass-thin)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderRight: "0.5px solid var(--separator)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SidebarInner />
      </aside>
    </>
  );
}
