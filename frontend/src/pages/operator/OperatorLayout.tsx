import { createContext, useContext, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAppSettings } from "../../context/AppSettingsContext";
import { Icon } from "../../components/Icon";
import { TelaiOSLogo } from "../../components/common/TelaiOSLogo";

import OperatorOverview   from "./OperatorOverview";
import OperatorWorkspaces from "./OperatorWorkspaces";
import OperatorSystem     from "./OperatorSystem";
import OperatorAudit      from "./OperatorAudit";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OperatorView = "overview" | "workspaces" | "system" | "audit";
export type OperatorMode = "saas" | "onprem";

interface OperatorContextValue {
  mode: OperatorMode;
  setMode: (m: OperatorMode) => void;
}

export const OperatorContext = createContext<OperatorContextValue>({
  mode: "saas",
  setMode: () => {},
});

export function useOperatorMode() {
  return useContext(OperatorContext);
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV: Array<{ id: OperatorView; label: string; icon: string }> = [
  { id: "overview",    label: "Overview",       icon: "home"   },
  { id: "workspaces",  label: "Workspaces",     icon: "users"  },
  { id: "system",      label: "System Health",  icon: "layers" },
  { id: "audit",       label: "Audit Log",      icon: "inbox"  },
];

const VIEW_LABELS: Record<OperatorView, string> = {
  overview:   "Platform Overview",
  workspaces: "Workspaces",
  system:     "System Health",
  audit:      "Audit Log",
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function OperatorLayout() {
  const { user, logout } = useAuth();
  const { settings: appSettings } = useAppSettings();
  const [view, setView] = useState<OperatorView>("overview");
  const [mode, setMode] = useState<OperatorMode>("saas");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userInitials =
    user?.display_name
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "OP";

  const renderView = () => {
    switch (view) {
      case "overview":   return <OperatorOverview mode={mode} />;
      case "workspaces": return <OperatorWorkspaces mode={mode} />;
      case "system":     return <OperatorSystem mode={mode} />;
      case "audit":      return <OperatorAudit mode={mode} />;
    }
  };

  return (
    <OperatorContext.Provider value={{ mode, setMode }}>
      <div
        className="app"
        data-ai-collapsed="true"
        style={{ gridTemplateColumns: "240px 1fr" }}
      >
        {/* ── Sidebar ── */}
        <aside
          className="sidebar glass"
          style={{
            borderTop: "2px solid #ff9f0a",
            boxShadow: "inset 0 1px 0 #ff9f0a22",
          }}
        >
          {/* Brand */}
          <div className="sb-brand" style={{ gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <TelaiOSLogo size={16} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>Operator</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#ff9f0a",
                background: "#ff9f0a18",
                border: "0.5px solid #ff9f0a44",
                borderRadius: 4,
                padding: "2px 5px",
                flexShrink: 0,
              }}
            >
              Control Plane
            </span>
          </div>

          {/* Nav */}
          <div className="sb-section">Navigation</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {NAV.map((n) => (
              <button
                key={n.id}
                className="sb-row"
                data-active={view === n.id}
                onClick={() => setView(n.id)}
                style={view === n.id ? { color: "#ff9f0a" } : {}}
              >
                <Icon
                  name={n.icon}
                  className="sb-icon"
                  style={view === n.id ? { color: "#ff9f0a" } : {}}
                />
                <span>{n.label}</span>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="sb-spacer" />

          {/* Exit */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingTop: 8 }}>
            <button
              className="sb-row"
              style={{ color: "var(--fg-3)", height: 30, fontSize: 12.5 }}
              onClick={() => { window.location.href = "/"; }}
            >
              <Icon name="arrow" size="sm" className="sb-icon" style={{ transform: "rotate(180deg)" }} />
              <span>Exit Operator</span>
            </button>


          </div>
        </aside>

        {/* ── Topbar ── */}
        <header className="topbar glass">
          <div className="crumb">
            <b style={{ color: "#ff9f0a" }}>{(appSettings.brand_name?.trim() || "TelaiOS")} Operator</b>
            <span className="crumb-sep">/</span>
            <span>{VIEW_LABELS[view]}</span>
          </div>

          <div className="tb-spacer" />

          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--glass-weak)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 8,
              padding: "3px 4px",
              fontSize: 12,
              marginRight: 4,
            }}
          >
            <button
              onClick={() => setMode("saas")}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                fontWeight: mode === "saas" ? 600 : 400,
                background: mode === "saas" ? "var(--glass)" : "transparent",
                color: mode === "saas" ? "var(--fg)" : "var(--fg-3)",
                border: mode === "saas" ? "0.5px solid var(--hairline)" : "0.5px solid transparent",
                fontSize: 12,
                transition: "all 0.15s",
                cursor: "pointer",
              }}
            >
              SaaS
            </button>
            <button
              onClick={() => setMode("onprem")}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                fontWeight: mode === "onprem" ? 600 : 400,
                background: mode === "onprem" ? "var(--glass)" : "transparent",
                color: mode === "onprem" ? "var(--fg)" : "var(--fg-3)",
                border: mode === "onprem" ? "0.5px solid var(--hairline)" : "0.5px solid transparent",
                fontSize: 12,
                transition: "all 0.15s",
                cursor: "pointer",
              }}
            >
              On-prem
            </button>
          </div>

          {/* User menu */}
          <div style={{ position: "relative" }}>
            <button
              className="tb-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 4px", borderRadius: 8, height: 32, width: "auto" }}
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
                  {/* Logout */}
                  <div style={{ padding: "4px 4px 4px", borderTop: "0.5px solid var(--hairline)" }}>
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
        </header>

        {/* ── Main ── */}
        <main className="main glass">{renderView()}</main>
      </div>
    </OperatorContext.Provider>
  );
}
