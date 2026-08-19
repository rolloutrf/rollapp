import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const children = new Set();
let stopping = false;

function start(command, args) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
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
    const response = await fetch("http://127.0.0.1:8080/api/healthz", {
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
const frontend = start(process.execPath, [fileURLToPath(viteBin), "--host", "0.0.0.0"]);

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
