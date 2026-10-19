import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const compute = "https://compute.api.cloud.yandex.net/compute/v1";
const operations = "https://operation.api.cloud.yandex.net/operations";
const validId = value => typeof value === "string" && /^[a-zA-Z0-9-]{1,50}$/.test(value);

function validate(config) {
  if (![config.vmId, config.folderId, config.runtimeSaId].every(validId)
    || !/^[a-f0-9]{40}$/.test(config.version || "")
    || !/^cr\.yandex\/[a-z0-9]+\/[a-z0-9/_.-]+:[a-f0-9]{40}$/.test(config.image || "")
    || !config.image.endsWith(`:${config.version}`)
    || typeof config.token !== "string" || !config.token.trim() || /[\r\n]/.test(config.token)) {
    throw new Error("Invalid deployment configuration; refusing cloud access");
  }
}

export function renderDeploymentCompose(template, config) {
  validate(config);
  if (!template.includes('__IMAGE__') || !template.includes('__VERSION__')) throw new Error("Deployment template is missing immutable image/version placeholders");
  return template.replaceAll('__IMAGE__', config.image).replaceAll('__VERSION__', config.version);
}

function verifyInstance(instance, config) {
  if (instance?.id !== config.vmId || instance.folderId !== config.folderId
    || instance.status !== "RUNNING" || instance.serviceAccountId !== config.runtimeSaId
    || instance.metadataOptions?.gceHttpEndpoint !== "ENABLED"
    || instance.metadataOptions?.gceHttpToken !== "ENABLED"
    || !instance.metadata || typeof instance.metadata !== "object" || Array.isArray(instance.metadata)
    || Object.values(instance.metadata).some(value => typeof value !== "string")
    || instance.metadata["docker-container-declaration"] != null) {
    throw new Error("Refusing an unexpected or conflicting production VM");
  }
}

// Same metadata-only operation as `yc compute instance add-metadata`, without
// downloading a CLI binary. No stop/restart/delete, full metadata replacement,
// arbitrary endpoint, request-body logging or implicit mutation retry exists.
export async function deployVmMetadata(config, compose, { fetch = globalThis.fetch, delay = sleep, now = Date.now, pollLimit = 60, checkOnly = false } = {}) {
  validate(config);
  if (typeof compose !== "string" || !compose.includes(`image: "${config.image}"`)
    || !compose.includes(`APP_VERSION: "${config.version}"`) || /__IMAGE__|__VERSION__/.test(compose)) {
    throw new Error("Compose does not contain the expected immutable image/version");
  }
  const deadline = now() + 180_000;
  const request = async (url, body) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("Cloud metadata update exceeded its time budget");
    let response;
    try {
      response = await fetch(url, {
        method: body ? "POST" : "GET", redirect: "error",
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        headers: { Authorization: `Bearer ${config.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error("Cloud metadata request failed; no automatic mutation retry"); }
    if (!response.ok) throw new Error(`Cloud metadata request failed (HTTP ${response.status})`);
    try { return await response.json(); }
    catch { throw new Error("Cloud metadata response is not valid JSON"); }
  };
  const url = `${compute}/instances/${config.vmId}`;
  const before = await request(`${url}?view=FULL`);
  verifyInstance(before, config);
  if (checkOnly) return { checked: true, version: config.version };
  // Only this one map entry is upserted; never send `delete` or other keys.
  let operation = await request(`${url}/updateMetadata`, { upsert: { "docker-compose": compose } });
  if (!validId(operation?.id) || operation.done !== undefined && typeof operation.done !== "boolean") throw new Error("Invalid metadata operation response");
  const operationId = operation.id;
  for (let attempt = 0; !operation.done && !operation.error && attempt < pollLimit; attempt++) {
    await delay(1000);
    operation = await request(`${operations}/${operationId}`);
    if (operation?.id !== operationId || operation.done !== undefined && typeof operation.done !== "boolean") throw new Error("Metadata operation identity changed");
  }
  if (operation.error) throw new Error("Cloud metadata operation failed; keeping the VM running");
  if (!operation.done) throw new Error("Cloud metadata operation did not finish within its polling limit");
  const after = await request(`${url}?view=FULL`);
  verifyInstance(after, config);
  if (after.metadata["docker-compose"] !== compose) throw new Error("Production VM metadata does not match the expected deployment");
  for (const [key, value] of Object.entries(before.metadata)) {
    if (key !== "docker-compose" && after.metadata[key] !== value) throw new Error("Unrelated VM metadata changed during deployment");
  }
  return { version: config.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = { vmId: process.env.YC_VM_ID, folderId: process.env.YC_FOLDER_ID, runtimeSaId: process.env.YC_RUNTIME_SA_ID, token: process.env.YC_IAM_TOKEN, image: process.env.IMAGE_SHA, version: process.env.GITHUB_SHA };
    const template = await readFile(new URL("../deploy/docker-compose.template.yml", import.meta.url), "utf8");
    const result = await deployVmMetadata(config, renderDeploymentCompose(template, config), { checkOnly: process.argv.includes("--check-only") });
    console.log(result.checked ? "VM identity verified; no metadata written." : "Expected immutable image/version verified in VM metadata; production health verification is still required.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
