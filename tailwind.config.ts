import type { Config } from "tailwindcss";

/**
 * The Warm Sweep design tokens — mirrored from the operator's HTML mockup.
 * Warm light theme: parchment background, charcoal dark panels, sweep-green
 * primary, ember-orange accent. Fonts: Poppins (headings), Inter (body),
 * JetBrains Mono (system/agent text).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces
        parchment: "#FAF7F2",
        charcoal: "#16191c",
        "charcoal-soft": "#22272c",
        "charcoal-line": "#24292e",
        card: "#ffffff",
        cream: "#FBFAF7",
        "cream-head": "#faf8f3",
        // brand
        sweep: {
          DEFAULT: "#1B7A57", // primary green (on light)
          light: "#5CA98A", // mint green (on dark)
          mist: "#F6FBF8", // green-tinted surface
        },
        ember: {
          DEFAULT: "#E8743B", // orange accent
          hover: "#d9652f",
        },
        avatar: "#2A4D8F",
        // text
        ink: "#1A1A1A",
        "ink-soft": "#33332c",
        muted: "#56554e",
        "muted-2": "#888780",
        "muted-3": "#a3a299",
        "on-dark": "#e8e8e4",
        "on-dark-soft": "#9aa0a5",
        "on-dark-mute": "#7b8288",
        // lines
        line: "#ece7dd",
        "line-2": "#f1ece3",
        "line-3": "#D8D3C8",
      },
      fontFamily: {
        heading: ["var(--font-poppins)", "Poppins", "sans-serif"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        xl2: "14px",
      },
      // Elevation tokens — three deliberate steps instead of ad-hoc arbitrary shadows.
      boxShadow: {
        card: "0 1px 2px rgba(20,18,12,0.04), 0 1px 3px rgba(20,18,12,0.06)",
        pop: "0 8px 30px -10px rgba(20,18,12,0.25)",
        lift: "0 16px 48px -16px rgba(20,18,12,0.38)",
      },
      keyframes: {
        wsPulse: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".55", transform: "scale(.82)" },
        },
        wsRise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        wsGrow: {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        // Interaction motion for optimistic triage (approve/reject exits, select pop).
        wsExit: {
          from: { opacity: "1", transform: "none", maxHeight: "200px" },
          to: { opacity: "0", transform: "translateX(36px)", maxHeight: "0px" },
        },
        wsPop: {
          from: { transform: "scale(.985)" },
          to: { transform: "scale(1)" },
        },
      },
      animation: {
        wsPulse: "wsPulse 2s ease-in-out infinite",
        wsRise: "wsRise .5s ease both",
        wsGrow: "wsGrow .8s cubic-bezier(.2,.8,.3,1) both",
        wsExit: "wsExit .3s cubic-bezier(.4,0,1,1) both",
        wsPop: "wsPop .14s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
