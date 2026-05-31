import { useState, useRef, useEffect } from "react";
import { listDesignSessions, createDesignSession } from "../../lib/api";
import type { DesignSession, DesignLayerType } from "../../types";

/* ─── Design layer config ─────────────────────────────────────────────────── */
const DESIGN_LAYERS: Array<{
  type: DesignLayerType;
  label: string;
  icon: string;
  color: string;
  description: string;
}> = [
  { type: "er_diagram",          label: "ER Diagram",          icon: "⬡", color: "#0a84ff", description: "Entity-relationship model" },
  { type: "ui_interface",        label: "UI Interface",        icon: "⬜", color: "#ff9f0a", description: "Wireframes and component layouts" },
  { type: "system_architecture", label: "System Architecture", icon: "◈", color: "#5e5ce6", description: "Architecture overview diagrams" },
  { type: "data_flow",           label: "Data Flow",           icon: "↝", color: "#30d158", description: "Data movement and pipeline diagrams" },
  { type: "api_spec",            label: "API Spec",            icon: "{}", color: "#bf5af2", description: "OpenAPI 3.1 YAML fragments" },
  { type: "sequence_diagram",    label: "Sequence Diagram",    icon: "⇅", color: "#64d2ff", description: "Interaction sequence diagrams" },
  { type: "general",             label: "General",             icon: "✦", color: "#98989d", description: "Open-ended design conversation" },
];

/* ─── Schematic SVG previews ─────────────────────────────────────────────── */
function DesignSchematic({ screen, accent }: { screen: string; accent: string }) {
  const a = accent;
  switch (screen) {
    case "login":
      return (
        <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="50" y="14" width="100" height="102" rx="10" fill={a} fillOpacity="0.07" stroke={a} strokeOpacity="0.2" strokeWidth="0.5" />
          <rect x="66" y="26" width="68" height="12" rx="3" fill={a} fillOpacity="0.55" />
          <rect x="66" y="46" width="68" height="22" rx="7" fill={a} fillOpacity="0.3" />
          <rect x="66" y="74" width="68" height="8" rx="2" fill={a} fillOpacity="0.18" />
          <rect x="66" y="88" width="68" height="8" rx="2" fill={a} fillOpacity="0.18" />
          <rect x="66" y="104" width="68" height="8" rx="5" fill={a} fillOpacity="0.45" />
        </svg>
      );
    case "dashboard":
      return (
        <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="180" height="14" rx="3" fill={a} fillOpacity="0.45" />
          <rect x="10" y="30" width="56" height="36" rx="4" fill={a} fillOpacity="0.28" />
          <rect x="72" y="30" width="56" height="36" rx="4" fill={a} fillOpacity="0.22" />
          <rect x="134" y="30" width="56" height="36" rx="4" fill={a} fillOpacity="0.28" />
          <rect x="10" y="72" width="115" height="48" rx="5" fill={a} fillOpacity="0.15" />
          <rect x="131" y="72" width="59" height="48" rx="5" fill={a} fillOpacity="0.18" />
          <rect x="18" y="80" width="60" height="6" rx="2" fill={a} fillOpacity="0.4" />
          <rect x="18" y="92" width="99" height="4" rx="2" fill={a} fillOpacity="0.2" />
          <rect x="18" y="102" width="80" height="4" rx="2" fill={a} fillOpacity="0.2" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="50" height="110" rx="4" fill={a} fillOpacity="0.14" />
          <rect x="14" y="18" width="42" height="8" rx="3" fill={a} fillOpacity="0.4" />
          <rect x="14" y="32" width="42" height="6" rx="2" fill={a} fillOpacity="0.25" />
          <rect x="14" y="44" width="42" height="6" rx="2" fill={a} fillOpacity="0.25" />
          <rect x="14" y="56" width="42" height="6" rx="2" fill={a} fillOpacity="0.25" />
          <rect x="66" y="10" width="124" height="110" rx="5" fill={a} fillOpacity="0.07" />
          <rect x="74" y="20" width="80" height="10" rx="3" fill={a} fillOpacity="0.4" />
          <rect x="74" y="38" width="108" height="7" rx="2" fill={a} fillOpacity="0.2" />
          <rect x="74" y="52" width="108" height="7" rx="2" fill={a} fillOpacity="0.2" />
          <rect x="74" y="66" width="108" height="7" rx="2" fill={a} fillOpacity="0.2" />
          <rect x="74" y="82" width="68" height="20" rx="4" fill={a} fillOpacity="0.3" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="180" height="14" rx="3" fill={a} fillOpacity="0.45" />
          {[34, 52, 70, 88, 106].map((y, i) => (
            <g key={i}>
              <rect x="10" y={y} width="180" height="14" rx="3" fill={a} fillOpacity={i % 2 === 0 ? 0.12 : 0.07} />
              <rect x="16" y={y + 3} width="60" height="7" rx="2" fill={a} fillOpacity="0.35" />
              <rect x="160" y={y + 3} width="24" height="7" rx="9999" fill={a} fillOpacity="0.3" />
            </g>
          ))}
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="56" height="36" rx="4" fill={a} fillOpacity="0.32" />
          <rect x="72" y="10" width="56" height="36" rx="4" fill={a} fillOpacity="0.28" />
          <rect x="134" y="10" width="56" height="36" rx="4" fill={a} fillOpacity="0.32" />
          <rect x="10" y="54" width="180" height="68" rx="5" fill={a} fillOpacity="0.18" />
          <rect x="20" y="64" width="68" height="6" rx="2" fill={a} fillOpacity="0.5" />
          <rect x="20" y="76" width="160" height="4" rx="2" fill={a} fillOpacity="0.3" />
          <rect x="20" y="86" width="160" height="4" rx="2" fill={a} fillOpacity="0.3" />
          <rect x="20" y="96" width="120" height="4" rx="2" fill={a} fillOpacity="0.3" />
        </svg>
      );
  }
}

