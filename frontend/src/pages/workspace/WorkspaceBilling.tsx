import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import * as api from "../../lib/api";
import type { User } from "../../types";

const PLAN_SEATS_TOTAL   = 20;
const PLAN_KB_PAGES      = 50_000;
const PLAN_AGENT_RUNS    = 500;
const STUB_KB_PAGES_USED = 12_840;
const STUB_AGENT_RUNS_USED = 127;

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: "Paid" | "Pending";
  description: string;
}

const INVOICES: Invoice[] = [
  { id: "inv-004", date: "Jun 1, 2026",  amount: "$149.00", status: "Paid",    description: "Pro Plan — June 2026"    },
  { id: "inv-003", date: "May 1, 2026",  amount: "$149.00", status: "Paid",    description: "Pro Plan — May 2026"     },
  { id: "inv-002", date: "Apr 1, 2026",  amount: "$149.00", status: "Paid",    description: "Pro Plan — April 2026"   },
  { id: "inv-001", date: "Mar 1, 2026",  amount: "$149.00", status: "Pending", description: "Pro Plan — March 2026"   },
];

function UsageBar({ used, total, color = "#0a84ff" }: { used: number; total: number; color?: string }) {
  const pct = Math.min(100, total > 0 ? (used / total) * 100 : 0);
  const warn = pct >= 80;
  const barColor = warn ? (pct >= 95 ? "#ff3b30" : "#ff9f0a") : color;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        height: 6, borderRadius: 3, background: "var(--glass-weak)",
        overflow: "hidden", width: "100%",
      }}>
        <div style={{
          height: "100%", borderRadius: 3,
          width: `${pct}%`,
          background: barColor,
          transition: "width 0.4s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11.5, color: "var(--fg-3)" }}>
        <span style={{ color: warn ? barColor : undefined }}>{used.toLocaleString()} used</span>
        <span>{total.toLocaleString()} total</span>
      </div>
    </div>
  );
}

