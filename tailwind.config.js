/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // v3 Two-tier — Main-visual serif (Cormorant + Noto Serif TC) / Content sans (Inter + Noto Sans TC)
        display: ["var(--font-cormorant)", "var(--font-noto-serif)", "Noto Serif TC", "serif"],
        "serif-tc": ["var(--font-noto-serif)", "Noto Serif TC", "serif"],
        body: ["var(--font-inter)", "var(--font-noto-sans)", "Noto Sans TC", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "var(--font-noto-sans)", "Noto Sans TC", "system-ui", "sans-serif"],
        "en-italic": ["var(--font-cormorant)", "Georgia", "serif"],
        numeric: ["var(--font-inter)", "var(--font-noto-sans)", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // 保留既有 CSS 不被 Tailwind reset 覆蓋
  },
};
