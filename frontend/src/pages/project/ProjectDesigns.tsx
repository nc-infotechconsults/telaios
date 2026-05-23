import { useEffect, useState } from "react";
import { listDesignSessions, createDesignSession } from "../../lib/api";
import type { DesignSession } from "../../types";

export default function ProjectDesigns({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<DesignSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [focusSession, setFocusSession] = useState<DesignSession | null>(null);

  useEffect(() => {
    listDesignSessions(projectId)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const s = await createDesignSession(projectId, `Design ${new Date().toLocaleDateString()}`);
      setSessions((prev) => [s, ...prev]);
    } finally {
      setCreating(false);
    }
  };

  if (focusSession) {
    return (
      <FocusView
        session={focusSession}
        projectId={projectId}
        onClose={() => setFocusSession(null)}
      />
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Designs</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
            AI-generated UI designs and prototypes
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #ff9f0a, #bf5af2)",
            border: "none",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: creating ? "default" : "pointer",
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? "Creating…" : "+ New Design"}
        </button>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 180, borderRadius: 18, background: "var(--fill-quaternary)" }} aria-hidden="true" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
          <p style={{ fontSize: 14, margin: 0, color: "var(--label-secondary)" }}>No designs yet</p>
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>Create a design session to start with TEOS Designer</p>
          <button onClick={handleCreate} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #ff9f0a, #bf5af2)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Start designing
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }} role="list" aria-label="Design sessions">
          {sessions.map((s) => (
            <button
              key={s.id}
              role="listitem"
              onClick={() => setFocusSession(s)}
              style={{
                background: "var(--glass)",
                backdropFilter: "blur(20px)",
                border: "0.5px solid var(--glass-edge)",
                borderRadius: 18,
                padding: 0,
                overflow: "hidden",
                cursor: "pointer",
                boxShadow: "var(--shadow-glass-panel)",
                textAlign: "left",
                transition: "transform 200ms, box-shadow 200ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-glass-lg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "none";
                (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-glass-panel)";
              }}
            >
              {/* Preview area */}
              <div
                style={{
                  height: 130,
                  background: `linear-gradient(135deg, rgba(255,159,10,0.2), rgba(191,90,242,0.2))`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                }}
                aria-hidden="true"
              >
                ✦
              </div>
              {/* Info */}
              <div style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
                  {s.title ?? "Untitled Design"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: s.status === "active" ? "rgba(48,209,88,0.15)" : "var(--fill-tertiary)",
                      color: s.status === "active" ? "#30d158" : "var(--label-tertiary)",
                    }}
                  >
                    {s.status}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--label-quaternary)" }}>
                    {new Date(s.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FocusView({
  session,
  projectId: _projectId,
  onClose,
}: {
  session: DesignSession;
  projectId: string;
  onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Preview */}
      <div style={{ flex: 1, borderRight: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--fill-quaternary)" }}>
        <div style={{ textAlign: "center", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }} aria-hidden="true">✦</div>
          <p style={{ fontSize: 14, color: "var(--label-secondary)" }}>{session.title ?? "Design Preview"}</p>
          <p style={{ fontSize: 12 }}>Design artifacts will render here</p>
        </div>
      </div>
      {/* Chat with TEOS Designer */}
      <div style={{ width: 340, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }} aria-hidden="true">✦</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#ff9f0a" }}>TEOS Designer</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--label-tertiary)", fontSize: 18, padding: "0 4px" }} aria-label="Close focus view">×</button>
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--label-tertiary)" }}>
          <p style={{ fontSize: 13 }}>Chat with the Designer specialist for this design session.</p>
        </div>
        <div style={{ padding: "12px 14px", borderTop: "0.5px solid var(--hairline)" }}>
          <input
            type="text"
            placeholder="Describe what you want to design…"
            aria-label="Design input"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 12, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>
      </div>
    </div>
  );
}
