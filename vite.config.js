import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { zipSync } from "fflate";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = /^\d{1,5}$/.test(process.env.PORT || "") ? Number(process.env.PORT) : 8080;
const extensionFileName = "rollapp-browser-extension.zip";

async function browserExtensionArchive() {
  const directory = new URL("./browser-extension/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^(?:manifest\.json|README\.md|[a-z-]+\.js)$/.test(name)).sort();
  const entries = await Promise.all(names.map(async (name) => [
    `rollapp-browser-extension/${name}`,
    new Uint8Array(await readFile(new URL(name, directory))),
  ]));
  return zipSync(Object.fromEntries(entries), { mtime: new Date("2020-01-01T00:00:00Z") });
}

function browserExtensionDownload() {
  return {
    name: "rollapp-browser-extension-download",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== `/${extensionFileName}` || !["GET", "HEAD"].includes(request.method)) return next();
        try {
          const archive = await browserExtensionArchive();
          response.setHeader("Content-Type", "application/zip");
          response.setHeader("Content-Length", archive.byteLength);
          response.end(request.method === "HEAD" ? undefined : archive);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: extensionFileName, source: await browserExtensionArchive() });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), browserExtensionDownload()],
  optimizeDeps: { include: [
    "@ui-sdk/core",
    "@ui-sdk/react/agent",
    "@ui-sdk/react/primitive",
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
