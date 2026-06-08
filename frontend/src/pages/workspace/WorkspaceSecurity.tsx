import { useState } from "react";
import { Icon } from "../../components/Icon";
import { AppModal } from "../../components/AppModal";

interface SessionEntry {
  id: string;
  user: string;
  initials: string;
  color: string;
  ip: string;
  browser: string;
  os: string;
  loginTime: string;
  current?: boolean;
}

interface SecurityEvent {
  id: string;
  type: "success" | "warning" | "error";
  description: string;
  actor: string;
  timestamp: string;
}

const ACTIVE_SESSIONS: SessionEntry[] = [
  { id: "s1", user: "Nico Cardone",  initials: "NC", color: "#0a84ff", ip: "192.168.1.100", browser: "Chrome 124",    os: "macOS 14",    loginTime: "Today 09:05",       current: true },
  { id: "s2", user: "Jane Doe",      initials: "JD", color: "#bf5af2", ip: "10.0.0.45",     browser: "Firefox 125",   os: "Windows 11",  loginTime: "Today 08:30"                       },
  { id: "s3", user: "Sam Torres",    initials: "ST", color: "#ff9f0a", ip: "172.16.0.8",    browser: "Safari 17",     os: "iOS 17",      loginTime: "Yesterday 22:14"                   },
];

const SECURITY_EVENTS: SecurityEvent[] = [
  { id: "ev1", type: "error",   description: "Failed login attempt (3 consecutive)",  actor: "unknown@evil.io",  timestamp: "Today 07:43"        },
  { id: "ev2", type: "success", description: "MFA enabled",                            actor: "Sam Torres",       timestamp: "Yesterday 16:30"    },
  { id: "ev3", type: "warning", description: "Session from new IP address detected",   actor: "Jane Doe",         timestamp: "Yesterday 08:15"    },
  { id: "ev4", type: "success", description: "Password changed",                       actor: "Nico Cardone",     timestamp: "May 30 11:02"       },
  { id: "ev5", type: "error",   description: "API key revoked due to suspicious use",  actor: "System",           timestamp: "May 28 03:41"       },
];

const EVENT_CONFIG = {
  success: { color: "#30d158", bg: "rgba(48,209,88,0.12)",  icon: "check"  as const },
  warning: { color: "#ff9f0a", bg: "rgba(255,159,10,0.12)", icon: "bell"   as const },
  error:   { color: "#ff3b30", bg: "rgba(255,59,48,0.12)",  icon: "info"   as const },
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px 12px",
  borderRadius: 8,
  border: "0.5px solid var(--hairline)",
  background: "var(--glass-weak)",
  color: "var(--fg-3)",
  fontSize: 13,
  outline: "none",
  cursor: "not-allowed",
} as const;

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
        background: value ? "#0a84ff" : "var(--fg-4)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2,
        left: value ? "unset" : 2, right: value ? 2 : "unset",
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "all 0.2s",
      }} />
    </button>
  );
}

