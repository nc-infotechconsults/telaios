import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { listProjectMembers } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Mock data ────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { id: "m-elena", name: "Elena Navarro", email: "elena@acme.com", initial: "EN", color: "av-2", role: "Owner",  online: true,  you: true  },
  { id: "m-lina",  name: "Lina Park",     email: "lina@acme.com",  initial: "LP", color: "av-1", role: "Editor", online: true,  you: false },
  { id: "m-sam",   name: "Sam Okafor",    email: "sam@acme.com",   initial: "SO", color: "av-2", role: "Editor", online: true,  you: false },
  { id: "m-mei",   name: "Mei Tanaka",    email: "mei@acme.com",   initial: "MT", color: "av-4", role: "Editor", online: false, you: false },
  { id: "m-dev",   name: "Dev Krishnan",  email: "dev@acme.com",   initial: "DK", color: "av-5", role: "Viewer", online: false, you: false },
  { id: "m-priya", name: "Priya Nair",    email: "priya@acme.com", initial: "PN", color: "av-3", role: "Viewer", online: false, you: false },
];

const AVATAR_COLORS = ["av-1", "av-2", "av-3", "av-4", "av-5"];

const ROLE_COLOR: Record<string, string> = {
  owner:  "#bf5af2",
  editor: "#0a84ff",
  viewer: "#ff9f0a",
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  initial: string;
  color: string;
  role: string;
  online: boolean;
  you: boolean;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>(DEMO ? TEAM_MEMBERS : []);
  const [loading, setLoading] = useState(!DEMO);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (DEMO) return;
    setLoading(true);
    listProjectMembers(projectId)
      .then((data) => {
        const rows: TeamMember[] = data.map((m, i) => ({
          id: m.user_id,
          name: m.user.display_name,
          email: m.user.email,
          initial: m.user.display_name.slice(0, 2).toUpperCase(),
          color: AVATAR_COLORS[i % AVATAR_COLORS.length],
          role: m.role,
          online: false,
          you: m.user_id === currentUser?.id,
        }));
        setMembers(rows);
      })
      .finally(() => setLoading(false));
  }, [projectId, currentUser?.id]);

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Team</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            {members.length} members with access to this project.
          </p>
        </div>
        <button className="pill-btn" data-primary="true" onClick={() => setShowInvite(true)}>
          <Icon name="plus" size="sm" /> Invite people
        </button>
      </div>

      {loading && (
        <div className="card" style={{ padding: "32px 24px", textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
          Loading team…
        </div>
      )}

      {!loading && (
      <div className="grid-3">
        {members.map((m) => {
          const roleColor = ROLE_COLOR[m.role] || "var(--fg-3)";
          return (
            <div key={m.id} className="card team-card">
              {/* Online indicator */}
              <div style={{ position: "relative", width: "fit-content", margin: "0 auto 12px" }}>
                <div className={"tm-avatar act-avatar " + m.color} style={{ width: 52, height: 52, fontSize: 16, borderRadius: 16 }}>
                  {m.initial}
                </div>
                {m.online && <span className="tm-online" />}
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {m.name}
                  {m.you && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#0a84ff",
                      background: "#0a84ff18", padding: "1px 6px", borderRadius: 9999 }}>
                      You
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 3 }}>{m.email}</div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 9999,
                  background: roleColor + "20", color: roleColor, border: `0.5px solid ${roleColor}40`,
                }}>
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
                <button className="pill-btn" style={{ height: 26 }}>
                  <Icon name="chat" size="sm" />
                </button>
                {!m.you && (
                  <button className="pill-btn" style={{ height: 26 }}>
                    <Icon name="settings" size="sm" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="cmd-overlay" onClick={() => setShowInvite(false)}>
          <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: 480, padding: 0 }}>
            <div style={{ padding: "20px 22px 6px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Invite people to Atlas</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 4 }}>
                They'll get an email invite and can use TEOS and everything indexed in this project.
              </div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div className="form-l">Email address</div>
              <input className="form-input" placeholder="name@acme.com"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <div className="form-l" style={{ marginTop: 14 }}>Role</div>
              <div className="seg">
                {["Member", "Admin", "Viewer"].map((r) => (
                  <button key={r} className="seg-btn" data-active={r === "Member" ? "true" : undefined}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: 18, display: "flex", gap: 8, justifyContent: "flex-end",
              borderTop: "0.5px solid var(--hairline)" }}>
              <button className="pill-btn" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="pill-btn" data-primary="true" onClick={() => setShowInvite(false)}>
                <Icon name="send" size="sm" /> Send invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
