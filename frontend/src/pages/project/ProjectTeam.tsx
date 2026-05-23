import { useEffect, useState } from "react";
import { listProjectMembers } from "../../lib/api";
import type { ProjectMember } from "../../types";

const ROLE_COLORS: Record<string, string> = {
  owner: "#ff375f",
  editor: "#0a84ff",
  viewer: "var(--label-tertiary)",
};

const AVATAR_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#5e5ce6", "#ff375f", "#64d2ff"];

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjectMembers(projectId)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Team</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
          {members.length} member{members.length !== 1 ? "s" : ""} in this project
        </p>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 120, borderRadius: 16, background: "var(--fill-quaternary)" }} aria-hidden="true" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <p style={{ fontSize: 14, margin: 0, color: "var(--label-secondary)" }}>No team members yet</p>
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>Add members from the Project Settings</p>
        </div>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}
          role="list"
          aria-label="Team members"
        >
          {members.map((member, idx) => {
            const displayName = member.user.display_name || member.user.email.split("@")[0];
            const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const roleColor = ROLE_COLORS[member.role] ?? "var(--label-tertiary)";

            return (
              <div
                key={member.user_id}
                role="listitem"
                style={{
                  background: "var(--glass)",
                  backdropFilter: "blur(20px)",
                  border: "0.5px solid var(--glass-edge)",
                  borderRadius: 18,
                  padding: "20px 16px",
                  textAlign: "center",
                  boxShadow: "var(--shadow-glass-panel)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#fff",
                    boxShadow: `0 4px 12px ${avatarColor}40`,
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)" }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 2 }}>
                    {member.user.email}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: `${roleColor}18`,
                    color: roleColor,
                    border: `0.5px solid ${roleColor}30`,
                  }}
                >
                  {member.role}
                </span>
                <div style={{ fontSize: 10, color: "var(--label-quaternary)" }}>
                  Since {new Date(member.joined_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
