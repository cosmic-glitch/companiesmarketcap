import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        "bg-hover": "var(--bg-hover)",
        accent: "var(--accent-primary)",
        "accent-hover": "var(--accent-hover)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
      },
      boxShadow: {
        glow: "0 0 16px rgba(99, 102, 241, 0.3)",
        "glow-sm": "0 0 8px rgba(99, 102, 241, 0.2)",
        "glow-lg": "0 0 24px rgba(99, 102, 241, 0.4)",
        // Soft layered card shadow for the Daylight look.
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 18px 40px rgba(99, 102, 241, 0.10)",
      },
      backgroundImage: {
        "gradient-accent": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        "gradient-accent-hover": "linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
