import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";

type EntryKind = "user" | "system" | "delete";

interface AuditEntry {
  id: string;
  kind: EntryKind;
  actor: string;
  actorInitials: string;
  action: string;
  target: string;
  detail?: string;
  timestamp: string;
  isoTimestamp: string;
}

const KIND_CONFIG: Record<EntryKind, { color: string; bg: string; icon: "users" | "zap" | "trash" }> = {
  user:   { color: "#0a84ff", bg: "rgba(10,132,255,0.12)",  icon: "users"  },
  system: { color: "#30d158", bg: "rgba(48,209,88,0.12)",   icon: "zap"    },
  delete: { color: "#ff3b30", bg: "rgba(255,59,48,0.12)",   icon: "trash"  },
};

const STUB_ENTRIES: AuditEntry[] = [
  { id: "e01", kind: "user",   actor: "Nico Cardone",  actorInitials: "NC", action: "Created project",           target: "Atlas",                          isoTimestamp: "2026-06-02T09:12:00Z", timestamp: "Today 09:12"      },
  { id: "e02", kind: "user",   actor: "Nico Cardone",  actorInitials: "NC", action: "Invited user",              target: "jane@acme.com",                  isoTimestamp: "2026-06-02T09:10:00Z", timestamp: "Today 09:10"      },
  { id: "e03", kind: "system", actor: "System",        actorInitials: "SY", action: "Knowledge index completed", target: "github.com/acme/core",            isoTimestamp: "2026-06-02T08:55:00Z", timestamp: "Today 08:55"      },
  { id: "e04", kind: "user",   actor: "Jane Doe",      actorInitials: "JD", action: "Changed role for",          target: "Sam Torres → Admin",             isoTimestamp: "2026-06-01T17:30:00Z", timestamp: "Yesterday 17:30"  },
  { id: "e05", kind: "delete", actor: "Nico Cardone",  actorInitials: "NC", action: "Deleted repository",        target: "github.com/acme/old-service",     isoTimestamp: "2026-06-01T15:22:00Z", timestamp: "Yesterday 15:22"  },
  { id: "e06", kind: "user",   actor: "Sam Torres",    actorInitials: "ST", action: "Updated workspace settings", target: "brand_name, brand_color",        isoTimestamp: "2026-06-01T14:00:00Z", timestamp: "Yesterday 14:00"  },
  { id: "e07", kind: "system", actor: "System",        actorInitials: "SY", action: "Agent run completed",       target: "Executor · Task #47",             isoTimestamp: "2026-06-01T13:47:00Z", timestamp: "Yesterday 13:47"  },
  { id: "e08", kind: "user",   actor: "Jane Doe",      actorInitials: "JD", action: "Exported knowledge base",   target: "Project Nexus",                   isoTimestamp: "2026-06-01T11:15:00Z", timestamp: "Yesterday 11:15"  },
  { id: "e09", kind: "delete", actor: "Sam Torres",    actorInitials: "ST", action: "Removed member from project", target: "carl@acme.com / Atlas",         isoTimestamp: "2026-05-31T16:45:00Z", timestamp: "May 31 16:45"     },
  { id: "e10", kind: "user",   actor: "Nico Cardone",  actorInitials: "NC", action: "Uploaded document",         target: "RFC-014.pdf",                     isoTimestamp: "2026-05-31T14:20:00Z", timestamp: "May 31 14:20"     },
  { id: "e11", kind: "system", actor: "System",        actorInitials: "SY", action: "Scheduled index triggered", target: "All knowledge sources",           isoTimestamp: "2026-05-31T03:00:00Z", timestamp: "May 31 03:00"     },
  { id: "e12", kind: "user",   actor: "Jane Doe",      actorInitials: "JD", action: "Created agent profile",     target: "QA Reviewer",                     isoTimestamp: "2026-05-30T10:33:00Z", timestamp: "May 30 10:33"     },
  { id: "e13", kind: "delete", actor: "Nico Cardone",  actorInitials: "NC", action: "Deleted document",          target: "DEPRECATED-api-v1.md",            isoTimestamp: "2026-05-29T09:50:00Z", timestamp: "May 29 09:50"     },
  { id: "e14", kind: "system", actor: "System",        actorInitials: "SY", action: "Backup completed",          target: "Workspace snapshot",              isoTimestamp: "2026-05-28T02:00:00Z", timestamp: "May 28 02:00"     },
  { id: "e15", kind: "user",   actor: "Sam Torres",    actorInitials: "ST", action: "Added repository",          target: "github.com/acme/payments-service", isoTimestamp: "2026-05-27T11:05:00Z", timestamp: "May 27 11:05"     },
  { id: "e16", kind: "user",   actor: "Nico Cardone",  actorInitials: "NC", action: "Assigned agent to project", target: "Coder Agent → Nexus",             isoTimestamp: "2026-05-26T15:18:00Z", timestamp: "May 26 15:18"     },
  { id: "e17", kind: "delete", actor: "Jane Doe",      actorInitials: "JD", action: "Removed integration",       target: "Slack webhook",                   isoTimestamp: "2026-05-25T08:40:00Z", timestamp: "May 25 08:40"     },
];

