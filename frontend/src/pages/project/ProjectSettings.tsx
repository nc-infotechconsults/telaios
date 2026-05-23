import { useState } from "react";

type SettingsTab = "appearance" | "teos" | "notifications" | "knowledge" | "integrations" | "account";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "appearance",    label: "Appearance",    icon: "🎨" },
  { id: "teos",         label: "TEOS",          icon: "⊛" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "knowledge",    label: "Knowledge",     icon: "⌖" },
  { id: "integrations", label: "Integrations",  icon: "⎔" },
  { id: "account",      label: "Account",       icon: "👤" },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "0.5px solid var(--hairline)", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--label-primary)" }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 2 }}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: checked ? "#0a84ff" : "var(--fill-tertiary)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 150ms",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          transition: "left 150ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

function AppearanceTab() {
  const [theme, setTheme] = useState("dark");
  const [density, setDensity] = useState("comfortable");
  const [animations, setAnimations] = useState(true);

  return (
    <div>
      <SettingRow label="Theme" description="Choose your preferred color theme">
        <div style={{ display: "flex", gap: 8 }}>
          {["light", "dark", "system"].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid", borderColor: theme === t ? "#0a84ff" : "var(--hairline)", background: theme === t ? "rgba(10,132,255,0.12)" : "var(--fill-quaternary)", color: theme === t ? "#0a84ff" : "var(--label-secondary)", fontSize: 12, fontWeight: theme === t ? 600 : 400, cursor: "pointer" }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </SettingRow>
      <SettingRow label="Density" description="Interface density">
        <select
          value={density}
          onChange={(e) => setDensity(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 12, cursor: "pointer" }}
        >
          <option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </SettingRow>
      <SettingRow label="Animations" description="Enable UI animations">
        <ToggleSwitch checked={animations} onChange={setAnimations} />
      </SettingRow>
    </div>
  );
}

function TeosTab() {
  const [autoRoute, setAutoRoute] = useState(true);
  const [citations, setCitations] = useState(true);
  const [context, setContext] = useState("full");

  return (
    <div>
      <SettingRow label="Auto-route specialists" description="Let TEOS automatically select the best specialist based on your query">
        <ToggleSwitch checked={autoRoute} onChange={setAutoRoute} />
      </SettingRow>
      <SettingRow label="Show citations" description="Display source references in TEOS responses">
        <ToggleSwitch checked={citations} onChange={setCitations} />
      </SettingRow>
      <SettingRow label="Context window" description="How much project context to include">
        <select
          value={context}
          onChange={(e) => setContext(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 12, cursor: "pointer" }}
        >
          <option value="minimal">Minimal</option>
          <option value="moderate">Moderate</option>
          <option value="full">Full</option>
        </select>
      </SettingRow>
    </div>
  );
}

function NotificationsTab() {
  const [teosInsights, setTeosInsights] = useState(true);
  const [mentions, setMentions] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(true);

  return (
    <div>
      <SettingRow label="TEOS insights" description="Notify when TEOS finds important insights">
        <ToggleSwitch checked={teosInsights} onChange={setTeosInsights} />
      </SettingRow>
      <SettingRow label="Mentions" description="Notify when someone mentions you">
        <ToggleSwitch checked={mentions} onChange={setMentions} />
      </SettingRow>
      <SettingRow label="Sync complete" description="Notify when repository sync finishes">
        <ToggleSwitch checked={syncComplete} onChange={setSyncComplete} />
      </SettingRow>
      <SettingRow label="Weekly report" description="Receive weekly project health report">
        <ToggleSwitch checked={weeklyReport} onChange={setWeeklyReport} />
      </SettingRow>
    </div>
  );
}

function KnowledgeTab() {
  const [autoIndex, setAutoIndex] = useState(true);
  const [chunkSize, setChunkSize] = useState("1024");
  const [hybridSearch, setHybridSearch] = useState(true);

  return (
    <div>
      <SettingRow label="Auto-index on push" description="Automatically re-index repositories when new commits are pushed">
        <ToggleSwitch checked={autoIndex} onChange={setAutoIndex} />
      </SettingRow>
      <SettingRow label="Chunk size" description="Token chunk size for document indexing">
        <select
          value={chunkSize}
          onChange={(e) => setChunkSize(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 12, cursor: "pointer" }}
        >
          <option value="512">512 tokens</option>
          <option value="1024">1024 tokens</option>
          <option value="2048">2048 tokens</option>
        </select>
      </SettingRow>
      <SettingRow label="Hybrid search" description="Use both semantic and keyword search">
        <ToggleSwitch checked={hybridSearch} onChange={setHybridSearch} />
      </SettingRow>
    </div>
  );
}

function PlaceholderTab({ title }: { title: string }) {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--label-tertiary)" }}>
      <p style={{ fontSize: 14 }}>{title} settings coming soon</p>
    </div>
  );
}

export default function ProjectSettings({ projectId: _projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":    return <AppearanceTab />;
      case "teos":          return <TeosTab />;
      case "notifications": return <NotificationsTab />;
      case "knowledge":     return <KnowledgeTab />;
      case "integrations":  return <PlaceholderTab title="Integrations" />;
      case "account":       return <PlaceholderTab title="Account" />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Tab sidebar */}
      <nav
        aria-label="Settings sections"
        style={{
          width: 180,
          borderRight: "0.5px solid var(--hairline)",
          padding: "16px 8px",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              background: activeTab === tab.id ? "var(--hover-glass)" : "none",
              border: "none",
              borderLeft: activeTab === tab.id ? "2px solid #0a84ff" : "2px solid transparent",
              cursor: "pointer",
              color: activeTab === tab.id ? "var(--label-primary)" : "var(--label-secondary)",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 500 : 400,
              textAlign: "left",
              marginBottom: 2,
            }}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>
          {TABS.find((t) => t.id === activeTab)?.label}
        </h2>
        {renderContent()}
      </div>
    </div>
  );
}
