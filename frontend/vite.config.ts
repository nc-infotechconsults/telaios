import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// When running inside Docker the proxy needs Docker network service names.
// Outside Docker this env var is unset, so we fall back to localhost.
const SERVER_URL = process.env.INTERNAL_SERVER_URL ?? process.env.VITE_API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: SERVER_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: SERVER_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