type FilterKind = "all" | EntryKind;

function AvatarDot({ initials, color }: { initials: string; color: string }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%",
      background: color, color: "#fff",
      fontWeight: 700, fontSize: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const ACTOR_COLORS: Record<string, string> = {
  "Nico Cardone": "#0a84ff",
  "Jane Doe":     "#bf5af2",
  "Sam Torres":   "#ff9f0a",
  "System":       "#30d158",
};

export default function WorkspaceAuditLog() {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = STUB_ENTRIES;
    if (filter !== "all") list = list.filter((e) => e.kind === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filter, search]);

  const handleExport = () => {
    const rows = [
      ["Timestamp", "Actor", "Action", "Target", "Type"],
      ...STUB_ENTRIES.map((e) => [e.isoTimestamp, e.actor, e.action, e.target, e.kind]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    alert("Audit log exported as CSV.");
  };

  return (
    <div className="main-scroll">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 className="h-page">Audit Log</h1>
          <p className="sub-page">Full history of workspace actions and system events</p>
        </div>
        <button className="pill-btn" onClick={handleExport} style={{ marginTop: 4 }}>
          <Icon name="upload" size="sm" /> Export CSV
        </button>
      </div>

      {/* Filter + Search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "user", "system", "delete"] as FilterKind[]).map((k) => (
          <button
            key={k}
            className="pill-btn"
            style={filter === k ? {
              background: "var(--accent-grad)", color: "#fff", borderColor: "transparent",
            } : {}}
            onClick={() => setFilter(k)}
          >
            {k === "all" ? "All events" : k === "user" ? "User actions" : k === "system" ? "System events" : "Deletions"}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div className="card" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
          <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search log…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, cursor: "pointer" }}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
          )}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 10 }}>
        {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        {filter !== "all" || search ? ` (filtered from ${STUB_ENTRIES.length})` : ""}
      </div>

      {/* Timeline */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 13 }}>
            No events match your filter.
          </div>
        )}

        {filtered.map((entry, idx) => {
          const cfg        = KIND_CONFIG[entry.kind];
          const actorColor = ACTOR_COLORS[entry.actor] ?? "#5e5ce6";
          const isLast     = idx === filtered.length - 1;

          return (
            <div
              key={entry.id}
              style={{
                display: "flex", gap: 14, padding: "14px 18px",
                borderBottom: isLast ? "none" : "0.5px solid var(--hairline)",
                position: "relative",
              }}
            >
              {/* Timeline line */}
              {!isLast && (
                <div style={{
                  position: "absolute",
                  left: 32, top: 46, bottom: 0,
                  width: 1,
                  background: "var(--hairline)",
                  pointerEvents: "none",
                }} />
              )}

              {/* Actor avatar */}
              <AvatarDot initials={entry.actorInitials} color={actorColor} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>{entry.actor}</span>
                  {/* Kind badge */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "1px 7px", borderRadius: 6,
                    background: cfg.bg, color: cfg.color,
                    fontSize: 10.5, fontWeight: 600,
                  }}>
                    <Icon name={cfg.icon} size="sm" style={{ width: 10, height: 10 }} />
                    {entry.kind}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: "auto" }}>{entry.timestamp}</span>
                </div>

                <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
                  {entry.action}{" "}
                  <span style={{
                    fontWeight: 500, color: "var(--fg)",
                    background: "var(--glass-weak)",
                    border: "0.5px solid var(--hairline)",
                    borderRadius: 5, padding: "1px 6px", fontSize: 12,
                  }}>
                    {entry.target}
                  </span>
                </div>

                {entry.detail && (
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 4 }}>{entry.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
