import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { useTheme } from "../../context/ThemeContext";
import { getSettings, patchSettings } from "../../lib/api";
import type { AppSettings } from "../../types";
import { persistAndApplyAppSettings } from "../../lib/appSettings";
import { toast } from "../../lib/toast";

// ─── Settings sections ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "branding",      label: "Branding",          icon: "spark"    },
  { id: "appearance",    label: "Appearance",         icon: "sliders"  },
  { id: "ai",            label: "TEOS assistant",     icon: "sparkle"  },
  { id: "notifications", label: "Notifications",      icon: "bell"     },
  { id: "knowledge",     label: "Knowledge sources",  icon: "layers"   },
  { id: "integrations",  label: "Integrations",       icon: "branch"   },
  { id: "shortcuts",     label: "Keyboard",           icon: "cmd"      },
  { id: "privacy",       label: "Privacy & data",     icon: "eye"      },
];

// ─── Primitive form controls ──────────────────────────────────────────────────

function SetGroup({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-group">
      <div className="set-group-h">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      <div className="set-group-body">{children}</div>
    </div>
  );
}

function SetRow({
  label, hint, children, vertical, scope: _scope = "workspace",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  vertical?: boolean;
  /** Reserved for future per-project override UI. Currently unused. */
  scope?: "workspace" | "project";
}) {
  return (
    <div className={"set-row" + (vertical ? " vertical" : "")}>
      <div className="set-row-l">
        <div className="set-row-label">{label}</div>
        {hint && <div className="set-row-hint">{hint}</div>}
      </div>
      <div className="set-row-r">{children}</div>
    </div>
  );
}

function SetToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="set-toggle" data-on={value ? "true" : undefined} onClick={() => onChange(!value)}>
      <span className="set-toggle-knob" />
    </button>
  );
}

