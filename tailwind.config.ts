import type { Config } from "tailwindcss";

/**
 * SIGHT design tokens.
 * Palette is defined in src/app/globals.css as CSS variables and referenced here
 * so components can use semantic classes (bg-bg, border-line, text-accent, ...).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Hex values (not raw CSS vars) so Tailwind's opacity modifiers
        // (bg-pos/15, border-neg/40, ...) compile correctly. The same values
        // are mirrored as CSS variables in globals.css for direct var() use.
        bg: { DEFAULT: "#050711" },
        surface: { DEFAULT: "#090D1B" },
        panel: { DEFAULT: "#0C1224" },
        line: { DEFAULT: "#202844", strong: "#313B66" },
        fg: { DEFAULT: "#F4F7FF" },
        muted: { DEFAULT: "#929DB7" },
        accent: { DEFAULT: "#7C3AED", strong: "#8B5CF6", blue: "#2563EB" },
        cyan: { DEFAULT: "#22D3EE" },
        pos: { DEFAULT: "#42D392" },
        neg: { DEFAULT: "#FF647C" },
        warn: { DEFAULT: "#FFCB69" },
        info: { DEFAULT: "#22D3EE" },
      },
      fontFamily: {
        sans: "var(--font-geist-sans)",
        mono: "var(--font-geist-mono)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      animation: {
        "live-pulse": "sightLivePulse 2s ease-in-out infinite",
        "fade-in": "sightFadeIn 0.25s ease-out",
        "slide-up": "sightSlideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        sightLivePulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        sightFadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        sightSlideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
