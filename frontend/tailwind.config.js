/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["\"DM Sans\"", "ui-sans-serif", "system-ui"],
        mono: ["\"IBM Plex Mono\"", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#06101c",
          900: "#0b1628",
          800: "#122033",
          700: "#1b2c45",
        },
        mint: {
          400: "#4ef0c2",
          500: "#2ee6a6",
        },
      },
      boxShadow: {
        panel: "0 20px 50px rgba(0,0,0,.28)",
      },
    },
  },
  plugins: [],
};
