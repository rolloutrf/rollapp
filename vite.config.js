import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = /^\d{1,5}$/.test(process.env.PORT || "") ? Number(process.env.PORT) : 8080;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/tonconnect-manifest.json": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false,
      },
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        // Preserve the browser-facing host so same-origin CSRF checks also
        // work when the dev server is opened from another device on the LAN.
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
