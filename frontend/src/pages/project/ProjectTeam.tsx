import { useEffect, useState } from "react";
import {
  listProjectMembers,
  addProjectMember,
  patchProjectMember,
  removeProjectMember,
  listUsers,
} from "../../lib/api";
import type { ProjectMember, ProjectRole, User } from "../../types";

const ROLE_COLORS: Record<string, string> = {
  owner: "#ff375f",
  editor: "#0a84ff",
  viewer: "var(--label-tertiary)",
};

const AVATAR_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#5e5ce6", "#ff375f", "#64d2ff"];

// ─── Add Member Modal ─────────────────────────────────────────────────────────

interface AddMemberModalProps {
  projectId: string;
  currentMemberIds: string[];
  onClose: () => void;
  onAdded: (member: ProjectMember) => void;
}

function AddMemberModal({ projectId, currentMemberIds, onClose, onAdded }: AddMemberModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((all) => {
        const available = all.filter((u) => !currentMemberIds.includes(u.id));
        setUsers(available);
        if (available.length > 0) setSelectedUserId(available[0].id);
      })
      .finally(() => setLoadingUsers(false));
  }, [currentMemberIds]);

  const handleSubmit = async () => {
    if (!selectedUserId) {
      setError("Please select a user.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const member = await addProjectMember(projectId, { user_id: selectedUserId, role });
      onAdded(member);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add member.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--glass)",
          backdropFilter: "blur(40px)",
          border: "0.5px solid var(--glass-edge)",
          borderRadius: 20,
          padding: 28,
          width: 360,
          boxShadow: "var(--shadow-glass-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>Add Member</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--label-tertiary)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", marginBottom: 6 }}>
              User
            </label>
            {loadingUsers ? (
              <div style={{ fontSize: 12, color: "var(--label-tertiary)" }}>Loading users…</div>
            ) : users.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--label-tertiary)" }}>No available users to add.</div>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--fill-secondary)",
                  border: "0.5px solid var(--glass-edge)",
                  borderRadius: 10,
                  color: "var(--label-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ? `${u.display_name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", marginBottom: 6 }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ProjectRole)}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--fill-secondary)",
                border: "0.5px solid var(--glass-edge)",
                borderRadius: 10,
                color: "var(--label-primary)",
                fontSize: 13,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#ff375f", background: "#ff375f18", border: "1px solid #ff375f30", borderRadius: 8, padding: "6px 10px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 18px",
                background: "var(--fill-secondary)",
                border: "0.5px solid var(--glass-edge)",
                borderRadius: 10,
                color: "var(--label-secondary)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || loadingUsers || users.length === 0}
              style={{
                padding: "8px 18px",
                background: "#0a84ff",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting || loadingUsers || users.length === 0 ? "not-allowed" : "pointer",
                opacity: submitting || loadingUsers || users.length === 0 ? 0.5 : 1,
              }}
            >
              {submitting ? "Adding…" : "Add Member"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    listProjectMembers(projectId)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m))
    );
    try {
      await patchProjectMember(projectId, userId, { role: newRole });
    } catch {
      // Revert on failure by re-fetching
      listProjectMembers(projectId).then(setMembers);
    }
  };

  const handleRemove = async (userId: string) => {
    // Optimistic update
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    try {
      await removeProjectMember(projectId, userId);
    } catch {
      // Revert on failure by re-fetching
      listProjectMembers(projectId).then(setMembers);
    }
  };

  const handleMemberAdded = (member: ProjectMember) => {
    setMembers((prev) => [...prev, member]);
    setShowAddModal(false);
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Team</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
            {members.length} member{members.length !== 1 ? "s" : ""} in this project
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "#0a84ff",
            border: "none",
            borderRadius: 12,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Add Member
        </button>
      </div>

      {/* Member Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 160, borderRadius: 16, background: "var(--fill-quaternary)" }} aria-hidden="true" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <p style={{ fontSize: 14, margin: 0, color: "var(--label-secondary)" }}>No team members yet</p>
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>Click "Add Member" to invite someone to this project.</p>
        </div>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}
          role="list"
          aria-label="Team members"
        >
          {members.map((member, idx) => {
            const displayName = member.user.display_name || member.user.email.split("@")[0];
            const initials = displayName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
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
                  padding: "20px 16px 14px",
                  textAlign: "center",
                  boxShadow: "var(--shadow-glass-panel)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Avatar */}
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

                {/* Name + Email */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)" }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 2 }}>
                    {member.user.email}
                  </div>
                </div>

                {/* Role dropdown */}
                <div
                  style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: `${roleColor}18`,
                    border: `0.5px solid ${roleColor}30`,
                  }}
                >
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleRoleChange(member.user_id, e.target.value as ProjectRole)
                    }
                    aria-label={`Change role for ${displayName}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "transparent",
                      border: "none",
                      color: roleColor,
                      cursor: "pointer",
                      outline: "none",
                      appearance: "none",
                      WebkitAppearance: "none",
                      paddingRight: 12,
                    }}
                  >
                    <option value="owner">owner</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                </div>

                {/* Joined date */}
                <div style={{ fontSize: 10, color: "var(--label-quaternary)" }}>
                  Since {new Date(member.joined_at).toLocaleDateString()}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(member.user_id)}
                  aria-label={`Remove ${displayName} from project`}
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: "#ff375f",
                    background: "#ff375f15",
                    border: "1px solid #ff375f30",
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal
          projectId={projectId}
          currentMemberIds={members.map((m) => m.user_id)}
          onClose={() => setShowAddModal(false)}
          onAdded={handleMemberAdded}
        />
      )}
    </div>
  );
}
