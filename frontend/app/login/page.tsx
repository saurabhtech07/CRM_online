"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const { mode, toggleMode } = useTheme();
  const alerts = useAlerts();
  const router = useRouter();

  // Sensible defaults so the first sign-in is one click.
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Enter both username and password.");
      return;
    }

    setBusy(true);
    try {
      await login(username.trim(), password);
      alerts.success("Signed in successfully.");
      router.replace("/dashboard");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Sign in failed. Please try again.";
      setError(msg);
      alerts.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-full">
      {/* Full-screen skyline with a dark scrim for legibility. */}
      <div className="auth-full-bg" aria-hidden />
      <div className="auth-full-scrim" aria-hidden />

      {/* Brand top-left, theme toggle top-right. */}
      <div className="auth-topbar">
        <div className="auth-brand">
          <span className="brand-mark" style={{ width: 36, height: 36, fontSize: 14 }}>
            RM
          </span>
          <span>Real Monk Reality</span>
        </div>
        <button
          className="icon-btn auth-theme-btn"
          onClick={toggleMode}
          aria-label={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
        >
          {mode === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      {/* Centered login card. */}
      <main className="auth-center">
        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card-head">
            <div className="login-logo" aria-hidden style={{ fontSize: 16 }}>
              RM
            </div>
            <h1 style={{ margin: 0, fontSize: 23 }}>Real Monk Reality</h1>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 13.5 }}>
              Sign in to your account to continue
            </p>
          </div>

          <div style={{ display: "grid", gap: 15 }}>
            <div className="field">
              <label className="field-label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={busy}
                placeholder="Enter your username"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="password-wrap">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  color: "var(--critical)",
                  fontSize: 13,
                  background: "color-mix(in srgb, var(--critical) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--critical) 30%, transparent)",
                  borderRadius: 8,
                  padding: "9px 11px",
                }}
              >
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              style={{ height: 44, marginTop: 4 }}
            >
              {busy ? <span className="spinner" style={{ borderTopColor: "#fff" }} /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <p className="auth-footer">© {new Date().getFullYear()} Real Monk Reality</p>
      </main>
    </div>
  );
}
