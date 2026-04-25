import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";



function TelaioLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      {/* Warp threads (vertical) */}
      <rect x="7"    y="4" width="3"   height="24" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="14.5" y="4" width="3"   height="24" rx="1.5" fill="currentColor" />
      <rect x="22"   y="4" width="3"   height="24" rx="1.5" fill="currentColor" opacity="0.55" />
      {/* Weft threads (horizontal) */}
      <rect x="4" y="7"  width="24" height="3"   rx="1.5"  fill="currentColor" opacity="0.9" />
      <rect x="4" y="14" width="24" height="2.5" rx="1.25" fill="currentColor" opacity="0.45" />
      <rect x="4" y="20" width="24" height="2.5" rx="1.25" fill="currentColor" opacity="0.25" />
    </svg>
  );
}



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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <span className="text-primary">
            <TelaioLogo size={36} />
          </span>
          <span className="font-bold text-2xl leading-snug tracking-tight text-foreground">
            Telaio
          </span>
        </div>

        <div className="clay-card p-8">
          <h1 className="text-lg font-semibold text-foreground mb-6">Sign in</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-default-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="clay-input w-full px-3 py-2.5 text-foreground text-sm placeholder-default-400"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-default-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="clay-input w-full px-3 py-2.5 text-foreground text-sm placeholder-default-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="clay-btn w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
