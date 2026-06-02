import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPlans, createPlan, deletePlan } from "../../lib/api";
import type { Plan } from "../../types";

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "#98989d" },
  confirmed: { label: "Confirmed", color: "#0a84ff" },
  executing: { label: "Executing", color: "#ff9f0a" },
  completed: { label: "Done",      color: "#30d158" },
  failed:    { label: "Failed",    color: "#ff375f" },
};

export default function ProjectPlans({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    getPlans(projectId)
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const plan = await createPlan(projectId, newTitle.trim() || undefined);
      setPlans((prev) => [plan, ...prev]);
      setShowForm(false);
      setNewTitle("");
      navigate(`/projects/${projectId}/plans/${plan.id}`);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (planId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deletePlan(planId).catch(() => {});
    setPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Plans</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
            Agentic SDLC plans — plan, implement, review, and test features
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: "8px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            border: "none", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          + New Plan
        </button>
      </div>

      {/* New plan form */}
      {showForm && (
        <div style={{
          padding: 16, borderRadius: 12,
          background: "var(--glass)", border: "0.5px solid var(--glass-edge)",
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowForm(false); }}
            placeholder="Plan title (optional — AI will refine it)"
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8,
              border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)",
              color: "var(--label-primary)", fontSize: 14, outline: "none",
            }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: "8px 16px", borderRadius: 8,
              background: "#0a84ff", border: "none",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {creating ? "Creating…" : "Start"}
          </button>
          <button
            onClick={() => setShowForm(false)}
            style={{
              padding: "8px 12px", borderRadius: 8,
              background: "none", border: "0.5px solid var(--hairline)",
              color: "var(--label-secondary)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Plan list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map((i) => (
            <div key={i} style={{ height: 80, borderRadius: 12, background: "var(--fill-quaternary)" }} />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--label-tertiary)" }}>
          <i className="fa-solid fa-clipboard-list" aria-hidden="true" style={{ fontSize: 48, marginBottom: 16, display: "block" }} />
          <p style={{ fontSize: 14, margin: 0, color: "var(--label-secondary)" }}>No plans yet</p>
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>Create a plan to start the agentic SDLC workflow</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map((plan) => {
            const statusInfo = STATUS_COLORS[plan.status] ?? STATUS_COLORS.draft;
            const createdDate = new Date(plan.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            return (
              <div
                key={plan.id}
                onClick={() => navigate(`/projects/${projectId}/plans/${plan.id}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                  background: "var(--glass)", border: "0.5px solid var(--glass-edge)",
                  boxShadow: "var(--shadow-glass-panel)",
                  transition: "border-color 120ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0a84ff60")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--glass-edge)")}
              >
                {/* Status dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: statusInfo.color, flexShrink: 0,
                  boxShadow: `0 0 6px ${statusInfo.color}80`,
                }} />

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--label-primary)", marginBottom: 2 }}>
                    {plan.title ?? "Untitled plan"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--label-tertiary)" }}>
                    {createdDate} · <span style={{ color: statusInfo.color }}>{statusInfo.label}</span>
                  </div>
                </div>

                {/* Open arrow */}
                <span style={{ color: "var(--label-quaternary)", fontSize: 16 }}>›</span>

                {/* Delete */}
                <button
                  onClick={(e) => handleDelete(plan.id, e)}
                  style={{
                    padding: "4px 8px", borderRadius: 6,
                    background: "#ff375f15", border: "1px solid #ff375f30",
                    color: "#ff375f", fontSize: 11, cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
