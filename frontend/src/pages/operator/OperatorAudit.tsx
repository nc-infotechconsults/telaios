import { useState } from "react";
import { Icon } from "../../components/Icon";
import type { OperatorMode } from "./OperatorLayout";

interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  initials: string;
  color: string;
  action: string;
  target: string;
  kind: "user" | "system" | "security";
}

const STUB_ENTRIES: AuditEntry[] = [
  { id: "e1",  ts: "2026-06-02 09:42", actor: "Nico Cardone",   initials: "NC", color: "#0a84ff", action: "Created workspace",           target: "acme-corp",           kind: "system"   },
  { id: "e2",  ts: "2026-06-02 09:38", actor: "System",          initials: "SY", color: "#30d158", action: "Knowledge index completed",   target: "github.com/acme/core", kind: "system"   },
  { id: "e3",  ts: "2026-06-02 08:55", actor: "Jane Doe",        initials: "JD", color: "#bf5af2", action: "Invited user",                target: "sam@acme.com",         kind: "user"     },
  { id: "e4",  ts: "2026-06-01 17:30", actor: "Sam Torres",      initials: "ST", color: "#ff9f0a", action: "Changed role",                target: "jane@acme.com → Admin", kind: "user"    },
  { id: "e5",  ts: "2026-06-01 15:22", actor: "Nico Cardone",   initials: "NC", color: "#0a84ff", action: "Deleted repository",          target: "github.com/acme/old",  kind: "user"     },
  { id: "e6",  ts: "2026-06-01 14:00", actor: "System",          initials: "SY", color: "#30d158", action: "Operator login",             target: "nico@infotechconsults.it", kind: "security" },
  { id: "e7",  ts: "2026-06-01 11:12", actor: "Nico Cardone",   initials: "NC", color: "#0a84ff", action: "Updated settings",           target: "brand_name, brand_color", kind: "user"   },
  { id: "e8",  ts: "2026-05-31 18:00", actor: "System",          initials: "SY", color: "#30d158", action: "Backup completed",           target: "snapshot-2026-05-31",  kind: "system"   },
  { id: "e9",  ts: "2026-05-31 10:45", actor: "Jane Doe",        initials: "JD", color: "#bf5af2", action: "Created project",            target: "Atlas",                kind: "user"     },
  { id: "e10", ts: "2026-05-30 16:20", actor: "System",          initials: "SY", color: "#30d158", action: "Failed login attempt (×3)",  target: "unknown@attacker.io",  kind: "security" },
];

const KIND_CONFIG = {
  user:     { label: "User",     color: "#0a84ff", bg: "rgba(10,132,255,0.12)"  },
  system:   { label: "System",   color: "#30d158", bg: "rgba(48,209,88,0.12)"   },
  security: { label: "Security", color: "#ff375f", bg: "rgba(255,55,95,0.12)"   },
};

export default function OperatorAudit({ mode }: { mode: OperatorMode }) {
  const [filter, setFilter] = useState<"all" | "user" | "system" | "security">("all");
  const [search, setSearch] = useState("");

  const entries = STUB_ENTRIES.filter((e) => {
    if (filter !== "all" && e.kind !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.actor.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.target.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 className="h-page">Audit Log</h1>
          <p className="sub-page">
            {mode === "onprem" ? "Cross-tenant activity trail (on-prem)" : "Platform-wide event history"}
          </p>
        </div>
        <button
          className="pill-btn"
          onClick={() => {
            const csv = ["Timestamp,Actor,Action,Target,Kind",
              ...entries.map((e) => `"${e.ts}","${e.actor}","${e.action}","${e.target}","${e.kind}"`)
            ].join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "operator-audit.csv";
            a.click();
          }}
        >
          <Icon name="arrow" size="sm" style={{ transform: "rotate(90deg)" }} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {(["all", "user", "system", "security"] as const).map((f) => (
          <button
            key={f}
            className="pill-btn"
            data-primary={filter === f ? "true" : undefined}
            onClick={() => setFilter(f)}
            style={{ textTransform: "capitalize" }}
          >
            {f === "all" ? "All Events" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{
              padding: "6px 10px", borderRadius: 7, width: 200,
              background: "var(--glass-weak)", border: "0.5px solid var(--hairline)",
              color: "var(--fg)", fontSize: 12.5,
            }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "130px 140px 1fr 1fr 80px",
          padding: "10px 16px", borderBottom: "0.5px solid var(--hairline)",
          fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          <span>Time</span><span>Actor</span><span>Action</span><span>Target</span><span>Type</span>
        </div>

        {entries.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
            No events match your filter.
          </div>
        )}

        {entries.map((e) => {
          const k = KIND_CONFIG[e.kind];
          return (
            <div
              key={e.id}
              style={{
                display: "grid", gridTemplateColumns: "130px 140px 1fr 1fr 80px",
                alignItems: "center", padding: "10px 16px",
                borderBottom: "0.5px solid var(--hairline)",
              }}
            >
              <span style={{ fontSize: 11.5, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                {e.ts}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: e.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700,
                }}>
                  {e.initials}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.actor}
                </span>
              </div>
              <span style={{ fontSize: 12.5, color: "var(--fg-2)" }}>{e.action}</span>
              <span style={{
                fontSize: 11.5, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: e.target.includes("@") || e.target.includes("/") ? "monospace" : undefined,
              }}>
                {e.target}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                color: k.color, background: k.bg, border: `0.5px solid ${k.color}44`,
                borderRadius: 4, padding: "2px 6px", width: "fit-content",
              }}>
                {k.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
