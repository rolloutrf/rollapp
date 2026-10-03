import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createProductionDatabaseEnvironment, startTunnel } from "./production-db-tunnel.mjs";
import { developmentFrontendPort, productionConnectionMode } from "./production-dev-config.mjs";

const managedToken = process.argv[2] === "--managed" ? process.argv[3] : "";
if (managedToken) {
  if (!/^[a-f0-9]{32}$/.test(managedToken)) throw new Error("Invalid service token");
  const pidPath = new URL("../.dev-server.pid", import.meta.url);
  if (fs.existsSync(pidPath)) {
    const current = JSON.parse(fs.readFileSync(pidPath, "utf8"));
    if (!Number.isSafeInteger(current.pid) || current.pid <= 1) throw new Error("Invalid existing dev service PID");
    try {
      process.kill(current.pid, 0);
      throw new Error("Rollapp dev service is already running");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      fs.unlinkSync(pidPath);
    }
  }
  fs.writeFileSync(pidPath, JSON.stringify({ version: 1, pid: process.pid, token: managedToken, cwd: process.cwd(), script: fileURLToPath(import.meta.url), logPath: process.env.ROLLAPP_DEV_LOG_PATH, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  process.once("exit", () => {
    try {
      if (JSON.parse(fs.readFileSync(pidPath, "utf8")).pid === process.pid) fs.unlinkSync(pidPath);
    } catch { /* The file may have been removed during an explicit stop. */ }
  });
}

process.env.NODE_ENV ||= "development";
process.env.DEMO_MODE = "false";
if (productionConnectionMode(process.env) === "tunnel") {
  const tunnel = await startTunnel();
  if (!tunnel.ready) throw new Error("Production PostgreSQL недоступен через SSH-туннель.");
  Object.assign(process.env, createProductionDatabaseEnvironment(process.env, tunnel.config));
}
const backendUrl = `http://127.0.0.1:${process.env.PORT || 8080}/api/healthz`;

const children = new Set();
let stopping = false;
let healthTimer;

function start(command, args) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  clearInterval(healthTimer);
  for (const child of children) child.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

// Keep the API process stable. Node's watch mode can exhaust the per-process file
// descriptor limit on macOS and leave Vite running against a dead backend.
const backend = start(process.execPath, ["server/start.js"]);
let backendExitCode;
backend.once("exit", (code) => { backendExitCode = code ?? 1; });

const deadline = Date.now() + 60_000;
let backendReady = false;
while (Date.now() < deadline && backendExitCode === undefined) {
  try {
    const response = await fetch(backendUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    if (response.ok) {
      backendReady = true;
      break;
    }
  } catch {
    // The backend may need a few seconds to load credentials and initialize the database.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (backendExitCode !== undefined) {
  console.error(`Backend exited before it became ready (code ${backendExitCode}).`);
  process.exit(backendExitCode);
}

if (!backendReady) {
  console.error("Backend did not become ready within 60 seconds. Frontend was not started.");
  stop();
  process.exit(1);
}

console.log("Backend is ready; starting the frontend.");
const viteBin = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
const frontend = start(process.execPath, [fileURLToPath(viteBin), "--host", "0.0.0.0", "--port", String(developmentFrontendPort(process.env))]);

// The health endpoint executes SELECT 1 on the configured production database.
// launchd restarts this process if the API cannot recover after a network change.
let checkingHealth = false;
let failedHealthChecks = 0;
healthTimer = setInterval(async () => {
  if (checkingHealth || stopping) return;
  checkingHealth = true;
  try {
    const response = await fetch(backendUrl, { signal: AbortSignal.timeout(12_000) });
    failedHealthChecks = response.ok ? 0 : failedHealthChecks + 1;
  } catch { failedHealthChecks += 1; }
  finally { checkingHealth = false; }
  if (failedHealthChecks >= 3) {
    console.error("Production database healthcheck failed three times; restarting the development service.");
    process.exitCode = 1;
    stop();
  }
}, 30_000);

frontend.once("exit", (code) => {
  stop();
  process.exitCode = code ?? 1;
});
backend.once("exit", (code) => {
  if (!stopping) {
    console.error(`Backend stopped (code ${code ?? 1}); stopping the frontend to avoid a disconnected UI.`);
    stop();
    process.exitCode = code ?? 1;
  }
});
