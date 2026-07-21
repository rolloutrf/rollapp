import { spawn } from "node:child_process";
import fs from "node:fs";

async function loadLockboxValue(secretId, secretKey = "postgresql_password") {
  const tokenResponse = await fetch(
    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) },
  );
  if (!tokenResponse.ok) throw new Error(`Metadata IAM token request failed: ${tokenResponse.status}`);
  const { access_token: accessToken } = await tokenResponse.json();

  const payloadResponse = await fetch(
    `https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/${encodeURIComponent(secretId)}/payload`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!payloadResponse.ok) throw new Error(`Lockbox payload request failed: ${payloadResponse.status}`);
  const payload = await payloadResponse.json();
  const entry = payload.entries?.find((item) => item.key === secretKey);
  if (!entry?.textValue) throw new Error(`Lockbox key "${secretKey}" not found`);
  return entry.textValue;
}

async function loadLockboxSecret() {
  const secretId = process.env.YC_LOCKBOX_SECRET_ID;
  const secretKey = process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password";
  if (!secretId || process.env.PGPASSWORD) return;
  process.env.PGPASSWORD = await loadLockboxValue(secretId, secretKey);
  console.log("Runtime database credential loaded from Yandex Lockbox");
}

await loadLockboxSecret();

if (process.env.PUBLIC_HOST && fs.existsSync("/usr/sbin/caddy")) {
  const caddy = spawn("/usr/sbin/caddy", ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], { stdio: "inherit" });
  caddy.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Caddy exited with code ${code}`);
      process.exit(code);
    }
  });
}

await import("./index.js");
