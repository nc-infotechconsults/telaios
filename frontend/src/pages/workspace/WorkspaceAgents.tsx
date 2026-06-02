import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { AppModal } from "../../components/AppModal";
import { listAgentBaseProfiles, listAgentOverrides } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentBaseProfile, AgentOverride } from "../../types";
import AgentOverrideForm from "../../components/agents/AgentOverrideForm";

// ─── Constants ────────────────────────────────────────────────────────────────

type DispatchFilter = "all" | "direct" | "workflow";

const ROLE_ICON: Record<string, string> = {
  planner:            "workflow",
  coder:              "git",
  reviewer:           "eye",
  tester:             "layers",
  infra:              "settings",
  knowledge:          "book",
  "document-copilot": "file",
  designer:           "spark",
  custom:             "chat",
};

const ROLE_BG: Record<string, string> = {
  planner:            "linear-gradient(135deg,#30d158,#0a84ff)",
  coder:              "linear-gradient(135deg,#0a84ff,#64d2ff)",
  reviewer:           "linear-gradient(135deg,#ff9f0a,#ff375f)",
  tester:             "linear-gradient(135deg,#bf5af2,#ff375f)",
  infra:              "linear-gradient(135deg,#5e5ce6,#0a84ff)",
  knowledge:          "linear-gradient(135deg,#5e5ce6,#0a84ff)",
  "document-copilot": "linear-gradient(135deg,#64d2ff,#0a84ff)",
  designer:           "linear-gradient(135deg,#ff9f0a,#ff375f)",
  custom:             "linear-gradient(135deg,#bf5af2,#5e5ce6)",
};

const ROLE_BAR: Record<string, string> = {
  planner:            "#30d158",
  coder:              "#0a84ff",
  reviewer:           "#ff9f0a",
  tester:             "#bf5af2",
  infra:              "#5e5ce6",
  knowledge:          "#5e5ce6",
  "document-copilot": "#64d2ff",
  designer:           "#ff9f0a",
  custom:             "#bf5af2",
};

// ─── FA icon helper ───────────────────────────────────────────────────────────

