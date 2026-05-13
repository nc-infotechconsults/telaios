import { useState, useEffect, useCallback } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { getSettings } from "../lib/api";
import {
  loadCachedAppSettings,
  persistAndApplyAppSettings,
  subscribeToAppSettingsUpdates,
} from "../lib/appSettings";
import type { AppSettings } from "../types";
import { TelaiOSLogo } from "./common/TelaiOSLogo.tsx";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const COLLAPSED_KEY = "sidebar_collapsed";

// ─── Icons ───────────────────────────────────────────────────────────────────

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}
function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: "/", end: true, label: "Projects", icon: <BriefcaseIcon /> },
  { to: "/library", end: false, label: "Library", icon: <BotIcon /> },
  {
    to: "/analytics",
    end: false,
    label: "Analytics",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

// ─── Collapsed tooltip ────────────────────────────────────────────────────────

function CollapsedTooltip({ label }: { label: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <span
      className="absolute inset-0"
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {pos && (
        <span
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateY(-50%)", zIndex: 9999 }}
          className="px-2 py-1 rounded-md text-xs font-medium bg-foreground text-background whitespace-nowrap shadow-md pointer-events-none"
        >
          {label}
        </span>
      )}
    </span>
  );
}

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

function SideNavLink({
  to, end, label, icon, collapsed, onClick,
}: {
  to: string; end: boolean; label: string; icon: React.ReactNode; collapsed: boolean; onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl text-sm font-medium transition-colors relative
        ${collapsed ? "justify-center px-0 py-2.5 mx-1" : "px-3 py-2.5"}
        ${isActive
          ? "bg-primary/10 text-primary"
          : "text-default-500 hover:bg-default-100 hover:text-foreground"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="shrink-0">{icon}</span>
          {!collapsed && <span>{label}</span>}
          {!collapsed && isActive && <span className="sr-only">(current page)</span>}
          {collapsed && <CollapsedTooltip label={label} />}
        </>
      )}
    </NavLink>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle, syncThemeWithDefault } = useTheme();
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
        syncThemeWithDefault(settings.default_theme === "light" ? "light" : "dark");
      })
      .catch(() => {
        // Best-effort refresh: keep cached settings if request fails.
      });
  }, [syncThemeWithDefault, user]);

  const brandName = appSettings.brand_name.trim() || "TelaiOS";

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

  const isFullHeight =
    location.pathname.includes("/projects/") ||
    location.pathname.includes("/execute");

  const sidebarWidth = collapsed ? "w-14" : "w-56";

  // ── Sidebar content (shared between drawer and desktop) ──
  const SidebarContent = ({ onClose }: { onClose?: () => void }) => {
    // Mobile drawer is always fully expanded regardless of desktop collapse state
    const isExpanded = !!onClose;
    const effectiveCollapsed = isExpanded ? false : collapsed;

    return (
    <div className="flex flex-col h-full">
      {/* Mobile close button */}
      {onClose && (
        <div className="flex items-center justify-end h-10 px-2 shrink-0 md:hidden">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-lg text-default-400 hover:bg-default-100 hover:text-foreground transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <SideNavLink
            key={item.to}
            {...item}
            collapsed={effectiveCollapsed}
            onClick={onClose}
          />
        ))}
        {user?.system_role === "admin" && (
          <SideNavLink
            to="/users"
            end={false}
            label="Users"
            icon={<UsersIcon />}
            collapsed={effectiveCollapsed}
            onClick={onClose}
          />
        )}
        {user?.system_role === "admin" && (
          <SideNavLink
            to="/settings"
            end={false}
            label="Settings"
            icon={<SettingsIcon />}
            collapsed={effectiveCollapsed}
            onClick={onClose}
          />
        )}
      </nav>

      {/* Desktop collapse toggle */}
      <div className="px-2 py-2 border-t border-divider shrink-0 hidden md:block">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex items-center gap-2 w-full rounded-xl px-2 py-2 text-xs text-default-400 hover:bg-default-100 hover:text-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          {collapsed ? <ChevronRightIcon /> : <><ChevronLeftIcon /><span>Collapse</span></>}
        </button>
      </div>
    </div>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* Demo banner */}
      {IS_DEMO && (
        <div className="shrink-0 flex items-center justify-center gap-2 bg-warning/15 border-b border-warning/30 px-4 py-1.5 text-xs font-medium text-warning" role="banner">
          <span aria-hidden="true">🎭</span>
          <span>
            Demo mode — all data is mocked. Run{" "}
            <code className="font-mono bg-warning/10 px-1 rounded">npm run dev</code> to connect to the backend.
          </span>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="h-14 shrink-0 flex items-center gap-2 px-3 sm:px-4 clay-header z-30">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="md:hidden p-2 rounded-lg text-default-400 hover:bg-default-100 hover:text-foreground transition-colors"
        >
          <MenuIcon />
        </button>

        {/* Brand — always visible in topbar */}
        <div className="flex items-center gap-2">
          <span className="text-primary inline-flex items-center">
            {appSettings.logo_url ? (
              <img
                src={appSettings.logo_url}
                alt={`${brandName} logo`}
                className="h-[22px] w-auto max-w-[140px] object-contain"
              />
            ) : (
              <TelaiOSLogo size={22} />
            )}
          </span>
          <span className="font-bold text-sm leading-snug tracking-tight">{brandName}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side: user info + controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-lg text-default-400 hover:bg-default-100 hover:text-foreground transition-colors"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* User info — name hidden on very small screens */}
          {user && (
            <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-divider">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-foreground leading-tight">{user.display_name}</p>
                <p className="text-xs text-default-400 leading-tight capitalize">{user.system_role}</p>
              </div>
              {/* Avatar-style initials circle */}
              <div
                className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0"
                aria-hidden="true"
              >
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
                className="p-1.5 rounded-lg text-default-400 hover:bg-default-100 hover:text-foreground transition-colors"
              >
                <LogoutIcon />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Mobile overlay ── */}
        {drawerOpen && (
          <div
            className="fixed top-14 inset-x-0 bottom-0 z-40 bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* ── Mobile drawer ── */}
        <aside
          id="sidebar-drawer"
          aria-label="Application sidebar"
          className={`
            fixed top-14 left-0 h-[calc(100%-3.5rem)] z-50 w-64 clay-sidebar
            transform transition-transform duration-300 ease-in-out
            ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
            md:hidden
          `}
        >
          <SidebarContent onClose={() => setDrawerOpen(false)} />
        </aside>

        {/* ── Desktop sidebar ── */}
        <aside
          aria-label="Application sidebar"
          className={`
            hidden md:flex flex-col shrink-0 clay-sidebar
            transition-[width] duration-200 ease-in-out overflow-hidden
            ${sidebarWidth}
          `}
        >
          <SidebarContent />
        </aside>

        {/* ── Main content ── */}
        <main
          className={
            isFullHeight
              ? "flex-1 overflow-hidden min-w-0"
              : "flex-1 overflow-y-auto min-w-0"
          }
        >
          {isFullHeight ? (
            <Outlet />
          ) : (
            <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
