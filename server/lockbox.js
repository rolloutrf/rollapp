import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function loadLockboxValueFromMetadata(secretId, secretKey) {
  const tokenResponse = await fetch(
    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) },
  );
  if (!tokenResponse.ok) throw new Error(`Metadata IAM token request failed: ${tokenResponse.status}`);
  const { access_token: accessToken } = await tokenResponse.json();

  const payloadResponse = await fetch(
    `https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/${encodeURIComponent(secretId)}/payload`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) },
  );
  if (!payloadResponse.ok) throw new Error(`Lockbox payload request failed: ${payloadResponse.status}`);
  const payload = await payloadResponse.json();
  const entry = payload.entries?.find((item) => item.key === secretKey);
  if (!entry?.textValue) throw new Error(`Lockbox key "${secretKey}" not found`);
  return entry.textValue;
}

async function loadLockboxValueFromCli(secretId, secretKey, env) {
  const args = ["lockbox", "payload", "get", "--id", secretId, "--format", "json"];
  if (env.YC_FOLDER_ID) args.push("--folder-id", env.YC_FOLDER_ID);

  let stdout;
  try {
    ({ stdout } = await execFileAsync("yc", args, { timeout: 15_000, maxBuffer: 1024 * 1024 }));
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    throw new Error(`Yandex CLI Lockbox request failed${code}`);
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("Yandex CLI returned an invalid Lockbox payload");
  }
  const entry = payload.entries?.find((item) => item.key === secretKey);
  const value = entry?.textValue ?? entry?.text_value;
  if (!value) throw new Error(`Lockbox key "${secretKey}" not found`);
  return value;
}

export async function loadLockboxValue(secretId, secretKey, env = process.env) {
  if (!secretId || !secretKey) throw new Error("Lockbox secret ID and key are required");
  if (env.YC_LOCKBOX_SOURCE === "cli") return loadLockboxValueFromCli(secretId, secretKey, env);
  return loadLockboxValueFromMetadata(secretId, secretKey);
}
