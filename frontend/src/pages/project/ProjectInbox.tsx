import { useState } from "react";

type FilterTab = "all" | "teos" | "mentions" | "system";

interface InboxItem {
  id: string;
  type: FilterTab;
  title: string;
  preview: string;
  time: string;
  read: boolean;
  icon: string;
  color: string;
  detail: string;
}

const MOCK_ITEMS: InboxItem[] = [
  {
    id: "i1",
    type: "teos",
    title: "TEOS: New insight on auth flow",
    preview: "I noticed a potential security issue in the token refresh logic of your authentication module…",
    time: "2m ago",
    read: false,
    icon: "⊛",
    color: "#0a84ff",
    detail: "I noticed a potential security issue in the token refresh logic of your authentication module.\n\nThe refresh token endpoint does not validate the token expiry on the server side before issuing a new access token. This means an attacker who obtains a refresh token could continue to get access tokens indefinitely.\n\nRecommendation: Add server-side validation of refresh token expiry and implement token revocation.",
  },
  {
    id: "i2",
    type: "teos",
    title: "TEOS: Repository indexing complete",
    preview: "Successfully indexed main-api repository. Found 1,247 symbols across 86 files…",
    time: "15m ago",
    read: false,
    icon: "⎔",
    color: "#30d158",
    detail: "Successfully indexed main-api repository.\n\nStats:\n• 86 files processed\n• 1,247 symbols extracted\n• 342 functions documented\n• 8 potential issues detected\n\nThe knowledge base is ready for queries.",
  },
  {
    id: "i3",
    type: "mentions",
    title: "Alice mentioned you in PR #142",
    preview: "Can you take a look at the database migration? @you might have context on the schema changes…",
    time: "1h ago",
    read: true,
    icon: "👤",
    color: "#bf5af2",
    detail: "Alice left a comment in PR #142 — Database migration for user settings.\n\n\"Can you take a look at the database migration? @you might have context on the schema changes from last sprint. The new columns seem to conflict with the existing indexes.\"\n\nView on GitHub →",
  },
  {
    id: "i4",
    type: "system",
    title: "Weekly report generated",
    preview: "Your weekly project health report is ready. 47 commits, 12 PRs merged…",
    time: "3h ago",
    read: true,
    icon: "📊",
    color: "#ff9f0a",
    detail: "Weekly Project Health Report\n\nPeriod: May 13 – May 19\n\n• 47 commits across 3 repositories\n• 12 PRs merged, 3 pending review\n• 8 issues closed\n• Test coverage: 74% (+2%)\n• TEOS answered 34 questions\n• 2 security suggestions generated",
  },
  {
    id: "i5",
    type: "teos",
    title: "TEOS: Feature idea based on codebase",
    preview: "Based on your current architecture, adding a caching layer at the API gateway level could…",
    time: "1d ago",
    read: true,
    icon: "💡",
    color: "#5e5ce6",
    detail: "Based on your current architecture, adding a caching layer at the API gateway level could reduce database load by an estimated 40%.\n\nYour current auth-service makes 3 database calls per request for session validation. A Redis-based cache with a 5-minute TTL would significantly reduce this overhead.\n\nWant me to generate an implementation plan?",
  },
];

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  teos: "From TEOS",
  mentions: "Mentions",
  system: "System",
};

export default function ProjectInbox({ projectId: _projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<InboxItem | null>(MOCK_ITEMS[0]);
  const [items, setItems] = useState<InboxItem[]>(MOCK_ITEMS);

  const filtered = items.filter((i) => filter === "all" || i.type === filter);
  const unreadCount = items.filter((i) => !i.read).length;

  const handleSelect = (item: InboxItem) => {
    setSelected(item);
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, read: true } : i));
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List pane */}
      <div style={{ width: 320, borderRight: "0.5px solid var(--hairline)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--label-primary)" }}>Inbox</h1>
            {unreadCount > 0 && (
              <span aria-label={`${unreadCount} unread`} style={{ minWidth: 20, height: 20, borderRadius: 9999, background: "#ff375f", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                {unreadCount}
              </span>
            )}
          </div>
          {/* Filter tabs */}
          <div role="tablist" aria-label="Inbox filter" style={{ display: "flex", gap: 2, background: "var(--fill-tertiary)", padding: 2, borderRadius: 10 }}>
            {(Object.keys(FILTER_LABELS) as FilterTab[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  padding: "5px 4px",
                  borderRadius: 8,
                  border: "none",
                  background: filter === f ? "var(--glass-strong)" : "none",
                  color: filter === f ? "var(--label-primary)" : "var(--label-tertiary)",
                  fontSize: 11,
                  fontWeight: filter === f ? 600 : 400,
                  cursor: "pointer",
                  boxShadow: filter === f ? "var(--shadow-glass-panel)" : "none",
                }}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Items list */}
        <ul style={{ flex: 1, overflowY: "auto", margin: 0, padding: "6px 8px", listStyle: "none" }} role="listbox" aria-label="Inbox items">
          {filtered.length === 0 ? (
            <li style={{ padding: "40px 16px", textAlign: "center", color: "var(--label-tertiary)", fontSize: 13 }}>
              No items
            </li>
          ) : (
            filtered.map((item) => (
              <li key={item.id} role="option" aria-selected={selected?.id === item.id}>
                <button
                  onClick={() => handleSelect(item)}
                  style={{
                    display: "flex",
                    gap: 10,
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 12,
                    background: selected?.id === item.id ? "var(--hover-glass)" : "none",
                    border: "none",
                    borderLeft: selected?.id === item.id ? "2px solid #0a84ff" : `2px solid ${!item.read ? item.color : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: `${item.color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: !item.read ? 600 : 400, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {item.title}
                      </span>
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.preview}
                    </p>
                    <div style={{ fontSize: 10, color: "var(--label-quaternary)", marginTop: 3 }}>{item.time}</div>
                  </div>
                  {!item.read && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Detail pane */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selected ? (
          <>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: `${selected.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }} aria-hidden="true">
                  {selected.icon}
                </span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--label-primary)" }}>{selected.title}</h2>
                  <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>{selected.time}</span>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <p style={{ fontSize: 14, color: "var(--label-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
                {selected.detail}
              </p>
            </div>
            {selected.type === "teos" && (
              <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0 }}>
                <button style={{ padding: "8px 16px", borderRadius: 10, background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Continue with TEOS
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--label-tertiary)" }}>
            <p style={{ fontSize: 13 }}>Select an item to read</p>
          </div>
        )}
      </div>
    </div>
  );
}