function Fa({ icon, style }: { icon: string; style?: React.CSSProperties }) {
  return <i className={`fa-solid ${icon}`} style={style} />;
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  base,
  isCustomised,
  onCustomise,
}: {
  base: AgentBaseProfile;
  isCustomised: boolean;
  onCustomise: (b: AgentBaseProfile) => void;
}) {
  const icon = ROLE_ICON[base.role] ?? "chat";
  const bg   = ROLE_BG[base.role]   ?? ROLE_BG.custom;
  const bar  = ROLE_BAR[base.role]  ?? "#5e5ce6";
  const dispatch = base.dispatch ?? "workflow";

  return (
    <div
      className="card agent-card"
      onClick={() => onCustomise(base)}
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
        display: "flex",
      }}
    >
      {/* Left color bar */}
      <div style={{ width: 4, background: bar, flexShrink: 0 }} />

      <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>

        {/* Row 1: avatar + name + badges */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: bg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name={icon} size="sm" style={{ color: "#fff" }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14.5, color: "var(--fg)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginBottom: 2,
            }}>
              {base.name}
            </div>
            <span style={{
              display: "inline-block",
              fontSize: 11, fontWeight: 600, textTransform: "capitalize",
              color: "var(--fg-3)",
            }}>
              {base.role}
            </span>
          </div>

          {/* Customised badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20, flexShrink: 0,
            background: isCustomised ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.07)",
            color: isCustomised ? "#0a84ff" : "var(--fg-3)",
            fontSize: 11, fontWeight: 600,
          }}>
            {isCustomised ? "Customised" : "Default"}
          </span>
        </div>

        {/* Description */}
        {base.description && (
          <p style={{
            fontSize: 12.5, color: "var(--fg-3)", margin: 0, lineHeight: 1.55,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {base.description}
          </p>
        )}

        {/* Divider */}
        <div style={{ height: "0.5px", background: "var(--hairline)" }} />

        {/* Bottom row: dispatch type + action */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Fa
              icon={dispatch === "direct" ? "fa-bolt" : "fa-diagram-project"}
              style={{ fontSize: 11, color: "var(--fg-4)" }}
            />
            <span style={{ fontSize: 12, color: "var(--fg-3)", textTransform: "capitalize" }}>
              {dispatch === "direct" ? "Direct dispatch" : "Workflow agent"}
            </span>
          </div>
          <button
            className="pill-btn"
            style={{ fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); onCustomise(base); }}
          >
            Customise
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkspaceAgents() {
  const [bases, setBases] = useState<AgentBaseProfile[]>([]);
  const [overrides, setOverrides] = useState<AgentOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AgentBaseProfile | null>(null);
  const [search, setSearch] = useState("");
  const [dispatchFilter, setDispatchFilter] = useState<DispatchFilter>("all");

  const load = async () => {
    setLoading(true);
    try {
      const [b, o] = await Promise.all([listAgentBaseProfiles(), listAgentOverrides()]);
      setBases(b);
      setOverrides(o);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const overrideMap = new Map<string, AgentOverride>(overrides.map((o) => [o.base_profile_id, o]));

  const filtered = bases.filter((b) => {
    const matchesSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) || (b.description ?? "").toLowerCase().includes(search.toLowerCase());
    const dispatch = b.dispatch ?? "workflow";
    const matchesDispatch =
      dispatchFilter === "all" ||
      (dispatchFilter === "direct" && dispatch === "direct") ||
      (dispatchFilter === "workflow" && dispatch !== "direct");
    return matchesSearch && matchesDispatch;
  });

  const dispatchChips: { label: string; value: DispatchFilter }[] = [
    { label: "All",      value: "all" },
    { label: "Direct",   value: "direct" },
    { label: "Workflow", value: "workflow" },
  ];

  return (
    <div className="main-scroll" style={{ position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Agents</h1>
      </div>
      <p className="sub-page" style={{ marginBottom: 20 }}>
        <b style={{ color: "var(--fg-2)" }}>{bases.length}</b> agent{bases.length !== 1 ? "s" : ""} — customise LLM, prompt, and tools at workspace level
      </p>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180 }}>
          <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer", background: "none", border: "none" }}>
              <Fa icon="fa-xmark" />
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {dispatchChips.map((chip) => (
            <button
              key={chip.value}
              className="pill-btn"
              onClick={() => setDispatchFilter(chip.value)}
              style={{
                background: dispatchFilter === chip.value ? "var(--accent-1)" : "var(--glass-weak)",
                color: dispatchFilter === chip.value ? "#fff" : "var(--fg-2)",
                borderColor: dispatchFilter === chip.value ? "transparent" : "var(--hairline)",
                transition: "all 0.15s",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>Loading…</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
          {search
            ? `No agents match "${search}"`
            : `No ${dispatchFilter === "all" ? "" : dispatchFilter + " "}agents`}
        </div>
      )}

      {/* Agent list */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((base) => (
            <AgentCard
              key={base.id}
              base={base}
              isCustomised={overrideMap.has(base.id)}
              onCustomise={setSelected}
            />
          ))}
        </div>
      )}

      {/* Override modal */}
      <AppModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected ? `${selected.role} · ${(selected.dispatch ?? "workflow") === "direct" ? "Direct dispatch" : "Workflow agent"}` : undefined}
        width={700}
      >
        {selected && (
          <AgentOverrideForm
            base={selected}
            existing={overrideMap.get(selected.id)}
            onSaved={() => { setSelected(null); void load(); }}
            onCancel={() => setSelected(null)}
          />
        )}
      </AppModal>

      <style>{`
        .agent-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.13);
        }
      `}</style>
    </div>
  );
}
