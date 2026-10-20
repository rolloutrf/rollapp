import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: [
    "@tiptap/core",
    "@tiptap/extension-blockquote",
    "@tiptap/extension-bold",
    "@tiptap/extension-code",
    "@tiptap/extension-code-block",
    "@tiptap/extension-details",
    "@tiptap/extension-document",
    "@tiptap/extension-drag-handle-react",
    "@tiptap/extension-hard-break",
    "@tiptap/extension-heading",
    "@tiptap/extension-image",
    "@tiptap/extension-italic",
    "@tiptap/extension-link",
    "@tiptap/extension-list",
    "@tiptap/extension-paragraph",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-strike",
    "@tiptap/extension-table",
    "@tiptap/extension-task-item",
    "@tiptap/extension-task-list",
    "@tiptap/extension-text",
    "@tiptap/extension-underline",
    "@tiptap/markdown",
    "@tiptap/pm/history",
    "@tiptap/pm/model",
    "@tiptap/pm/schema-list",
    "@tiptap/pm/state",
    "@tiptap/pm/tables",
    "@tiptap/pm/view",
    "@tiptap/react",
    "@tiptap/react/menus",
    "@tiptap/starter-kit",
    "marked",
    "react",
    "react-dom/client",
  ] },
  resolve: {
    dedupe: ["react", "react-dom", "@tiptap/react"],
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/tonconnect-manifest.json": {
        target: `http://127.0.0.1:${process.env.PORT || 8080}`,
        changeOrigin: false,
      },
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT || 8080}`,
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
