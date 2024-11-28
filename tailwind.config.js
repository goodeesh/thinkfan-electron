/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderColor: {
        border: "hsl(var(--border))"
      },
      backgroundColor: {
        background: "hsl(var(--background))"
      },
      textColor: {
        foreground: "hsl(var(--foreground))"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
}

