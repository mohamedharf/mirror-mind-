/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "var(--bg-deep)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          light: "var(--primary-light)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        mood: {
          high: "var(--mood-high)",
          low: "var(--mood-low)",
          mid: "var(--mood-mid)",
        },
        border: "var(--border)",
        divider: "var(--divider)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: "'IBM Plex Arabic', 'Cairo', Arial, sans-serif",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
}
