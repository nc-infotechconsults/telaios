import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  listProjectMembers,
  patchProjectMember,
  removeProjectMember,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

const PROJECT_ROLES = {
  owner:  { label: "Owner",  color: "#bf5af2", desc: "Full control, including billing and deleting the project." },
  editor: { label: "Editor", color: "#0a84ff", desc: "Manage members, knowledge sources and agent configuration." },
  viewer: { label: "Viewer", color: "#ff9f0a", desc: "Read-only access to sessions and documents." },
} as const;

type Role = keyof typeof PROJECT_ROLES;
const ROLE_ORDER: Role[] = ["owner", "editor", "viewer"];
const ASSIGNABLE: Role[] = ["editor", "viewer"];

const SEAT_LIMIT = 25;

const SEED_MEMBERS: MemberRow[] = [
  { id: "m-elena", name: "Elena Navarro", email: "elena@acme.com", initial: "EN", color: "av-2", role: "owner",  you: true,  status: "online",  joined: "Founder" },
  { id: "m-lina",  name: "Lina Park",     email: "lina@acme.com",  initial: "LP", color: "av-1", role: "editor", you: false, status: "online",  joined: "8 months ago" },
  { id: "m-sam",   name: "Sam Okafor",    email: "sam@acme.com",   initial: "SO", color: "av-2", role: "editor", you: false, status: "online",  joined: "6 months ago" },
  { id: "m-mei",   name: "Mei Tanaka",    email: "mei@acme.com",   initial: "MT", color: "av-4", role: "editor", you: false, status: "away",    joined: "1 year ago" },
  { id: "m-dev",   name: "Dev Krishnan",  email: "dev@acme.com",   initial: "DK", color: "av-5", role: "viewer", you: false, status: "offline", joined: "3 months ago" },
  { id: "m-priya", name: "Priya Nair",    email: "priya@acme.com", initial: "PN", color: "av-3", role: "viewer", you: false, status: "offline", joined: "2 weeks ago" },
];

const SEED_INVITES = [
  { id: "inv-1", email: "jonas.weber@acme.com", role: "editor" as Role, by: "Elena Navarro", time: "2 days ago" },
  { id: "inv-2", email: "ravi@contractor.dev",  role: "viewer" as Role, by: "Lina Park",     time: "5 hours ago" },
];

const AVATAR_COLORS = ["av-1", "av-2", "av-3", "av-4", "av-5"];

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

type MemberRow = {
  id: string;
  name: string;
  email: string;
  initial: string;
  color: string;
  role: Role;
  you: boolean;
  status: "online" | "away" | "offline";
  joined: string;
};

const PERMISSIONS = [
  { cap: "View sessions & documents",  sub: "Read everything in the project",           roles: ["owner", "editor", "viewer"] },
  { cap: "Ask TEOS & create sessions", sub: "Start and contribute to conversations",    roles: ["owner", "editor"] },
  { cap: "Upload & connect sources",   sub: "Add repos, documents and integrations",    roles: ["owner", "editor"] },
  { cap: "Configure agents & skills",  sub: "Edit agents, MCP servers and skills",      roles: ["owner", "editor"] },
  { cap: "Manage members & roles",     sub: "Invite, remove and change roles",          roles: ["owner", "editor"] },
  { cap: "Manage plan & billing",      sub: "Seats, invoices and the subscription",     roles: ["owner"] },
  { cap: "Delete project",             sub: "Permanently remove this project",          roles: ["owner"] },
] as const;

const statusLabel = { online: "Active now", away: "Away", offline: "Offline" };

function RoleDot({ role }: { role: Role }) {
  return <span className="role-dot" style={{ background: PROJECT_ROLES[role].color }} />;
}

