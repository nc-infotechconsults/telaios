import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// When running inside Docker the proxy needs Docker network service names.
// Outside Docker these env vars are unset, so we fall back to localhost.
const DATA_API = process.env.INTERNAL_DATA_API_URL ?? "http://localhost:3000";
const AGENT_HTTP = process.env.INTERNAL_AGENT_SERVICE_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: DATA_API,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/agent": {
        target: AGENT_HTTP,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ""),
      },
    },
  },
});
