import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const IDE_SERVER_URL =
  process.env.VITE_IDE_SERVER_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: IDE_SERVER_URL,
        changeOrigin: true,
      },
      "/ws": {
        target: IDE_SERVER_URL.replace("http", "ws"),
        ws: true,
        rewrite: (path) => path,
        changeOrigin: true,
      },
    },
  },
});
