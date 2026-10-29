import { pathToFileURL } from "node:url";

export async function productionProfileKey(origin, fetchImpl = fetch) {
  const response = await fetchImpl(new URL("/api/people?scope=discover", origin), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Cannot read the production profile directory");
  const payload = await response.json();
  const username = payload.people?.find(person => typeof person.username === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(person.username))?.username;
  if (!username) throw new Error("No existing public profile is available for redirect verification");
  return username;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await productionProfileKey(process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
