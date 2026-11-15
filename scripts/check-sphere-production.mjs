import { setTimeout } from "node:timers/promises";
import { localizedPageUrl } from "../shared/page-urls.js";
import { SPHERE_APPLICATIONS } from "../shared/applications.js";

const version = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(version || "")) throw new Error("Pass the expected production commit SHA");
const attempts = Number(process.env.ROLLAPP_SPHERE_HEALTH_ATTEMPTS || 36);

async function verify(id, { host, home }) {
  const url = `https://${host}`;
  const request = (path, redirect = "error") => fetch(`${url}${path}`, { redirect, signal: AbortSignal.timeout(10_000) });
  const legacyPath = `${home}?tab=products`;
  const [healthResponse, homeResponse, deepResponse, accountResponse, legacyResponse] = await Promise.all([
    request("/api/healthz"), request("/"), request(localizedPageUrl(home)), request("/api/me"), request(legacyPath, "manual"),
  ]);
  if (![healthResponse, homeResponse, deepResponse, accountResponse].every(response => response.ok)) {
    throw new Error(`${id} returned HTTP ${[healthResponse, homeResponse, deepResponse, accountResponse].map(response => response.status).join("/")}`);
  }
  const [health, homeHtml, deepHtml, account] = await Promise.all([
    healthResponse.json(), homeResponse.text(), deepResponse.text(), accountResponse.json(),
  ]);
  if (!(health.ok === true && health.service === `rollapp-${id}` && health.version === version)) {
    throw new Error(`${id} reports ${health.service} ${health.version}`);
  }
  if (legacyResponse.status !== 308 || legacyResponse.headers.get("location") !== localizedPageUrl(legacyPath)) {
    throw new Error(`${id} did not redirect the legacy page to its Russian URL`);
  }
  const marker = `name="rollapp-application" content="${id}"`;
  if (!homeHtml.includes(marker) || !deepHtml.includes(marker) || account.user !== null) {
    throw new Error(`${id} served an unexpected app entry or anonymous session`);
  }
}

const pending = new Map(Object.entries(SPHERE_APPLICATIONS));
for (let attempt = 1; pending.size && attempt <= attempts; attempt++) {
  const checks = [...pending].map(async ([id, sphere]) => {
    try {
      await verify(id, sphere);
      pending.delete(id);
      console.log(`${sphere.host} serves rollapp-${id} at ${version}`);
    } catch (error) {
      console.log(`Attempt ${attempt} for ${id}: ${error.message}`);
    }
  });
  await Promise.all(checks);
  if (pending.size && attempt < attempts) await setTimeout(5_000);
}
if (pending.size) throw new Error(`Production sphere verification failed: ${[...pending.keys()].join(", ")}`);
