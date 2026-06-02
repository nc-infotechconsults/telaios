import { useState } from "react";

interface Props {
  mode: "saas" | "onprem";
}

// ─── SaaS Services ────────────────────────────────────────────────────────────

const SAAS_SERVICES = [
  { name: "API Gateway",         status: "operational", latency: "12ms"  },
  { name: "Knowledge Pipeline",  status: "operational", latency: "34ms"  },
  { name: "Auth Service",        status: "operational", latency: "8ms"   },
  { name: "Object Storage",      status: "operational", latency: "22ms"  },
  { name: "Task Queue",          status: "operational", latency: "5ms"   },
  { name: "Embedder",            status: "operational", latency: "67ms"  },
] as const;

const REGIONS = [
  { name: "us-east-1",        flag: "🇺🇸", status: "operational", latency: "12ms",  load: "38%" },
  { name: "eu-west-1",        flag: "🇪🇺", status: "operational", latency: "28ms",  load: "21%" },
  { name: "ap-southeast-1",   flag: "🇸🇬", status: "degraded",    latency: "104ms", load: "12%" },
] as const;

// ─── On-prem Nodes ────────────────────────────────────────────────────────────

const ONPREM_NODES = [
  { name: "node-01", role: "primary",  cpu: 42, mem: 61, storage: 38, version: "v2.4.1", status: "operational" as const },
  { name: "node-02", role: "worker",   cpu: 71, mem: 74, storage: 51, version: "v2.4.1", status: "operational" as const },
  { name: "node-03", role: "worker",   cpu: 18, mem: 33, storage: 29, version: "v2.4.1", status: "operational" as const },
  { name: "node-04", role: "storage",  cpu: 9,  mem: 45, storage: 82, version: "v2.4.1", status: "degraded" as const },
];

// ─── Feature flags ────────────────────────────────────────────────────────────

const INITIAL_FLAGS = [
  { id: "kb-graph",      label: "Knowledge Graph (Beta)",   enabled: true  },
  { id: "multi-file",    label: "Multi-file Design",        enabled: false },
  { id: "voice",         label: "Voice Sessions",           enabled: false },
  { id: "adv-analytics", label: "Advanced Analytics",       enabled: true  },
  { id: "impersonation", label: "Operator Impersonation",   enabled: false },
] as const;

// ─── Mini progress bar ────────────────────────────────────────────────────────

function BarMeter({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        height: 5,
        borderRadius: 3,
        background: "var(--glass-weak)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        background: on ? "#ff9f0a" : "var(--fg-4)",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? "unset" : 2,
          right: on ? 2 : "unset",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "all 0.2s",
        }}
      />
    </button>
  );
}

// ─── LED dot ─────────────────────────────────────────────────────────────────

