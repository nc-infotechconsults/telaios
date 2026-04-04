// Legacy Tailwind v3 config loaded by Tailwind v4 via @config directive
// This is the supported way to use HeroUI's theme plugin with Tailwind v4
const { heroui } = require("@heroui/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  plugins: [heroui()],
};
