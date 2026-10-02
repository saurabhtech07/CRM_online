"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, AUTH_EXPIRED_EVENT, tokenStore, userStore } from "./api";
import type { AuthUser, LoginResponse, PermAction } from "./types";

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (moduleKey: string, action?: PermAction) => boolean;
  visibleModules: () => { key: string; name: string }[];
}

const AuthContext = createContext<AuthState | null>(null);

/** Seed from the cached identity so the first render already knows who is signed in. */
function initialUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  return tokenStore.get() ? userStore.get<AuthUser>() : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  // With no token there is nothing to confirm, so we are ready immediately.
  const [ready, setReady] = useState(() =>
    typeof window === "undefined" ? false : !tokenStore.get(),
  );
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!tokenStore.get()) return;
    // The cached identity is already showing; confirm it with the server so a
    // permission change made by an admin lands without a re-login.
    api
      .get<AuthUser>("/auth/me")
      .then((fresh) => {
        setUser(fresh);
        userStore.set(fresh);
      })
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      if (pathname !== "/login") router.replace("/login");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [router, pathname]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>("/auth/login", { username, password });
    tokenStore.set(res.token);
    userStore.set(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const can = useCallback(
    (moduleKey: string, action: PermAction = "canView") => {
      const p = user?.permissions.find((x) => x.moduleKey === moduleKey);
      return Boolean(p?.[action]);
    },
    [user],
  );

  const visibleModules = useCallback(
    () =>
      (user?.permissions ?? [])
        .filter((p) => p.canView)
        // 'assistant' is a top-bar icon, not a menu page.
        .filter((p) => p.moduleKey !== "assistant")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({ key: p.moduleKey, name: p.moduleName })),
    [user],
  );

  const value = useMemo(
    () => ({ user, ready, login, logout, can, visibleModules }),
    [user, ready, login, logout, can, visibleModules],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
