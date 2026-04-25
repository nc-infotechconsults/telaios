// Legacy Tailwind v3 config loaded by Tailwind v4 via @config directive
// This is the supported way to use HeroUI's theme plugin with Tailwind v4
const { heroui } = require("@heroui/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            primary: {
              50:  "#FEF4EF",
              100: "#FDE8DA",
              200: "#FAD1B5",
              300: "#F5C6A8",
              400: "#EFA67D",
              500: "#E07B54",
              600: "#CC5E35",
              700: "#A84926",
              800: "#7E3519",
              900: "#53220F",
              DEFAULT: "#E07B54",
              foreground: "#ffffff",
            },
            secondary: {
              50:  "#F4F2FD",
              100: "#EAE7FB",
              200: "#D4CEF7",
              300: "#BAB4F0",
              400: "#9A90E4",
              500: "#7C6FCD",
              600: "#6456B8",
              700: "#4F429A",
              800: "#3B3074",
              900: "#26204D",
              DEFAULT: "#7C6FCD",
              foreground: "#ffffff",
            },
            background: "#FDF6F0",
            foreground: "#1A0F08",
            content1: "#FFFFFF",
            content2: "#FEF4EF",
            content3: "#FAD1B5",
            divider: "rgba(224, 123, 84, 0.15)",
          },
        },
        dark: {
          colors: {
            primary: {
              50:  "#2A1408",
              100: "#3D1D0C",
              200: "#5C2A12",
              300: "#7E3519",
              400: "#A84926",
              500: "#CC5E35",
              600: "#E07B54",
              700: "#EFA67D",
              800: "#F5C6A8",
              900: "#FDE8DA",
              DEFAULT: "#E07B54",
              foreground: "#ffffff",
            },
            secondary: {
              50:  "#150F2E",
              100: "#1F1744",
              200: "#2E2260",
              300: "#3B3074",
              400: "#4F429A",
              500: "#6456B8",
              600: "#7C6FCD",
              700: "#9A90E4",
              800: "#BAB4F0",
              900: "#D4CEF7",
              DEFAULT: "#7C6FCD",
              foreground: "#ffffff",
            },
            background: "#1A1410",
            foreground: "#F5EDE8",
            content1: "#231C18",
            content2: "#2C201A",
            content3: "#3A2A22",
            divider: "rgba(224, 123, 84, 0.15)",
          },
        },
      },
      layout: {
        radius: {
          small:  "8px",
          medium: "14px",
          large:  "20px",
        },
      },
    }),
  ],
};
