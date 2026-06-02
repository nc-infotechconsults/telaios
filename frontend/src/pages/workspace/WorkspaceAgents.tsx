import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { listAgentBaseProfiles, listAgentOverrides } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentBaseProfile, AgentOverride } from "../../types";
import AgentOverrideForm from "../../components/agents/AgentOverrideForm";

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

export default function WorkspaceAgents() {
  const [bases, setBases] = useState<AgentBaseProfile[]>([]);
  const [overrides, setOverrides] = useState<AgentOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AgentBaseProfile | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, o] = await Promise.all([listAgentBaseProfiles(), listAgentOverrides()]);
      setBases(b);
      setOverrides(o);
    } catch {
      toast.error("Failed to load agent profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const overrideMap = new Map<string, AgentOverride>(overrides.map((o) => [o.base_profile_id, o]));
  const direct   = bases.filter((b) => b.dispatch === "direct");
  const workflow = bases.filter((b) => b.dispatch === "workflow" || b.dispatch === null);

  const renderCard = (base: AgentBaseProfile) => {
    const isCustomised = overrideMap.has(base.id);
    const icon = ROLE_ICON[base.role] ?? "chat";
    const bg   = ROLE_BG[base.role]   ?? ROLE_BG.custom;

    return (
      <div
        key={base.id}
        className="card"
        style={{ padding: 16, cursor: "pointer" }}
        onClick={() => setSelected(base)}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: bg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name={icon} size="sm" style={{ color: "#fff" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{base.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
                background: isCustomised ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.07)",
                color: isCustomised ? "#0a84ff" : "var(--fg-3)",
              }}>
                {isCustomised ? "Customised" : "Default"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2, textTransform: "capitalize" }}>
              {base.role}
            </div>
          </div>
        </div>

        {base.description && (
          <p style={{
            fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 10px", lineHeight: 1.5,
            overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
          }}>
            {base.description}
          </p>
        )}

        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            className="pill-btn"
            style={{ fontSize: 11 }}
            onClick={() => setSelected(base)}
          >
            Customise
          </button>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ label }: { label: string }) => (
    <h2 style={{
      fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase",
      letterSpacing: "0.08em", marginBottom: 10, marginTop: 28,
    }}>
      {label}
    </h2>
  );

  return (
    <div className="main-scroll">
      <h1 className="h-page" style={{ marginBottom: 4 }}>Agent Profiles</h1>
      <p className="sub-page">
        Platform-defined roles — customise LLM, prompt, and tools at workspace level.
      </p>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
      )}

      {!loading && direct.length > 0 && (
        <>
          <SectionHeader label="Direct dispatch" />
          <div className="grid-3">{direct.map(renderCard)}</div>
        </>
      )}

      {!loading && workflow.length > 0 && (
        <>
          <SectionHeader label="Workflow agents" />
          <div className="grid-3">{workflow.map(renderCard)}</div>
        </>
      )}

      {selected && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
            overflowY: "auto", display: "flex", alignItems: "flex-start",
            justifyContent: "center", padding: 40,
          }}
          onClick={() => setSelected(null)}
        >
          <div style={{ width: "100%", maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <AgentOverrideForm
              base={selected}
              existing={overrideMap.get(selected.id)}
              onSaved={() => { setSelected(null); void load(); }}
              onCancel={() => setSelected(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