export default function WorkspaceBilling() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const seatsUsed  = loading ? 0 : users.filter((u) => u.is_active).length;
  const seatsTotal = PLAN_SEATS_TOTAL;

  return (
    <div className="main-scroll">
      <h1 className="h-page">Billing &amp; Seats</h1>
      <p className="sub-page">Manage your plan, usage, and invoices</p>

      {/* Plan card */}
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(135deg, #0a84ff 0%, #bf5af2 100%)",
          padding: "24px 28px",
          marginBottom: 16,
          position: "relative",
          overflow: "hidden",
          color: "#fff",
        }}
      >
        {/* Decorative blobs */}
        <div style={{
          position: "absolute", top: -40, right: -40,
          width: 160, height: 160, borderRadius: "50%",
          background: "rgba(255,255,255,0.08)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -30, right: 80,
          width: 100, height: 100, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)", pointerEvents: "none",
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                background: "rgba(255,255,255,0.2)", borderRadius: 8,
                padding: "3px 10px", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                Pro
              </span>
              <span style={{ fontSize: 13, opacity: 0.85 }}>Current plan</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em" }}>$149</span>
              <span style={{ fontSize: 13, opacity: 0.75 }}>/month</span>
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 4 }}>
              Up to {seatsTotal} seats · {PLAN_KB_PAGES.toLocaleString()} knowledge pages · {PLAN_AGENT_RUNS} agent runs/mo
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
            <button
              style={{
                background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
                border: "0.5px solid rgba(255,255,255,0.3)",
                color: "#fff", borderRadius: 8, padding: "7px 16px",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
              onClick={() => alert("Billing portal — coming soon.")}
            >
              Manage Billing
            </button>
            <button
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "0.5px solid rgba(255,255,255,0.2)",
                color: "#fff", borderRadius: 8, padding: "7px 16px",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
              onClick={() => alert("Add seats — coming soon.")}
            >
              Add Seats
            </button>
          </div>
        </div>

        {/* Usage bars inline */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 22 }}>
          {[
            { label: "Seats",           used: seatsUsed,            total: seatsTotal,       color: "#fff" },
            { label: "Knowledge Pages", used: STUB_KB_PAGES_USED,   total: PLAN_KB_PAGES,    color: "#fff" },
            { label: "Agent Runs",      used: STUB_AGENT_RUNS_USED,  total: PLAN_AGENT_RUNS, color: "#fff" },
          ].map((u) => {
            const p = u.total > 0 ? Math.min(100, (u.used / u.total) * 100) : 0;
            return (
              <div key={u.label}>
                <div style={{ fontSize: 11.5, opacity: 0.8, marginBottom: 4, fontWeight: 500 }}>{u.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {u.used.toLocaleString()} <span style={{ fontSize: 12, opacity: 0.65 }}>/ {u.total.toLocaleString()}</span>
                </div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${p}%`, background: "#fff", transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Usage breakdown cards */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {/* Seats */}
        <div className="card">
          <div className="card-head">
            <Icon name="users" size="sm" style={{ color: "#0a84ff" }} />
            <span className="card-title">Seats</span>
            <span className="card-sub">{seatsUsed} / {seatsTotal}</span>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <UsageBar used={seatsUsed} total={seatsTotal} color="#0a84ff" />
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-3)" }}>
                {seatsTotal - seatsUsed} seat{(seatsTotal - seatsUsed) !== 1 ? "s" : ""} available
              </div>
              <button
                className="pill-btn"
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                onClick={() => alert("Add seats — coming soon.")}
              >
                <Icon name="plus" size="sm" /> Add Seats
              </button>
            </>
          )}
        </div>

        {/* Knowledge Index */}
        <div className="card">
          <div className="card-head">
            <Icon name="book" size="sm" style={{ color: "#bf5af2" }} />
            <span className="card-title">Knowledge Index</span>
            <span className="card-sub">{STUB_KB_PAGES_USED.toLocaleString()} pages</span>
          </div>
          <UsageBar used={STUB_KB_PAGES_USED} total={PLAN_KB_PAGES} color="#bf5af2" />
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-3)" }}>
            {(PLAN_KB_PAGES - STUB_KB_PAGES_USED).toLocaleString()} pages remaining
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--fg-3)" }}>
            Last indexed: 8 days ago
          </div>
        </div>

        {/* Agent Runs */}
        <div className="card">
          <div className="card-head">
            <Icon name="zap" size="sm" style={{ color: "#ff9f0a" }} />
            <span className="card-title">Agent Runs</span>
            <span className="card-sub">{STUB_AGENT_RUNS_USED} / {PLAN_AGENT_RUNS}</span>
          </div>
          <UsageBar used={STUB_AGENT_RUNS_USED} total={PLAN_AGENT_RUNS} color="#ff9f0a" />
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-3)" }}>
            {PLAN_AGENT_RUNS - STUB_AGENT_RUNS_USED} runs remaining this month
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--fg-3)" }}>
            Resets July 1, 2026
          </div>
        </div>
      </div>

      {/* Invoices table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: "14px 16px 10px" }}>
          <Icon name="file" size="sm" />
          <span className="card-title">Invoices</span>
          <span className="card-sub">billing history</span>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 100px 90px",
          padding: "0 16px 8px",
          borderBottom: "0.5px solid var(--hairline)",
          fontSize: 11, fontWeight: 600, color: "var(--fg-3)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          <span>Description</span>
          <span>Date</span>
          <span>Amount</span>
          <span>Status</span>
        </div>

        {INVOICES.map((inv, idx) => (
          <div
            key={inv.id}
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 100px 90px",
              alignItems: "center", padding: "11px 16px",
              borderBottom: idx < INVOICES.length - 1 ? "0.5px solid var(--hairline)" : "none",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{inv.description}</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{inv.id}</div>
            </div>
            <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{inv.date}</span>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{inv.amount}</span>
            <span
              className="task-status"
              data-s={inv.status === "Paid" ? "done" : "queued"}
              style={{ display: "inline-block" }}
            >
              {inv.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
