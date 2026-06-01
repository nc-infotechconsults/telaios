import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TelaiOSLogo } from "../components/common/TelaiOSLogo.tsx";
import MeshBackground from "../components/MeshBackground";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, position: "relative" }}>
      <MeshBackground />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 380 }}>
        <div
          style={{
            background: "var(--glass-strong)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: "0.5px solid var(--glass-edge)",
            borderRadius: 22,
            boxShadow: "var(--shadow-glass-lg)",
            padding: "36px 32px",
            width: "100%",
            maxWidth: 380,
            position: "relative",
          }}
        >
          {/* Brand header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 28 }}>
            <TelaiOSLogo size={36} />
            <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", color: "var(--label-primary)" }}>
              TelaiOS
            </span>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600, color: "var(--label-secondary)" }}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="apple-input"
                style={{ width: "100%", padding: "10px 12px", fontSize: 14 }}
                placeholder="you@example.com"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="password" style={{ fontSize: 13, fontWeight: 600, color: "var(--label-secondary)" }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="apple-input"
                style={{ width: "100%", padding: "10px 12px", fontSize: 14 }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" style={{ color: "var(--color-red)", fontSize: 13, marginTop: 8 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "opacity 150ms",
                letterSpacing: "-0.01em",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