function Led({ status }: { status: "operational" | "degraded" | "down" }) {
  const color =
    status === "operational" ? "#30d158" :
    status === "degraded"    ? "#ff9f0a" :
                               "#ff375f";
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}88`,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OperatorSystem({ mode }: Props) {
  const [flags, setFlags] = useState(
    () => INITIAL_FLAGS.map((f) => ({ ...f })) as Array<{ id: string; label: string; enabled: boolean }>
  );

  const toggleFlag = (id: string) => {
    setFlags((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  return (
    <div className="main-scroll">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">System Health</h1>
        <p className="sub-page">
          {mode === "saas"
            ? "Service status, regions, and platform metrics"
            : "Node health, resource utilization, and platform metrics"}
        </p>
      </div>

      {/* Platform version strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: "var(--glass-weak)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 10,
          padding: "12px 18px",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Led status="operational" />
          <span style={{ fontWeight: 700, fontSize: 13 }}>TelaiOS v2.4.1</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
          Uptime: <span style={{ color: "#30d158", fontWeight: 600 }}>99.98%</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
          Last deploy:{" "}
          <span style={{ color: "var(--fg-2)", fontWeight: 500 }}>
            {new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · 02:14 UTC
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span
          className="task-status"
          data-s="done"
          style={{ fontSize: 11.5 }}
        >
          All systems go
        </span>
      </div>

      {/* SaaS: Services + Regions */}
      {mode === "saas" && (
        <>
          {/* Services grid */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Services
            </div>
            <div className="grid-3" style={{ marginBottom: 16 }}>
              {SAAS_SERVICES.map((s) => (
                <div
                  key={s.name}
                  className="card"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}
                >
                  <Led status={s.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>
                      {s.latency} p95
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "#30d158",
                      fontWeight: 600,
                      background: "#30d15818",
                      border: "0.5px solid #30d15844",
                      borderRadius: 4,
                      padding: "2px 6px",
                    }}
                  >
                    OK
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Regions
            </div>
            <div className="card" style={{ padding: 0 }}>
              {REGIONS.map((r, i) => (
                <div
                  key={r.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 60px 70px",
                    alignItems: "center",
                    padding: "11px 16px",
                    borderTop: i > 0 ? "0.5px solid var(--hairline)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Led status={r.status} />
                    <span style={{ fontSize: 13 }}>{r.flag} {r.name}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>
                    {r.latency} p95
                  </span>
                  <span style={{ fontSize: 12, color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>
                    {r.load} load
                  </span>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: r.status === "operational" ? "#30d158" : "#ff9f0a",
                        background: r.status === "operational" ? "#30d15818" : "#ff9f0a18",
                        border: `0.5px solid ${r.status === "operational" ? "#30d15844" : "#ff9f0a44"}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        textTransform: "capitalize",
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* On-prem: Node cards */}
      {mode === "onprem" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Cluster Nodes
          </div>
          <div className="grid-4" style={{ marginBottom: 0 }}>
            {ONPREM_NODES.map((n) => (
              <div key={n.name} className="card" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Led status={n.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "capitalize" }}>
                      {n.role} · {n.version}
                    </div>
                  </div>
                </div>

                {/* CPU */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-3)", marginBottom: 4 }}>
                    <span>CPU</span>
                    <span style={{ color: n.cpu > 70 ? "#ff375f" : n.cpu > 50 ? "#ff9f0a" : "#30d158" }}>
                      {n.cpu}%
                    </span>
                  </div>
                  <BarMeter value={n.cpu} color={n.cpu > 70 ? "#ff375f" : n.cpu > 50 ? "#ff9f0a" : "#30d158"} />
                </div>

                {/* Memory */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-3)", marginBottom: 4 }}>
                    <span>Memory</span>
                    <span style={{ color: n.mem > 70 ? "#ff375f" : n.mem > 50 ? "#ff9f0a" : "#30d158" }}>
                      {n.mem}%
                    </span>
                  </div>
                  <BarMeter value={n.mem} color={n.mem > 70 ? "#ff375f" : n.mem > 50 ? "#ff9f0a" : "#30d158"} />
                </div>

                {/* Storage */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg-3)", marginBottom: 4 }}>
                    <span>Storage</span>
                    <span style={{ color: n.storage > 80 ? "#ff375f" : n.storage > 60 ? "#ff9f0a" : "#30d158" }}>
                      {n.storage}%
                    </span>
                  </div>
                  <BarMeter value={n.storage} color={n.storage > 80 ? "#ff375f" : n.storage > 60 ? "#ff9f0a" : "#30d158"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Flags */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Feature Flags
        </div>
        <div className="card" style={{ padding: 0 }}>
          {flags.map((f, i) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderTop: i > 0 ? "0.5px solid var(--hairline)" : undefined,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>
                  {f.enabled ? "Enabled globally" : "Disabled globally"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: f.enabled ? "#ff9f0a" : "var(--fg-3)",
                    fontWeight: 500,
                  }}
                >
                  {f.enabled ? "On" : "Off"}
                </span>
                <Toggle on={f.enabled} onChange={() => toggleFlag(f.id)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
