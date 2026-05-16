import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TelaiOSLogo } from "../components/common/TelaiOSLogo.tsx";


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
            <TelaiOSLogo size={36} />
          </span>
          <span className="font-bold text-2xl leading-snug tracking-tight text-foreground">
            TelaiOS
          </span>
        </div>

        <div className="apple-card p-8">
          <h1 className="text-lg font-semibold text-foreground mb-6">Sign In</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[13px] font-semibold text-default-500">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="apple-input w-full px-3 py-2.5 text-foreground placeholder-default-400"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[13px] font-semibold text-default-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="apple-input w-full px-3 py-2.5 text-foreground placeholder-default-400"
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
              className="apple-btn w-full h-[50px] bg-primary text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing In…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
