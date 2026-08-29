import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProductionDatabaseEnvironment,
  readTunnelConfig,
  startTunnel,
  stopTunnel,
  tunnelStatus,
} from "./production-db-tunnel.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const devServicePath = path.join(scriptDirectory, "dev-service.mjs");

function runDevService(command, environment = process.env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [devServicePath, command], {
      cwd: path.resolve(scriptDirectory, ".."),
      env: environment,
      stdio: "inherit",
    });
    child.once("exit", (code) => resolve(code ?? 1));
    child.once("error", () => resolve(1));
  });
}

async function startProductionService() {
  const config = readTunnelConfig();
  const tunnel = await startTunnel();
  if (!tunnel.ready) throw new Error("SSH-туннель не стал готов за 20 секунд.");

  const stopCode = await runDevService("stop");
  if (stopCode !== 0) throw new Error("Не удалось остановить предыдущий dev-сервис.");

  const environment = createProductionDatabaseEnvironment(process.env, config);
  const startCode = await runDevService("start", environment);
  if (startCode !== 0) process.exitCode = startCode;
}

async function showStatus() {
  const tunnel = await tunnelStatus();
  console.log(`SSH-туннель: ${tunnel.ready ? "готов" : tunnel.running ? "переподключается" : "остановлен"} (${tunnel.detail}).`);
  const serviceCode = await runDevService("status");
  if (!tunnel.ready || serviceCode !== 0) process.exitCode = 1;
}

async function stopProductionService() {
  const serviceCode = await runDevService("stop");
  const tunnel = await stopTunnel();
  console.log(`SSH-туннель: ${tunnel.detail}.`);
  if (serviceCode !== 0) process.exitCode = serviceCode;
}

const command = process.argv[2] || "start";

try {
  if (command === "start") await startProductionService();
  else if (command === "status") await showStatus();
  else if (command === "stop") await stopProductionService();
  else {
    console.error("Использование: node scripts/dev-production.mjs <start|status|stop>");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`Ошибка production dev: ${error?.message || error}`);
  process.exitCode = 1;
}
