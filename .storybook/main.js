import { mergeConfig } from "vite";

export default {
  framework: { name: "@storybook/react-vite", options: {} },
  addons: ["@storybook/addon-docs"],
  stories: ["../storybook/**/*.stories.jsx"],
  staticDirs: ["../public"],
  typescript: { reactDocgen: false },
  features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    return mergeConfig({ ...config, server: { ...config.server, proxy: undefined } }, {
      envPrefix: "STORYBOOK_",
      build: { sourcemap: false },
      plugins: [{
        name: "rollapp-storybook-no-api",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const pathname = req.url?.split("?")[0] ?? "";
            if (!/^\/(?:api(?:\/|$)|mcp(?:\/|$)|tonconnect-manifest\.json$)/.test(pathname)) return next();
            res.statusCode = 404;
            res.end("Rollapp API is available in the application, not in Storybook.");
          });
        },
      }],
    });
  },
};