function RolePicker({ value, onChange, locked }: { value: Role; onChange: (r: Role) => void; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="role-wrap">
      <button className="role-pill" data-locked={locked} onClick={() => !locked && setOpen((v) => !v)}>
        <RoleDot role={value} />
        {PROJECT_ROLES[value].label}
        {!locked && <Icon name="chevd" size="sm" className="vis-chev" />}
      </button>
      {open && (
        <>
          <div className="vis-backdrop" onClick={() => setOpen(false)} />
          <div className="vis-menu" style={{ minWidth: 248 }}>
            <div className="vis-menu-h">Change role</div>
            {ASSIGNABLE.map((id) => (
              <button key={id} className="vis-menu-item" data-active={value === id}
                onClick={() => { onChange(id); setOpen(false); }}>
                <div className="vis-menu-text">
                  <b><RoleDot role={id} /> {PROJECT_ROLES[id].label}</b>
                  <span>{PROJECT_ROLES[id].desc}</span>
                </div>
                {value === id && <Icon name="check" size="sm" className="vis-check" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectMembers({ projectId }: { projectId: string }) {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<"members" | "invites" | "roles">("members");
  const [members, setMembers] = useState<MemberRow[]>(DEMO ? SEED_MEMBERS : []);
  const [invites, setInvites] = useState(SEED_INVITES);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(!DEMO);

  useEffect(() => {
    if (DEMO) return;
    setLoading(true);
    listProjectMembers(projectId)
      .then((data) => {
        const rows: MemberRow[] = data.map((m, i) => {
          const initials = m.user.display_name.slice(0, 2).toUpperCase();
          return {
            id: m.user_id,
            name: m.user.display_name,
            email: m.user.email,
            initial: initials,
            color: AVATAR_COLORS[i % AVATAR_COLORS.length],
            role: m.role as Role,
            you: m.user_id === currentUser?.id,
            status: "offline" as const,
            joined: relativeDate(m.joined_at),
          };
        });
        setMembers(rows);
      })
      .finally(() => setLoading(false));
  }, [projectId, currentUser?.id]);

  const seatsUsed = members.length + invites.length;
  const editorCount = members.filter((m) => m.role === "owner" || m.role === "editor").length;

  const setRole = (id: string, role: Role) => {
    setMembers((all) => all.map((m) => (m.id === id ? { ...m, role } : m)));
    if (!DEMO) {
      patchProjectMember(projectId, id, { role: role as import("../../types").ProjectRole }).catch(console.error);
    }
  };

  const removeMember = (id: string) => {
    setMembers((all) => all.filter((m) => m.id !== id));
    if (!DEMO) {
      removeProjectMember(projectId, id).catch(console.error);
    }
  };

  const revokeInvite = (id: string) => setInvites((all) => all.filter((i) => i.id !== id));

  return (
    <>
      <div className="adm-head">
        <div className="adm-head-l">
          <h1 className="h-page">Members</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            Manage who can access the <b>Atlas</b> project and what they can do.
          </p>
        </div>
        <div className="seat-meter">
          <div className="seat-meter-top">
            <span>Seats used</span>
            <b>{seatsUsed} / {SEAT_LIMIT}</b>
          </div>
          <div className="seat-bar"><div style={{ width: (seatsUsed / SEAT_LIMIT * 100) + "%" }} /></div>
        </div>
        <button className="pill-btn" data-primary="true" onClick={() => setShowInvite(true)}>
          <Icon name="plus" size="sm" /> Invite people
        </button>
      </div>

      <div className="adm-tabs">
        <div className="seg">
          <button className="seg-btn" data-active={tab === "members"} onClick={() => setTab("members")}>
            Members {members.length}
          </button>
          <button className="seg-btn" data-active={tab === "invites"} onClick={() => setTab("invites")}>
            Pending {invites.length}
          </button>
          <button className="seg-btn" data-active={tab === "roles"} onClick={() => setTab("roles")}>
            Roles
          </button>
        </div>
        <span style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: 4 }}>
          {members.length} people · {editorCount} editors · {invites.length} invited
        </span>
      </div>

      {tab === "members" && (
        <>
          {loading && (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
              Loading members…
            </div>
          )}
          {!loading && (
          <div className="card mbr-table">
            <div className="mbr-head">
              <div>Person</div><div>Role</div><div className="mbr-col-active">Joined</div>
              <div className="mbr-col-status">Status</div><div></div>
            </div>
            {members.map((m) => (
              <div key={m.id} className="mbr-row">
                <div className="mbr-person">
                  <div className={"act-avatar " + m.color}>{m.initial}</div>
                  <div className="mbr-id">
                    <span className="mbr-name">
                      {m.name}
                      {m.you && <span className="mbr-you">You</span>}
                    </span>
                    <span className="mbr-email">{m.email}</span>
                  </div>
                </div>
                <div>
                  <RolePicker value={m.role} locked={m.role === "owner"} onChange={(role) => setRole(m.id, role)} />
                </div>
                <div className="mbr-meta mbr-col-active">{m.joined}</div>
                <div className="mbr-col-status">
                  <span className="mbr-status">
                    <span className={"dot " + m.status} />
                    {statusLabel[m.status]}
                  </span>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  {m.role !== "owner" && !m.you && (
                    <button className="pill-btn" style={{ height: 26 }} onClick={() => removeMember(m.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}

          <div className="card glass adm-agent-card">
            <div className="act-avatar av-3"><i className="fa-solid fa-robot" aria-hidden="true" /></div>
            <div className="adm-agent-meta">
              <b>TEOS</b>
              <div>Always-on assistant · has access to everything humans in this project can see</div>
            </div>
            <span className="task-status" data-s="running">agent</span>
          </div>
        </>
      )}

      {tab === "invites" && (
        <div className="card mbr-table" style={{ padding: invites.length ? "4px 0" : 0 }}>
          {invites.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty-ico"><Icon name="send" /></div>
              <b>No pending invitations</b>
              <p>Everyone invited has already joined.</p>
              <button className="pill-btn" data-primary="true" style={{ marginTop: 10 }} onClick={() => setShowInvite(true)}>
                <Icon name="plus" size="sm" /> Invite people
              </button>
            </div>
          ) : invites.map((inv) => (
            <div key={inv.id} className="invite-row">
              <div className="invite-ico"><Icon name="users" /></div>
              <div className="invite-id">
                <div className="invite-email">{inv.email}</div>
                <div className="invite-sub">Invited as {PROJECT_ROLES[inv.role].label} by {inv.by} · {inv.time}</div>
              </div>
              <div className="invite-actions">
                <span className="invite-pending-tag">Pending</span>
                <button className="pill-btn">Resend</button>
                <button className="pill-btn" onClick={() => revokeInvite(inv.id)}>Revoke</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "roles" && (
        <>
          <div className="role-legend">
            {ROLE_ORDER.map((id) => (
              <div key={id} className="card role-legend-card">
                <div className="rl-top">
                  <RoleDot role={id} />
                  <b>{PROJECT_ROLES[id].label}</b>
                  <span className="rl-count">{members.filter((m) => m.role === id).length}</span>
                </div>
                <p>{PROJECT_ROLES[id].desc}</p>
              </div>
            ))}
          </div>
          <div className="card perm-table">
            <div className="perm-head">
              <div>Capability</div>
              {ROLE_ORDER.map((id) => (
                <div key={id} className="perm-role-h">
                  <RoleDot role={id} />
                  <b>{PROJECT_ROLES[id].label}</b>
                </div>
              ))}
            </div>
            {PERMISSIONS.map((p, i) => (
              <div key={i} className="perm-row">
                <div className="perm-cap">{p.cap}<span>{p.sub}</span></div>
                {ROLE_ORDER.map((id) => (
                  <div key={id} className="perm-cell">
                    {(p.roles as readonly string[]).includes(id)
                      ? <span className="perm-yes"><Icon name="check" /></span>
                      : <span className="perm-no">–</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvite={(_emails, _role) => { setShowInvite(false); setTab("invites"); }}
        />
      )}
    </>
  );
}

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (emails: string[], role: Role) => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<Role>("editor");

  const commit = () => {
    const parts = draft.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) { setEmails((all) => [...new Set([...all, ...parts])]); setDraft(""); }
  };

  const canSend = emails.length > 0 || draft.trim().length > 0;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: 560, padding: 0 }}>
        <div style={{ padding: "20px 22px 6px" }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Invite people to Atlas</div>
          <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 4 }}>They'll get an email invite.</div>
        </div>
        <div style={{ padding: "14px 22px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="form-l">Email addresses</div>
            <div className="inv-chips">
              {emails.map((e) => (
                <span key={e} className="inv-chip">
                  {e}
                  <button className="inv-chip-x" onClick={() => setEmails((all) => all.filter((x) => x !== e))}>
                    <Icon name="plus" size="sm" style={{ transform: "rotate(45deg)" }} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={emails.length ? "" : "name@acme.com, another@acme.com…"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
                  if (e.key === "Backspace" && !draft && emails.length) setEmails((all) => all.slice(0, -1));
                }}
                onBlur={commit}
              />
            </div>
          </div>
          <div>
            <div className="form-l">Role</div>
            {ASSIGNABLE.map((id) => (
              <button key={id} className="inv-role-opt" data-on={role === id} onClick={() => setRole(id)}>
                <span className="inv-role-radio" />
                <span className="inv-role-text">
                  <b><RoleDot role={id} /> {PROJECT_ROLES[id].label}</b>
                  <p>{PROJECT_ROLES[id].desc}</p>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: 18, display: "flex", gap: 8, alignItems: "center", borderTop: "0.5px solid var(--hairline)", marginTop: 16 }}>
          <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
            {emails.length > 0 ? `${emails.length} ${emails.length === 1 ? "person" : "people"} · ${PROJECT_ROLES[role].label}` : "Add at least one email"}
          </span>
          <div style={{ flex: 1 }} />
          <button className="pill-btn" onClick={onClose}>Cancel</button>
          <button className="pill-btn" data-primary={canSend} disabled={!canSend}
            style={{ opacity: canSend ? 1 : 0.5 }}
            onClick={() => { if (canSend) { const all = [...emails, ...(draft.trim() ? [draft.trim()] : [])]; onInvite(all, role); } }}>
            <Icon name="send" size="sm" /> Send invites
          </button>
        </div>
      </div>
    </div>
  );
}
