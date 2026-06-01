import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { getSettings, patchSettings } from "../../lib/api";
import type { AppSettings } from "../../types";
import { persistAndApplyAppSettings } from "../../lib/appSettings";
import { toast } from "../../lib/toast";

const inputStyle = {
  width: "100%", boxSizing: "border-box" as const, padding: "8px 12px", borderRadius: 8,
  border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
  color: "var(--fg)", fontSize: 13, outline: "none",
};

export default function WorkspaceSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("");

  useEffect(() => {
    setLoading(true);
    getSettings()
      .then((s) => {
        setSettings(s);
        setBrandName(s.brand_name ?? "");
        setBrandColor(s.brand_color ?? "#0a84ff");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const updated = await patchSettings({ brand_name: brandName, brand_color: brandColor });
      setSettings(updated);
      persistAndApplyAppSettings(updated);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-scroll">
      <h1 className="h-page">Settings</h1>
      <p className="sub-page">Workspace branding and configuration</p>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
      ) : (
        <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Branding */}
          <div className="card">
            <div className="card-head">
              <Icon name="spark" size="sm" />
              <span className="card-title">Branding</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 6 }}>
                  Brand name
                </label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="TelaiOS"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 6 }}>
                  Brand color
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    style={{ width: 36, height: 36, borderRadius: 6, border: "0.5px solid var(--hairline)", cursor: "pointer", padding: 2 }}
                  />
                  <input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#0a84ff"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="pill-btn"
                  style={{
                    background: "var(--accent-1)", color: "#fff", borderColor: "transparent",
                    opacity: saving ? 0.5 : 1,
                  }}
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="card">
            <div className="card-head">
              <Icon name="bell" size="sm" />
              <span className="card-title">Danger zone</span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 12 }}>
              Destructive actions — these cannot be undone.
            </p>
            <button
              className="pill-btn"
              style={{ borderColor: "#ff3b30", color: "#ff3b30" }}
              onClick={() => {
                localStorage.clear();
                window.location.href = "/login";
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
