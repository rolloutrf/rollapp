import path from "node:path";

export function registerAndroidAssetLinks(app, distPath) {
  const associationFile = path.join(distPath, ".well-known/assetlinks.json");
  app.get("/.well-known/assetlinks.json", (_req, res) =>
    res.sendFile(associationFile, { dotfiles: "allow" }));
}
