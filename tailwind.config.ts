import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tactyc-inspired palette
        ink: {
          DEFAULT: "#0f172a",
          soft: "#1e293b",
        },
        brand: {
          50: "#eef4ff",
          100: "#dae6ff",
          200: "#bccfff",
          300: "#8eabff",
          400: "#597cff",
          500: "#3b5bff",
          600: "#2438eb",
          700: "#1d2bd0",
          800: "#1e29a8",
          900: "#1e2885",
        },
        accent: {
          green: "#0f9d58",
          red: "#e5484d",
          amber: "#f5a623",
          teal: "#0d9488",
          violet: "#7c3aed",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        pop: "0 10px 30px rgba(16,24,40,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
