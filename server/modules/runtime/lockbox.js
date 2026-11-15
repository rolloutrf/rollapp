import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function loadLockboxValueFromIam(secretId, secretKey, env) {
  const token = env.YC_IAM_TOKEN;
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(secretId) || typeof token !== "string" || !token || /[\r\n]/.test(token)) {
    throw new Error("Invalid IAM Lockbox configuration");
  }
  let response;
  try {
    response = await fetch(`https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/${secretId}/payload`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("IAM Lockbox request failed");
  }
  if (!response.ok) throw new Error(`IAM Lockbox request failed: ${response.status}`);
  let payload;
  try { payload = await response.json(); } catch { throw new Error("Invalid IAM Lockbox payload"); }
  const entries = Array.isArray(payload?.entries) ? payload.entries.filter(item => item?.key === secretKey) : [];
  if (entries.length !== 1 || typeof entries[0].textValue !== "string" || !entries[0].textValue || "binaryValue" in entries[0]) {
    throw new Error("IAM Lockbox text key missing or ambiguous");
  }
  return entries[0].textValue;
}

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
  if (env.YC_LOCKBOX_SOURCE === "iam") return loadLockboxValueFromIam(secretId, secretKey, env);
  if (env.YC_LOCKBOX_SOURCE === "cli") return loadLockboxValueFromCli(secretId, secretKey, env);
  return loadLockboxValueFromMetadata(secretId, secretKey);
}
