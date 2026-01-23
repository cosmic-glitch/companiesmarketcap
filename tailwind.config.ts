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
      },
      boxShadow: {
        glow: "0 0 16px rgba(8, 145, 178, 0.3)",
        "glow-sm": "0 0 8px rgba(8, 145, 178, 0.2)",
        "glow-lg": "0 0 24px rgba(8, 145, 178, 0.4)",
      },
      backgroundImage: {
        "gradient-accent": "linear-gradient(135deg, #0891b2 0%, #7c3aed 100%)",
        "gradient-accent-hover": "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
