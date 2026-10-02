"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ACCENTS, useTheme, type AccentKey } from "@/lib/theme";
import { Assistant } from "./assistant";
import { initials } from "./ui";

/** Module key -> route. Only modules the role can view are rendered. */
const ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  leads: "/leads",
  clients: "/leads?tab=clients",
  pending: "/leads?tab=pending",
  users: "/users",
  sitevisits: "/visits",
};

/** Live date + time in the top bar. Updates every second. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  // Tick every second. The first value is set on the first tick and via a one-shot
  // timeout so it appears immediately, all from outside the render pass - this keeps
  // the server/client first render identical (no hydration mismatch).
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!now) return <div className="clock" aria-hidden />;

  const day = now.toLocaleDateString("en-IN", { weekday: "short" });
  const date = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <div className="clock" title={`${day}, ${date} ${time}`}>
      <span className="clock-time">{time}</span>
      <span className="clock-date">
        {day}, {date}
      </span>
    </div>
  );
}

function ThemeControls() {
  const { mode, toggleMode, accent, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        className="icon-btn"
        onClick={toggleMode}
        aria-label={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
        title={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
      >
        {mode === "light" ? "🌙" : "☀️"}
      </button>

      <div ref={wrapRef} style={{ position: "relative" }}>
        <button
          className="icon-btn"
          onClick={() => setOpen((o) => !o)}
          aria-label="Choose accent colour"
          aria-expanded={open}
          title="Choose accent colour"
        >
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: 4,
              background: "var(--accent)",
              display: "block",
            }}
          />
        </button>

        {open && (
          <div className="popover" role="dialog" aria-label="Accent colour">
            <div className="popover-title">Accent colour</div>
            <div className="swatch-grid">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => {
                const a = ACCENTS[key];
                const active = accent === key;
                return (
                  <button
                    key={key}
                    className="swatch"
                    style={{ background: mode === "dark" ? a.dark : a.light }}
                    onClick={() => {
                      setAccent(key);
                      setOpen(false);
                    }}
                    aria-pressed={active}
                    aria-label={a.label}
                    title={a.label}
                  >
                    {active ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="user-chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="avatar" aria-hidden>
          {initials(user.fullName)}
        </span>
        <span className="user-chip-text">
          <span className="user-name">{user.fullName}</span>
          <span className="user-handle">@{user.username}</span>
        </span>
      </button>

      {open && (
        <div className="popover" role="menu" style={{ minWidth: 210 }}>
          <div style={{ padding: "2px 4px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{user.fullName}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{user.email}</div>
            <div style={{ marginTop: 6 }}>
              <span
                className="badge"
                style={{
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                }}
              >
                {user.roleName}
              </span>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 10, justifyContent: "flex-start" }}
            onClick={logout}
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, visibleModules } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Client-side route guard: the JWT lives in localStorage, which the server
  // cannot see, so protection has to happen here.
  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;

  const modules = visibleModules();

  return (
    <div className="app-shell">
      <header className="topbar" style={{ position: "sticky" }}>
        <div className="topbar-inner" style={{ position: "relative" }}>
          <Link href="/dashboard" className="brand">
            <span className="brand-mark" aria-hidden>
              RM
            </span>
            <span>Real Monk Reality</span>
          </Link>

          <nav className={`nav${menuOpen ? " mobile-open" : ""}`} aria-label="Main">
            <Suspense fallback={<NavLinksFallback modules={modules} />}>
              <NavLinks modules={modules} onNavigate={() => setMenuOpen(false)} />
            </Suspense>
          </nav>

          <div className="topbar-actions">
            <Assistant />
            <Clock />
            <ThemeControls />
            <UserMenu />
            <button
              className="icon-btn mobile-only"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}

type NavModule = { key: string; name: string };

/**
 * The menu links with the active highlight. Uses useSearchParams (reactive to
 * ?tab= changes) so switching Leads -> Clients -> Pending - which all share the
 * /leads pathname - lights up exactly one link. Must live under a Suspense
 * boundary, which AppShell provides.
 */
function NavLinks({
  modules,
  onNavigate,
}: {
  modules: NavModule[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "leads";

  return (
    <>
      {modules.map((m) => {
        const href = ROUTES[m.key] ?? `/${m.key}`;
        const [base, query = ""] = href.split("?");
        const hrefTab = new URLSearchParams(query).get("tab") ?? "leads";
        // On /leads, exactly one of Leads/Clients/Pending is active - the one
        // whose tab matches the URL. Elsewhere, a plain pathname match.
        const active =
          pathname === base && (base !== "/leads" || hrefTab === currentTab);
        return (
          <Link
            key={m.key}
            href={href}
            className={`nav-link${active ? " active" : ""}`}
            onClick={onNavigate}
          >
            {m.name}
          </Link>
        );
      })}
    </>
  );
}

/** Non-reactive fallback shown for the render before search params resolve. */
function NavLinksFallback({ modules }: { modules: NavModule[] }) {
  const pathname = usePathname();
  return (
    <>
      {modules.map((m) => {
        const href = ROUTES[m.key] ?? `/${m.key}`;
        const base = href.split("?")[0];
        // Without the tab we can't disambiguate the /leads trio, so highlight none.
        const active = pathname === base && base !== "/leads";
        return (
          <Link key={m.key} href={href} className={`nav-link${active ? " active" : ""}`}>
            {m.name}
          </Link>
        );
      })}
    </>
  );
}
