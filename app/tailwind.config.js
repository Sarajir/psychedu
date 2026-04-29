/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      colors: {
        ink: {
          900: "#111827",
          700: "#374151",
          500: "#6b7280",
          300: "#d1d5db",
          100: "#f3f4f6",
        },
        accent: {
          DEFAULT: "#0f766e",
          soft: "#ccfbf1",
        },
      },
    },
  },
  plugins: [],
};