function SetSelect({ value, options, onChange }: {
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
}) {
  return (
    <select className="set-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function BrandingSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#0a84ff");

  useEffect(() => {
    setLoading(true);
    getSettings()
      .then((s) => {
        setSettings(s);
        setBrandName(s.brand_name ?? "");
        setBrandColor(s.brand_color ?? "#0a84ff");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const updated = await patchSettings({ brand_name: brandName, brand_color: brandColor });
      setSettings(updated);
      persistAndApplyAppSettings(updated);
      toast.success("Branding saved");
    } catch {
      toast.error("Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 24, color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>;

  return (
    <SetGroup title="Branding" desc="Customise how TelaiOS presents itself across your workspace.">
      <SetRow label="Brand name" hint="Replaces 'TelaiOS' throughout the interface.">
        <input
          className="form-input"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="TelaiOS"
        />
      </SetRow>
      <SetRow label="Brand color" hint="Used for primary actions and the TEOS orb.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            style={{ width: 36, height: 36, borderRadius: 6, border: "0.5px solid var(--hairline)", cursor: "pointer", padding: 2 }}
          />
          <input
            className="form-input"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            placeholder="#0a84ff"
            style={{ width: 110 }}
          />
        </div>
      </SetRow>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <button
          className="pill-btn"
          style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent", opacity: saving ? 0.5 : 1 }}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </SetGroup>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState("regular");
  const [glass, setGlass] = useState(32);
  const [aiVisible, setAiVisible] = useState(true);

  return (
    <>
      <SetGroup title="Theme" desc="Workspace-wide appearance defaults.">
        <SetRow label="Dark mode" hint="Match the system or pick manually.">
          <SetToggle value={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
        </SetRow>
        <SetRow label="Accent color" hint="Used across primary actions, focus states and the TEOS orb.">
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "blueviolet", a: "#0a84ff", b: "#bf5af2" },
              { id: "ocean",      a: "#0a84ff", b: "#64d2ff" },
              { id: "sunset",     a: "#ff375f", b: "#ff9f0a" },
              { id: "forest",     a: "#30d158", b: "#0a84ff" },
              { id: "rose",       a: "#bf5af2", b: "#ff375f" },
            ].map((o) => (
              <button key={o.id}
                style={{
                  width: 22, height: 22, borderRadius: "50%", border: "2px solid transparent",
                  background: `linear-gradient(135deg, ${o.a}, ${o.b})`, cursor: "pointer",
                }}
                title={o.id}
                onClick={() => {}}
              />
            ))}
          </div>
        </SetRow>
      </SetGroup>

      <SetGroup title="Materials" desc="Tune the glass and density of the interface.">
        <SetRow label="Glass blur" hint={`${glass}px backdrop blur on translucent panels.`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="range" min="0" max="60" value={glass}
              onChange={(e) => setGlass(parseInt(e.target.value))} style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 12, color: "var(--fg-3)", minWidth: 36 }}>{glass}px</span>
          </div>
        </SetRow>
        <SetRow label="Density" hint="How tight rows, cards and lists feel.">
          <div className="seg">
            {["compact", "regular", "comfy"].map((d) => (
              <button key={d} className="seg-btn"
                data-active={density === d ? "true" : undefined}
                onClick={() => setDensity(d)}>
                {d}
              </button>
            ))}
          </div>
        </SetRow>
        <SetRow label="Reduce motion" hint="Disables non-essential animations.">
          <SetToggle value={false} onChange={() => {}} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Layout">
        <SetRow label="Show AI sidebar by default" hint="When off, TEOS hides until users press its toggle.">
          <SetToggle value={aiVisible} onChange={setAiVisible} />
        </SetRow>
        <SetRow label="Sidebar collapsed" hint="Show icons only in the left rail.">
          <SetToggle value={false} onChange={() => {}} />
        </SetRow>
      </SetGroup>
    </>
  );
}

function AiSection() {
  const [autoRoute, setAutoRoute] = useState(true);
  const [defaultVis, setDefaultVis] = useState("team");
  const [model, setModel] = useState("claude-sonnet-4.5");
  const [cite, setCite] = useState(true);

  return (
    <>
      <SetGroup title="Routing" desc="How TEOS decides which specialist handles each message.">
        <SetRow label="Auto-route to specialist" hint="TEOS routes silently based on what is asked.">
          <SetToggle value={autoRoute} onChange={setAutoRoute} />
        </SetRow>
        <SetRow label="Show handover dividers" hint="Display the in-thread pill when TEOS hands off between specialists.">
          <SetToggle value={true} onChange={() => {}} />
        </SetRow>
        <SetRow label="Preferred specialist for ambiguous prompts">
          <SetSelect value="qa" options={["qa", "explorer", "planner", "designer", "coder", "reviewer"]} onChange={() => {}} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Session defaults" desc="Organisation-wide defaults for every new TEOS session.">
        <SetRow label="Default visibility" hint="Private = only the user. Team = everyone on the project.">
          <div className="seg">
            {["private", "team", "shared"].map((v) => (
              <button key={v} className="seg-btn"
                data-active={defaultVis === v ? "true" : undefined}
                onClick={() => setDefaultVis(v)}>{v}</button>
            ))}
          </div>
        </SetRow>
        <SetRow label="Auto-title from first message">
          <SetToggle value={true} onChange={() => {}} />
        </SetRow>
        <SetRow label="Cite sources in answers" hint="TEOS adds file / page references to grounded answers.">
          <SetToggle value={cite} onChange={setCite} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Model" desc="The underlying model TEOS uses across all projects.">
        <SetRow label="Active model">
          <SetSelect value={model}
            options={[
              { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5 (recommended)" },
              { value: "claude-haiku-4.5",  label: "Claude Haiku 4.5 (fastest)"      },
              { value: "claude-opus-4.1",   label: "Claude Opus 4.1 (deepest)"       },
            ]}
            onChange={setModel} />
        </SetRow>
        <SetRow label="Reasoning effort" hint="Higher effort = slower but more thorough multi-step answers.">
          <div className="seg">
            {["low", "balanced", "high"].map((v) => (
              <button key={v} className="seg-btn" data-active={v === "balanced" ? "true" : undefined}>{v}</button>
            ))}
          </div>
        </SetRow>
      </SetGroup>
    </>
  );
}

function NotificationsSection() {
  const ROWS: [string, string, boolean, boolean, boolean][] = [
    ["TEOS suggestions",    "Designs ready, plans drafted, anomalies spotted.",        true,  true,  true ],
    ["Mentions",            "When a teammate @-mentions someone in a shared session.", true,  true,  true ],
    ["Session invitations", "Someone invites a user to a shared session.",             true,  true,  false],
    ["Indexing events",     "Repos finish syncing, documents finish indexing.",        false, true,  false],
    ["Agent failures",      "An agent run errors out or stalls.",                      true,  true,  true ],
    ["Weekly digest",       "Friday summary of what changed across projects.",         false, false, true ],
  ];

  return (
    <>
      <SetGroup title="Delivery channels" desc="Organisation-wide notification policy.">
        <SetRow label="Do not disturb">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SetToggle value={false} onChange={() => {}} />
            <span style={{ fontSize: 12, color: "var(--fg-3)" }}>Pauses all notifications</span>
          </div>
        </SetRow>
        <SetRow label="Schedule quiet hours" hint="Applied in each user's local timezone.">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SetSelect value="20:00" options={["18:00", "19:00", "20:00", "21:00", "22:00"]} onChange={() => {}} />
            <span style={{ color: "var(--fg-3)", fontSize: 12 }}>to</span>
            <SetSelect value="08:00" options={["06:00", "07:00", "08:00", "09:00"]} onChange={() => {}} />
          </div>
        </SetRow>
      </SetGroup>
      <SetGroup title="What gets notified" desc="Organisation defaults per channel.">
        <div className="notif-matrix">
          <div className="notif-matrix-h">
            <div></div><div>In-app</div><div>Email</div><div>Digest</div>
          </div>
          {ROWS.map(([label, hint, a, b, c]) => (
            <div key={label} className="notif-matrix-row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>{hint}</div>
              </div>
              <SetToggle value={a} onChange={() => {}} />
              <SetToggle value={b} onChange={() => {}} />
              <SetToggle value={c} onChange={() => {}} />
            </div>
          ))}
        </div>
      </SetGroup>
    </>
  );
}

function KnowledgeSection() {
  return (
    <>
      <SetGroup title="Indexing" desc="Applies to all repositories and documents across all projects.">
        <SetRow label="Auto re-index repositories">
          <SetSelect value="onpush" options={[
            { value: "onpush",  label: "On every push"  },
            { value: "hourly",  label: "Every hour"     },
            { value: "daily",   label: "Once a day"     },
            { value: "manual",  label: "Manual only"    },
          ]} onChange={() => {}} />
        </SetRow>
        <SetRow label="Document chunk size" hint="Smaller chunks = more precise citations.">
          <SetSelect value="512" options={["256", "512", "1024", "2048"]} onChange={() => {}} />
        </SetRow>
        <SetRow label="Embedding model">
          <SetSelect value="voyage-3" options={["voyage-3", "voyage-large-2", "openai-3-large"]} onChange={() => {}} />
        </SetRow>
      </SetGroup>
      <SetGroup title="Exclusions" desc="Globs ignored across every connected repo in all projects.">
        <SetRow label="Path patterns" vertical>
          <textarea className="form-input" rows={4}
            defaultValue={"node_modules/**\ndist/**\n.next/**\n*.lock\n*.min.js"}
            style={{ height: "auto", padding: 10, fontFamily: "'Geist Mono', monospace", fontSize: 12 }} />
        </SetRow>
        <SetRow label="Include private files in TEOS context">
          <SetToggle value={false} onChange={() => {}} />
        </SetRow>
      </SetGroup>
    </>
  );
}

function IntegrationsSection() {
  const INT = [
    { name: "GitHub",       desc: "Repositories, PRs, issues",          connected: true,  color: "#1a1a1a", letter: "G" },
    { name: "GitLab",       desc: "Repositories, merge requests",        connected: true,  color: "#fc6d26", letter: "L" },
    { name: "Bitbucket",    desc: "Repositories",                        connected: false, color: "#2684ff", letter: "B" },
    { name: "Figma",        desc: "Brand kits, component libraries",     connected: true,  color: "#a259ff", letter: "F" },
    { name: "Notion",       desc: "Wikis and pages",                     connected: true,  color: "#000",    letter: "N" },
    { name: "Confluence",   desc: "Team documentation",                  connected: true,  color: "#0052cc", letter: "C" },
    { name: "Google Drive", desc: "Docs, sheets, slides",                connected: false, color: "#4285f4", letter: "D" },
    { name: "Linear",       desc: "Issues and projects",                 connected: false, color: "#5e6ad2", letter: "L" },
    { name: "Slack",        desc: "Send TEOS notifications to channels", connected: true,  color: "#4a154b", letter: "S" },
    { name: "Okta",         desc: "Workspace SSO",                       connected: false, color: "#007dc1", letter: "O" },
  ];

  return (
    <SetGroup title="Connected services" desc="TEOS pulls knowledge from these sources and can push back into them. Connections apply across all projects.">
      <div className="integration-grid">
        {INT.map((i) => (
          <div key={i.name} className="integration-card">
            <div className="integration-ico" style={{ background: i.color }}>{i.letter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{i.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>{i.desc}</div>
            </div>
            {i.connected ? (
              <button className="pill-btn"><Icon name="check" size="sm" /> Connected</button>
            ) : (
              <button className="pill-btn" data-primary="true">Connect</button>
            )}
          </div>
        ))}
      </div>
    </SetGroup>
  );
}

function ShortcutsSection() {
  const ROWS: [string, string[]][] = [
    ["Open command palette",    ["⌘", "K"]],
    ["Toggle TEOS sidebar",     ["⌘", "/"]],
    ["New TEOS session",        ["⌘", "⇧", "N"]],
    ["Switch project",          ["⌘", "P"]],
    ["Go to Dashboard",         ["G", "D"]],
    ["Go to Repositories",      ["G", "R"]],
    ["Go to Documents",         ["G", "O"]],
    ["Go to Agents",            ["G", "A"]],
    ["Go to Inbox",             ["G", "I"]],
    ["Mark current item read",  ["E"]],
    ["Send message",            ["⏎"]],
    ["New line in message",     ["⇧", "⏎"]],
    ["Quick-route to Designer", ["⌘", "D"]],
    ["Quick-route to Planner",  ["⌘", "L"]],
  ];

  return (
    <SetGroup title="Keyboard shortcuts" desc="Platform-defined shortcuts applied across all projects.">
      <SetRow label="Scheme" hint="Affects keymaps across the app for all users.">
        <div className="seg">
          {["default", "vim", "emacs"].map((s) => (
            <button key={s} className="seg-btn" data-active={s === "default" ? "true" : undefined}>{s}</button>
          ))}
        </div>
      </SetRow>
      <div className="shortcut-list">
        {ROWS.map(([label, keys]) => (
          <div key={label} className="shortcut-row">
            <span>{label}</span>
            <span className="shortcut-keys">
              {keys.map((k, i) => <kbd key={i}>{k}</kbd>)}
            </span>
          </div>
        ))}
      </div>
    </SetGroup>
  );
}

function PrivacySection() {
  return (
    <>
      <SetGroup title="Data handling" desc="Organisation-wide data policies.">
        <SetRow label="Allow TEOS to learn from sessions" hint="Improves answers across all projects. Never sent outside.">
          <SetToggle value={true} onChange={() => {}} />
        </SetRow>
        <SetRow label="Share anonymized usage telemetry">
          <SetToggle value={false} onChange={() => {}} />
        </SetRow>
        <SetRow label="Retain session history for" hint="Older sessions are archived, then deleted for all users.">
          <SetSelect value="365" options={[
            { value: "30",  label: "30 days"  },
            { value: "90",  label: "90 days"  },
            { value: "180", label: "6 months" },
            { value: "365", label: "1 year"   },
            { value: "0",   label: "Forever"  },
          ]} onChange={() => {}} />
        </SetRow>
      </SetGroup>
      <SetGroup title="Export & delete">
        <SetRow label="Export all workspace data">
          <button className="pill-btn"><Icon name="upload" size="sm" /> Request export</button>
        </SetRow>
        <SetRow label="Delete all session history">
          <button className="pill-btn danger">Delete history</button>
        </SetRow>
      </SetGroup>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkspaceSettings() {
  const [section, setSection] = useState("branding");

  return (
    <div className="main-scroll">
      <h1 className="h-page">Settings</h1>
      <p className="sub-page">Organisation-wide configuration. These settings apply uniformly across all projects.</p>

      <div className="settings-layout">
        <aside className="settings-nav glass">
          {SECTIONS.map((s) => (
            <button key={s.id} className="settings-nav-row"
              data-active={section === s.id ? "true" : undefined}
              onClick={() => setSection(s.id)}>
              <Icon name={s.icon} size="sm" />
              <span>{s.label}</span>
            </button>
          ))}
        </aside>

        <section className="settings-pane glass">
          {section === "branding"      && <BrandingSection />}
          {section === "appearance"    && <AppearanceSection />}
          {section === "ai"            && <AiSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "knowledge"     && <KnowledgeSection />}
          {section === "integrations"  && <IntegrationsSection />}
          {section === "shortcuts"     && <ShortcutsSection />}
          {section === "privacy"       && <PrivacySection />}
        </section>
      </div>
    </div>
  );
}