/* ─── Hi-fi preview (for focus view) ─────────────────────────────────────── */
function HiFiPreview({ screen, accent }: { screen: string; accent: string }) {
  if (screen === "login") {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${accent}08, ${accent}15)` }}>
        <div style={{ width: 280, padding: 32, borderRadius: 16, background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${accent}, ${accent}aa)`, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>T</div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Sign in to TelaiOS</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--label-tertiary)" }}>Continue with your Okta account</p>
          </div>
          <button style={{ width: "100%", padding: "12px", borderRadius: 10, background: accent, border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>
            Continue with Okta SSO →
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
            <span style={{ fontSize: 11, color: "var(--label-quaternary)" }}>or</span>
            <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-tertiary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Email" readOnly />
          </div>
          <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-tertiary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Password" type="password" readOnly />
        </div>
      </div>
    );
  }

  if (screen === "dashboard") {
    return (
      <div style={{ height: "100%", overflow: "auto", background: `linear-gradient(135deg, ${accent}06, transparent)`, padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>Atlas Project</h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--label-tertiary)" }}>Knowledge platform · 5 repos · 10 docs</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { l: "Repos", v: "5", d: "4 synced" },
            { l: "Symbols", v: "22.4k", d: "5 languages" },
            { l: "Q&A this month", v: "618", d: "+12%" },
          ].map((s) => (
            <div key={s.l} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)" }}>
              <div style={{ fontSize: 11, color: "var(--label-tertiary)" }}>{s.l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--label-primary)", marginTop: 2 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: accent, marginTop: 1 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--label-primary)" }}>Connected repositories</div>
          {["atlas-api", "atlas-web", "atlas-edge"].map((r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "0.5px solid var(--hairline)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
              <span style={{ flex: 1, fontSize: 12, color: "var(--label-secondary)" }}>{r}</span>
              <span style={{ fontSize: 10, color: "#30d158" }}>synced</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${accent}08, ${accent}15)` }}>
      <div style={{ textAlign: "center", color: "var(--label-tertiary)", padding: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 8, color: accent }}>✦</div>
        <p style={{ fontSize: 14, margin: "0 0 4px", color: "var(--label-secondary)" }}>{screen} preview</p>
        <p style={{ fontSize: 12, margin: 0 }}>Interactive preview</p>
      </div>
    </div>
  );
}

/* ─── Seeded design data ─────────────────────────────────────────────────── */
type DesignStatus = "draft" | "review" | "approved";

interface LocalDesign {
  id: string;
  title: string;
  screen: string;
  accent: string;
  status: DesignStatus;
  author: string;
  time: string;
  iterations: number;
  versions: Array<{ id: string; label: string; summary: string }>;
  chat: Array<{ role: "user" | "designer"; text: string }>;
  layer_type?: DesignLayerType;
}

const SEEDED_DESIGNS: LocalDesign[] = [
  {
    id: "d-login",
    title: "Sign-in — Okta SSO",
    screen: "login",
    accent: "#0a84ff",
    status: "review",
    author: "TEOS Designer",
    time: "2h ago",
    iterations: 2,
    versions: [
      { id: "v1", label: "v1", summary: "SSO above email/password" },
      { id: "v2", label: "v2", summary: "Larger SSO button, tighter card" },
    ],
    chat: [
      { role: "user", text: "Design the new sign-in screen with Okta SSO as the primary path." },
      { role: "designer", text: "Composed a sign-in screen that puts SSO front-and-center. Used the Acme brand kit — primary blue, 12px radii, the linked AuthCard component. The email/password path is collapsed below a divider to reduce cognitive load." },
      { role: "user", text: "Make the SSO button larger and tighten the card padding." },
      { role: "designer", text: "Updated — button is now full-width with 12px padding and the card uses 24px gutters instead of 32px. This is v2." },
    ],
  },
  {
    id: "d-dashboard",
    title: "Project dashboard — Atlas",
    screen: "dashboard",
    accent: "#5e5ce6",
    status: "approved",
    author: "TEOS Designer",
    time: "1d ago",
    iterations: 3,
    versions: [
      { id: "v1", label: "v1", summary: "Stats + repo list" },
      { id: "v2", label: "v2", summary: "Hero ask panel added" },
      { id: "v3", label: "v3", summary: "Activity feed below" },
    ],
    chat: [
      { role: "user", text: "Design the main project dashboard." },
      { role: "designer", text: "Starting with a stats bar, repo list, and recent activity feed. Clean and information-dense." },
    ],
  },
  {
    id: "d-settings",
    title: "Settings — Appearance & AI",
    screen: "settings",
    accent: "#bf5af2",
    status: "draft",
    author: "TEOS Designer",
    time: "3d ago",
    iterations: 1,
    versions: [
      { id: "v1", label: "v1", summary: "Two-column nav + pane layout" },
    ],
    chat: [
      { role: "user", text: "Design a settings page with appearance and AI preference sections." },
      { role: "designer", text: "Built a two-column layout: sidebar nav on the left with section groups, scrollable pane on the right. 9 sections in total." },
    ],
  },
  {
    id: "d-list",
    title: "Agents list view",
    screen: "list",
    accent: "#30d158",
    status: "review",
    author: "TEOS Designer",
    time: "4d ago",
    iterations: 2,
    versions: [
      { id: "v1", label: "v1", summary: "Card grid layout" },
      { id: "v2", label: "v2", summary: "Table + expandable rows" },
    ],
    chat: [
      { role: "user", text: "Show me agent cards in a list." },
      { role: "designer", text: "Tried both a card grid and a table view. The table with expandable rows scales better with 20+ agents." },
    ],
  },
  {
    id: "d-inbox",
    title: "Inbox — two-column",
    screen: "list",
    accent: "#ff9f0a",
    status: "approved",
    author: "TEOS Designer",
    time: "5d ago",
    iterations: 1,
    versions: [
      { id: "v1", label: "v1", summary: "List + detail pane" },
    ],
    chat: [
      { role: "user", text: "Design the inbox with a two-column layout." },
      { role: "designer", text: "Classic list + detail pane. Items on the left with unread dots, full content on the right." },
    ],
  },
  {
    id: "d-repos",
    title: "Repositories — connected sources",
    screen: "dashboard",
    accent: "#ff375f",
    status: "draft",
    author: "TEOS Designer",
    time: "6d ago",
    iterations: 2,
    versions: [
      { id: "v1", label: "v1", summary: "Card per repo" },
      { id: "v2", label: "v2", summary: "Stats + card list" },
    ],
    chat: [
      { role: "user", text: "Design the repositories view." },
      { role: "designer", text: "Stats across the top, then a card per repo showing provider, status, file count, and last sync time." },
    ],
  },
];

const STATUS_COLOR: Record<DesignStatus, string> = {
  draft:    "rgba(142,142,147,0.15)",
  review:   "rgba(255,159,10,0.15)",
  approved: "rgba(48,209,88,0.15)",
};
const STATUS_TEXT: Record<DesignStatus, string> = {
  draft:    "#8e8e93",
  review:   "#b66e02",
  approved: "#1d9954",
};

/* ─── Brand kit tab ──────────────────────────────────────────────────────── */
function BrandKitTab() {
  const colors = [
    { name: "Blue",   hex: "#0A84FF" },
    { name: "Purple", hex: "#BF5AF2" },
    { name: "Green",  hex: "#30D158" },
    { name: "Orange", hex: "#FF9F0A" },
    { name: "Red",    hex: "#FF3B30" },
    { name: "Indigo", hex: "#5E5CE6" },
    { name: "Teal",   hex: "#64D2FF" },
    { name: "Pink",   hex: "#FF2D55" },
  ];
  const components = ["Button", "Input", "Modal", "Card", "Chip", "Tabs", "Table", "Select", "Switch", "Spinner", "Tooltip", "Divider", "Slider", "Checkbox", "Code"];

  return (
    <div style={{ padding: "16px 0" }}>
      {/* Colors */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", marginBottom: 10 }}>Colors</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {colors.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: c.hex, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--label-primary)" }}>{c.name}</div>
                <div style={{ fontSize: 10, color: "var(--label-tertiary)", fontFamily: "var(--font-sf-mono)" }}>{c.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", marginBottom: 10 }}>Typography</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { name: "Large Title", size: "34px", weight: "700" },
            { name: "Title 1",     size: "28px", weight: "700" },
            { name: "Headline",    size: "17px", weight: "600" },
            { name: "Body",        size: "17px", weight: "400" },
            { name: "Caption",     size: "12px", weight: "400" },
          ].map((t) => (
            <div key={t.name} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--label-tertiary)", minWidth: 80 }}>{t.name}</span>
              <span style={{ fontSize: t.size, fontWeight: t.weight as any, color: "var(--label-primary)", lineHeight: 1 }}>Aa</span>
              <span style={{ fontSize: 10, color: "var(--label-quaternary)", marginLeft: "auto" }}>{t.size} / {t.weight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Component library */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", marginBottom: 10 }}>Component library</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {components.map((c) => (
            <span key={c} style={{ padding: "3px 10px", borderRadius: 9999, fontSize: 12, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-secondary)" }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Focus view (Claude-design-style) ───────────────────────────────────── */
function FocusView({ design, onClose }: { design: LocalDesign; onClose: () => void }) {
  const [activeV, setActiveV] = useState(design.versions[design.versions.length - 1].id);
  const [chat, setChat] = useState(design.chat);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [status, setStatus] = useState<DesignStatus>(design.status);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, isTyping]);

  const send = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    setChat((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 1200));
    const nextV = `v${design.versions.length + chat.filter((m) => m.role === "designer").length + 1}`;
    setChat((prev) => [
      ...prev,
      { role: "designer", text: `Updated the design based on your feedback. Version ${nextV} — ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}` },
    ]);
    setIsTyping(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Preview pane ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "0.5px solid var(--hairline)" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: "var(--label-tertiary)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
          >←</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{design.title}</span>

          {/* Version pips */}
          <div style={{ display: "flex", gap: 4 }}>
            {design.versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveV(v.id)}
                title={v.summary}
                style={{
                  padding: "3px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
                  background: activeV === v.id ? design.accent + "20" : "var(--fill-tertiary)",
                  color: activeV === v.id ? design.accent : "var(--label-tertiary)",
                  border: activeV === v.id ? `0.5px solid ${design.accent}60` : "0.5px solid var(--hairline)",
                  cursor: "pointer",
                }}
              >{v.label}</button>
            ))}
          </div>

          {/* Status */}
          <div style={{ display: "flex", gap: 2, background: "var(--fill-tertiary)", borderRadius: 8, padding: 2 }}>
            {(["draft", "review", "approved"] as DesignStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: status === s ? STATUS_COLOR[s] : "none",
                  color: status === s ? STATUS_TEXT[s] : "var(--label-tertiary)",
                  border: "none", cursor: "pointer",
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <HiFiPreview screen={design.screen} accent={design.accent} />
        </div>

        {/* Version summary bar */}
        <div style={{ padding: "8px 16px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>
            {design.versions.find((v) => v.id === activeV)?.summary}
          </span>
          <div style={{ flex: 1 }} />
          <button style={{ padding: "4px 12px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", fontSize: 11, cursor: "pointer", color: "var(--label-secondary)" }}>
            Export
          </button>
          <button style={{ padding: "4px 12px", borderRadius: 8, background: design.accent, border: "none", fontSize: 11, cursor: "pointer", color: "#fff", fontWeight: 500 }}>
            Preview live
          </button>
        </div>
      </div>

      {/* ── Chat pane ── */}
      <div style={{ width: 320, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 15, color: "#ff9f0a" }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#ff9f0a" }}>TEOS Designer</span>
          <span style={{ fontSize: 10, color: "var(--label-quaternary)", marginLeft: "auto" }}>{design.iterations} iterations</span>
        </div>

        {/* Thread */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {chat.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div key={i} style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                {!isUser && (
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>✦</div>
                )}
                <div style={{
                  padding: "8px 11px",
                  borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  fontSize: 13, lineHeight: 1.5, maxWidth: "85%",
                  ...(isUser
                    ? { background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", color: "#fff" }
                    : { background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)" }),
                }}>
                  {!isUser && (
                    <div style={{ fontSize: 10, color: "#ff9f0a", marginBottom: 3, fontWeight: 500 }}>✦ Designer</div>
                  )}
                  {msg.text}
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>✦</div>
              <div style={{ padding: "8px 12px", borderRadius: "14px 14px 14px 4px", background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0,1,2].map((i) => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff9f0a", animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestions */}
        <div style={{ padding: "0 10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
          {["Try a darker theme", "Make the primary action bigger", "Add more breathing room"].map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              style={{ padding: "5px 10px", borderRadius: 8, background: "var(--fill-quaternary)", border: "0.5px solid var(--hairline)", fontSize: 12, color: "var(--label-secondary)", cursor: "pointer", textAlign: "left" }}
            >{s}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: "8px 10px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", background: "var(--fill-tertiary)", borderRadius: 12, padding: "7px 10px", border: "0.5px solid var(--glass-edge)" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Describe changes…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--label-primary)", fontFamily: "inherit" }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || isTyping}
              style={{ width: 28, height: 28, borderRadius: "50%", background: input.trim() && !isTyping ? "#ff9f0a" : "var(--fill-secondary)", border: "none", cursor: input.trim() && !isTyping ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", color: input.trim() && !isTyping ? "#fff" : "var(--label-tertiary)", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function ProjectDesigns({ projectId }: { projectId: string }) {
  const [apiSessions, setApiSessions] = useState<DesignSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"library" | "brand">("library");
  const [filter, setFilter] = useState<"all" | DesignStatus>("all");
  const [focused, setFocused] = useState<LocalDesign | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [selectedLayerType, setSelectedLayerType] = useState<DesignLayerType>("general");

  useEffect(() => {
    listDesignSessions(projectId)
      .then(setApiSessions)
      .finally(() => setLoading(false));
  }, [projectId]);

  // Merge API sessions into the display list (API sessions shown as draft with no screen info)
  const allDesigns: LocalDesign[] = [
    ...SEEDED_DESIGNS,
    ...apiSessions.map((s): LocalDesign => ({
      id: s.id,
      title: s.title ?? "Untitled Design",
      screen: "dashboard",
      accent: DESIGN_LAYERS.find((l) => l.type === s.layer_type)?.color ?? "#0a84ff",
      status: "draft",
      author: "TEOS Designer",
      time: new Date(s.updated_at).toLocaleDateString(),
      iterations: 1,
      versions: [{ id: "v1", label: "v1", summary: "Initial design" }],
      chat: [],
      layer_type: s.layer_type,
    })),
  ];

  const filtered = allDesigns.filter((d) => filter === "all" || d.status === filter);
  const counts = {
    all:      allDesigns.length,
    draft:    allDesigns.filter((d) => d.status === "draft").length,
    review:   allDesigns.filter((d) => d.status === "review").length,
    approved: allDesigns.filter((d) => d.status === "approved").length,
  };

  if (focused) {
    return <FocusView design={focused} onClose={() => setFocused(null)} />;
  }

  const handleCreateSession = async (layerType: DesignLayerType) => {
    if (!generatePrompt.trim()) return;
    setGenerating(true);
    setShowGenerate(false);
    try {
      const s = await createDesignSession(projectId, generatePrompt, undefined, layerType);
      setApiSessions((prev) => [s, ...prev]);
    } finally {
      setGenerating(false);
      setGeneratePrompt("");
      setSelectedLayerType("general");
    }
  };

  const openLayerPicker = () => {
    setSelectedLayerType("general");
    setShowLayerPicker(true);
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.02em" }}>Designs</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
            UI mockups the TEOS Designer agent has generated — grounded in your brand kit and component library.
          </p>
        </div>
        <button
          onClick={openLayerPicker}
          style={{ padding: "8px 16px", borderRadius: 10, background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          ✦ Generate design
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Total designs", v: allDesigns.length, d: `${counts.approved} approved` },
          { l: "In review",     v: counts.review,     d: "awaiting feedback" },
          { l: "Components",    v: "15+",             d: "from linked Figma" },
          { l: "Iterations",    v: allDesigns.reduce((s, d) => s + d.iterations, 0), d: "this month" },
        ].map((s) => (
          <div key={s.l} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)", boxShadow: "var(--shadow-glass-panel)" }}>
            <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.02em" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 2 }}>{s.d}</div>
          </div>
        ))}
      </div>

      {/* Tab + filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: "var(--fill-tertiary)", borderRadius: 10, padding: 2 }}>
          {(["library", "brand"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: "5px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", background: tab === t ? "var(--glass-strong)" : "none", color: tab === t ? "var(--label-primary)" : "var(--label-tertiary)", boxShadow: tab === t ? "var(--shadow-glass-panel)" : "none" }}
            >
              {t === "library" ? "Library" : "Brand kit"}
            </button>
          ))}
        </div>

        {tab === "library" && (
          <>
            {(["all", "approved", "review", "draft"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 500,
                  background: filter === f ? "rgba(255,159,10,0.15)" : "var(--fill-tertiary)",
                  color: filter === f ? "#ff9f0a" : "var(--label-secondary)",
                  border: filter === f ? "0.5px solid rgba(255,159,10,0.4)" : "0.5px solid var(--hairline)",
                  cursor: "pointer",
                }}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {" "}
                <span style={{ opacity: 0.7 }}>{counts[f]}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Content */}
      {tab === "brand" ? (
        <div style={{ maxWidth: 800 }}>
          <BrandKitTab />
        </div>
      ) : loading && apiSessions.length === 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {[1,2,3].map((i) => (
            <div key={i} style={{ height: 220, borderRadius: 16, background: "var(--fill-quaternary)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: "#ff9f0a" }}>✦</div>
          <p style={{ fontSize: 14, margin: "0 0 4px", color: "var(--label-secondary)" }}>No designs yet</p>
          <p style={{ fontSize: 12, margin: "0 0 16px" }}>Generate a design with the TEOS Designer</p>
          <button
            onClick={openLayerPicker}
            style={{ padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Start designing
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setFocused(d)}
              style={{ background: "var(--glass-strong)", backdropFilter: "blur(20px)", border: "0.5px solid var(--glass-edge)", borderRadius: 16, padding: 0, overflow: "hidden", cursor: "pointer", boxShadow: "var(--shadow-glass-panel)", textAlign: "left", transition: "transform 200ms, box-shadow 200ms" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-glass-lg)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-glass-panel)"; }}
            >
              {/* Schematic preview */}
              <div style={{ height: 130, background: `linear-gradient(135deg, ${d.accent}18, ${d.accent}06)`, padding: 8, display: "flex", alignItems: "stretch" }}>
                <DesignSchematic screen={d.screen} accent={d.accent} />
              </div>
              {/* Meta */}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9999, background: STATUS_COLOR[d.status], color: STATUS_TEXT[d.status], fontWeight: 500 }}>{d.status}</span>
                  {d.layer_type && (() => {
                    const layerConfig = DESIGN_LAYERS.find((l) => l.type === d.layer_type) ?? DESIGN_LAYERS[6];
                    return (
                      <span style={{ fontSize: 10, color: layerConfig.color, border: `1px solid ${layerConfig.color}40`, borderRadius: 4, padding: "1px 5px" }}>
                        {layerConfig.icon} {layerConfig.label}
                      </span>
                    );
                  })()}
                  <span style={{ fontSize: 10, color: "var(--label-quaternary)" }}>{d.versions.length} ver.</span>
                  <span style={{ fontSize: 10, color: "var(--label-quaternary)", marginLeft: "auto" }}>{d.time}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Layer picker modal */}
      {showLayerPicker && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "var(--bg-secondary, #1c1c1e)",
            borderRadius: 16, padding: 24, width: 480, maxWidth: "90vw",
            border: "0.5px solid var(--hairline)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--label-primary)", marginBottom: 16 }}>
              Choose Design Layer
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {DESIGN_LAYERS.map((layer) => (
                <button
                  key={layer.type}
                  onClick={() => setSelectedLayerType(layer.type)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${selectedLayerType === layer.type ? layer.color : "var(--hairline)"}`,
                    background: selectedLayerType === layer.type ? `${layer.color}15` : "none",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 18, color: layer.color }}>{layer.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--label-primary)" }}>{layer.label}</div>
                    <div style={{ fontSize: 11, color: "var(--label-tertiary)" }}>{layer.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setShowLayerPicker(false)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "none", color: "var(--label-secondary)", cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLayerPicker(false);
                  setShowGenerate(true);
                }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0a84ff", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate modal */}
      {showGenerate && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowGenerate(false)}
        >
          <div
            style={{ width: 480, background: "var(--glass-strong)", backdropFilter: "blur(40px)", border: "0.5px solid var(--glass-edge)", borderRadius: 20, boxShadow: "var(--shadow-glass-lg)", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 22px 0" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.02em" }}>Generate a design</div>
              <p style={{ fontSize: 13, color: "var(--label-secondary)", margin: "4px 0 16px" }}>Describe what you want TEOS Designer to create.</p>
            </div>
            <div style={{ padding: "0 22px 20px" }}>
              <textarea
                autoFocus
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="e.g. Design a settings page with appearance and notification sections, using the Atlas brand kit…"
                rows={4}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-primary)", fontSize: 13, fontFamily: "inherit", resize: "none", boxSizing: "border-box", lineHeight: 1.55 }}
              />
              {/* Selected layer badge */}
              {(() => {
                const lc = DESIGN_LAYERS.find((l) => l.type === selectedLayerType) ?? DESIGN_LAYERS[6];
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>Layer:</span>
                    <span style={{ fontSize: 11, color: lc.color, border: `1px solid ${lc.color}40`, borderRadius: 4, padding: "1px 6px" }}>
                      {lc.icon} {lc.label}
                    </span>
                    <button
                      onClick={() => { setShowGenerate(false); setShowLayerPicker(true); }}
                      style={{ fontSize: 11, color: "var(--label-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >
                      Change
                    </button>
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button onClick={() => setShowGenerate(false)} style={{ padding: "8px 16px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", fontSize: 13, cursor: "pointer", color: "var(--label-secondary)" }}>Cancel</button>
                <button
                  onClick={() => handleCreateSession(selectedLayerType)}
                  disabled={!generatePrompt.trim() || generating}
                  style={{ padding: "8px 18px", borderRadius: 10, background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: generatePrompt.trim() ? "pointer" : "default", opacity: generatePrompt.trim() ? 1 : 0.5 }}
                >
                  {generating ? "Generating…" : "✦ Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
