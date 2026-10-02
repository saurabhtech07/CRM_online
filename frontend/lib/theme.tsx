"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Mode = "light" | "dark";

/** Accent choices. Each ships a light and dark step so contrast holds in both modes. */
export const ACCENTS = {
  blue: { label: "Blue", light: "#2a78d6", dark: "#3987e5" },
  green: { label: "Green", light: "#008300", dark: "#1baf7a" },
  violet: { label: "Violet", light: "#4a3aa7", dark: "#9085e9" },
  orange: { label: "Orange", light: "#eb6834", dark: "#d95926" },
  magenta: { label: "Magenta", light: "#c2185b", dark: "#d55181" },
  aqua: { label: "Aqua", light: "#0f766e", dark: "#199e70" },
} as const;

export type AccentKey = keyof typeof ACCENTS;

interface ThemeState {
  mode: Mode;
  accent: AccentKey;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  setAccent: (a: AccentKey) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const MODE_KEY = "crm.mode";
const ACCENT_KEY = "crm.accent";

/**
 * Read the persisted choice during the first render rather than in an effect.
 * The inline script in layout.tsx already stamped the DOM with the same values,
 * so this just brings React state in line - no flash, no cascading render.
 */
function initialMode(): Mode {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(MODE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialAccent(): AccentKey {
  if (typeof window === "undefined") return "blue";
  const saved = localStorage.getItem(ACCENT_KEY);
  return saved && saved in ACCENTS ? (saved as AccentKey) : "blue";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [accent, setAccentState] = useState<AccentKey>(initialAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.style.colorScheme = mode;
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    const a = ACCENTS[accent];
    root.style.setProperty("--accent", mode === "dark" ? a.dark : a.light);
    root.setAttribute("data-accent", accent);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent, mode]);

  const setMode = useCallback((m: Mode) => setModeState(m), []);
  const toggleMode = useCallback(
    () => setModeState((m) => (m === "light" ? "dark" : "light")),
    [],
  );
  const setAccent = useCallback((a: AccentKey) => setAccentState(a), []);

  const value = useMemo(
    () => ({ mode, accent, setMode, toggleMode, setAccent }),
    [mode, accent, setMode, toggleMode, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/**
 * Chart series colors, stepped per mode. Validated with the dataviz validator:
 * light #2a78d6,#008300,#e87ba4,#eda100 and dark #3987e5,#008300,#d55181,#c98500
 * both pass the lightness band, chroma floor, CVD separation and normal-vision floor.
 * Fixed order - never cycled, never reassigned when a series is filtered out.
 */
export const SERIES = {
  light: { leads: "#2a78d6", clients: "#008300", rejected: "#e87ba4", pending: "#eda100" },
  dark: { leads: "#3987e5", clients: "#008300", rejected: "#d55181", pending: "#c98500" },
} as const;

export function useSeriesColors() {
  const { mode } = useTheme();
  return SERIES[mode];
}

/** Chart chrome tokens from the reference palette. */
export const CHROME = {
  light: { grid: "#e1e0d9", axis: "#c3c2b7", muted: "#898781", surface: "#fcfcfb" },
  dark: { grid: "#2c2c2a", axis: "#383835", muted: "#898781", surface: "#1a1a19" },
} as const;

export function useChrome() {
  const { mode } = useTheme();
  return CHROME[mode];
}
