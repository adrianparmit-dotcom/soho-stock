import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0a0b",
          card: "#161618",
          elevated: "#1f1f22",
          hover: "#2a2a2e",
        },
        border: {
          DEFAULT: "#2a2a2e",
          strong: "#3a3a40",
        },
        accent: {
          DEFAULT: "#f97316",
          hover: "#ea580c",
        },
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
        critical: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