export default function WorkspaceSecurity() {
  // SSO state
  const [samlEnabled,     setSamlEnabled]     = useState(false);
  const [showSamlModal,   setShowSamlModal]   = useState(false);

  // Session policy state
  const [sessionTimeout,  setSessionTimeout]  = useState("8h");
  const [idleTimeout,     setIdleTimeout]     = useState(true);
  const [forceMfa,        setForceMfa]        = useState(false);
  const [maxSessions,     setMaxSessions]     = useState("3");

  // Saving state
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    alert("Security settings saved.");
  };

  const handleRevokeSession = (id: string) => {
    if (ACTIVE_SESSIONS.find((s) => s.id === id)?.current) {
      alert("Cannot revoke your own current session.");
      return;
    }
    alert(`Session ${id} revoked.`);
  };

  return (
    <div className="main-scroll">
      <h1 className="h-page">Security &amp; SSO</h1>
      <p className="sub-page">Authentication policies, SSO, and active sessions</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* SSO / SAML */}
        <div className="card">
          <div className="card-head">
            <Icon name="globe" size="sm" />
            <span className="card-title">SAML Single Sign-On</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{samlEnabled ? "Enabled" : "Disabled"}</span>
              <Toggle value={samlEnabled} onChange={setSamlEnabled} />
            </div>
          </div>

          {!samlEnabled && (
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "var(--glass-weak)", border: "0.5px solid var(--hairline)",
              fontSize: 12.5, color: "var(--fg-3)", marginBottom: 14,
            }}>
              SAML SSO is not configured. Enable the toggle to set up identity provider integration.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: samlEnabled ? 1 : 0.45, pointerEvents: samlEnabled ? "auto" : "none", transition: "opacity 0.2s" }}>
            {[
              { label: "Entity ID (SP)",     placeholder: "Not configured" },
              { label: "SSO URL (IdP)",       placeholder: "Not configured" },
              { label: "X.509 Certificate",  placeholder: "Not configured" },
            ].map(({ label, placeholder }) => (
              <div key={label}>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 5 }}>{label}</label>
                <input
                  readOnly
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button
              className="pill-btn"
              data-primary="true"
              onClick={() => setShowSamlModal(true)}
            >
              <Icon name="settings" size="sm" /> Configure SAML
            </button>
            <button className="pill-btn">
              <Icon name="copy" size="sm" /> Copy Metadata URL
            </button>
          </div>
        </div>

        {/* Session Policy */}
        <div className="card">
          <div className="card-head">
            <Icon name="lock" size="sm" />
            <span className="card-title">Session Policy</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Session timeout */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Session timeout</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>Automatically sign out inactive sessions after this period.</div>
              </div>
              <select
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
                style={{
                  fontSize: 12.5, borderRadius: 8, border: "0.5px solid var(--hairline)",
                  background: "var(--glass-weak)", color: "var(--fg)", padding: "6px 10px", cursor: "pointer",
                }}
              >
                <option value="1h">1 hour</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
                <option value="24h">24 hours</option>
              </select>
            </div>

            <div style={{ borderTop: "0.5px solid var(--hairline)" }} />

            {/* Idle timeout toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Idle timeout</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>Sign out sessions after 30 minutes of inactivity.</div>
              </div>
              <Toggle value={idleTimeout} onChange={setIdleTimeout} />
            </div>

            <div style={{ borderTop: "0.5px solid var(--hairline)" }} />

            {/* Force MFA */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Require MFA for all users</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>Users must enroll in multi-factor authentication before accessing the workspace.</div>
              </div>
              <Toggle value={forceMfa} onChange={setForceMfa} />
            </div>

            <div style={{ borderTop: "0.5px solid var(--hairline)" }} />

            {/* Max concurrent sessions */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Max concurrent sessions</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>Limit how many devices a user can be signed in on simultaneously.</div>
              </div>
              <select
                value={maxSessions}
                onChange={(e) => setMaxSessions(e.target.value)}
                style={{
                  fontSize: 12.5, borderRadius: 8, border: "0.5px solid var(--hairline)",
                  background: "var(--glass-weak)", color: "var(--fg)", padding: "6px 10px", cursor: "pointer",
                }}
              >
                <option value="1">1 session</option>
                <option value="2">2 sessions</option>
                <option value="3">3 sessions</option>
                <option value="5">5 sessions</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head" style={{ padding: "14px 16px 10px" }}>
            <Icon name="eye" size="sm" />
            <span className="card-title">Active Sessions</span>
            <span className="card-sub">{ACTIVE_SESSIONS.length} active</span>
          </div>

          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 100px 140px 120px 80px",
            padding: "0 16px 8px",
            borderBottom: "0.5px solid var(--hairline)",
            fontSize: 11, fontWeight: 600, color: "var(--fg-3)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>User</span>
            <span>IP</span>
            <span>Browser / OS</span>
            <span>Signed In</span>
            <span></span>
          </div>

          {ACTIVE_SESSIONS.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: "grid", gridTemplateColumns: "1fr 100px 140px 120px 80px",
                alignItems: "center", padding: "10px 16px",
                borderBottom: idx < ACTIVE_SESSIONS.length - 1 ? "0.5px solid var(--hairline)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: s.color, color: "#fff",
                  fontWeight: 700, fontSize: 10,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {s.initials}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.user}</div>
                  {s.current && (
                    <span style={{ fontSize: 10.5, color: "#30d158", fontWeight: 600 }}>Current session</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>{s.ip}</span>
              <div>
                <div style={{ fontSize: 12, color: "var(--fg-2)" }}>{s.browser}</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{s.os}</div>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{s.loginTime}</span>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {!s.current && (
                  <button
                    className="pill-btn danger"
                    style={{ fontSize: 11.5 }}
                    onClick={() => handleRevokeSession(s.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Security Events Log */}
        <div className="card">
          <div className="card-head">
            <Icon name="bell" size="sm" />
            <span className="card-title">Security Events</span>
            <span className="card-sub">last 5 events</span>
          </div>
          <div>
            {SECURITY_EVENTS.map((ev) => {
              const cfg = EVENT_CONFIG[ev.type];
              return (
                <div key={ev.id} className="act-row">
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: cfg.bg, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name={cfg.icon} size="sm" style={{ color: cfg.color }} />
                  </div>
                  <div className="act-body">
                    <b>{ev.description}</b>
                    <div style={{ color: "var(--fg-3)" }}>by {ev.actor}</div>
                    <div className="act-time">{ev.timestamp}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 8 }}>
          <button
            className="pill-btn"
            data-primary="true"
            style={{ opacity: saving ? 0.6 : 1 }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* SAML Config Modal */}
      <AppModal
        isOpen={showSamlModal}
        onClose={() => setShowSamlModal(false)}
        title="Configure SAML SSO"
        subtitle="Enter your identity provider details below. Contact your IdP administrator for the required values."
        width={480}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Entity ID (SP)",    placeholder: "https://app.telaios.ai/saml/metadata"   },
            { label: "SSO URL (IdP)",      placeholder: "https://idp.example.com/sso/saml"       },
            { label: "X.509 Certificate",  placeholder: "-----BEGIN CERTIFICATE-----\n...",        isArea: true },
          ].map(({ label, placeholder, isArea }) => (
            <div key={label}>
              <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 5 }}>{label}</label>
              {isArea ? (
                <textarea
                  placeholder={placeholder}
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
                    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
                    color: "var(--fg)", fontSize: 12, outline: "none", resize: "none",
                    fontFamily: "monospace",
                  }}
                />
              ) : (
                <input
                  placeholder={placeholder}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
                    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
                    color: "var(--fg)", fontSize: 13, outline: "none",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions" data-align="end" style={{ marginTop: 22 }}>
          <button className="pill-btn" onClick={() => setShowSamlModal(false)}>Cancel</button>
          <button
            className="pill-btn"
            data-primary="true"
            onClick={() => { setShowSamlModal(false); alert("SAML configuration saved (stub)."); }}
          >
            Save Configuration
          </button>
        </div>
      </AppModal>
    </div>
  );
}
