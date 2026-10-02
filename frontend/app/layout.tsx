import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Real Monk Reality — CRM",
  description: "Real Monk Reality — lead and client management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

/**
 * Stamps the saved theme onto <html> before first paint so a dark-mode user
 * never sees a white flash. Mirrors the keys and accent values in lib/theme.tsx.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var m = localStorage.getItem('crm.mode');
    if (m !== 'light' && m !== 'dark') {
      m = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', m);
    document.documentElement.style.colorScheme = m;

    var accents = {
      blue:    { light: '#2a78d6', dark: '#3987e5' },
      green:   { light: '#008300', dark: '#1baf7a' },
      violet:  { light: '#4a3aa7', dark: '#9085e9' },
      orange:  { light: '#eb6834', dark: '#d95926' },
      magenta: { light: '#c2185b', dark: '#d55181' },
      aqua:    { light: '#0f766e', dark: '#199e70' }
    };
    var a = localStorage.getItem('crm.accent') || 'blue';
    if (accents[a]) {
      document.documentElement.style.setProperty('--accent', accents[a][m]);
      document.documentElement.setAttribute('data-accent', a);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
