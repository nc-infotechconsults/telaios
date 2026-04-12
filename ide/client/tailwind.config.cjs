// Legacy Tailwind v3 config loaded by Tailwind v4 via @config directive.
// Required for HeroUI plugin compatibility.
const { heroui } = require("@heroui/theme");

module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  plugins: [heroui()],
};
