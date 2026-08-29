import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const projectDirectory = path.resolve(scriptDirectory, "..");
const pidFilePath = path.join(projectDirectory, ".rollapp-db-tunnel.pid");
const logFilePath = path.join(projectDirectory, ".rollapp-db-tunnel.log");

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function requiredValue(environment, name) {
  const value = String(environment[name] || "").trim();
  if (!value) throw new Error(`Укажите ${name} в .env.`);
  return value;
}

function portValue(value, name, fallback) {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > 65_535) {
    throw new Error(`${name} должен быть портом от 1 до 65535.`);
  }
  return candidate;
}

function databaseTarget(environment) {
  const connectionString = String(environment.DATABASE_URL || "").trim();
  if (connectionString) {
    let connectionUrl;
    try {
      connectionUrl = new URL(connectionString);
    } catch {
      throw new Error("DATABASE_URL должен быть корректным PostgreSQL URL.");
    }
    if (connectionUrl.protocol !== "postgres:" && connectionUrl.protocol !== "postgresql:") {
      throw new Error("DATABASE_URL должен использовать протокол postgres или postgresql.");
    }
    return {
      connectionString,
      host: connectionUrl.hostname,
      port: portValue(connectionUrl.port, "Порт PostgreSQL", 5432),
    };
  }

  return {
    connectionString: "",
    host: requiredValue(environment, "PGHOST"),
    port: portValue(environment.PGPORT, "PGPORT", 5432),
  };
}

export function readTunnelConfig(environment = process.env) {
  const database = databaseTarget(environment);
  return {
    database,
    localPort: portValue(environment.ROLLAPP_TUNNEL_LOCAL_PORT, "ROLLAPP_TUNNEL_LOCAL_PORT", 15432),
    sshHost: requiredValue(environment, "ROLLAPP_TUNNEL_SSH_HOST"),
    sshKeyPath: String(environment.ROLLAPP_TUNNEL_SSH_KEY || "").trim(),
    sshUser: requiredValue(environment, "ROLLAPP_TUNNEL_SSH_USER"),
  };
}

export function createProductionDatabaseEnvironment(environment, config = readTunnelConfig(environment)) {
  const updated = {
    ...environment,
    DEMO_MODE: "false",
    PGHOST: "127.0.0.1",
    PGPORT: String(config.localPort),
    PGSSL_SERVERNAME: config.database.host,
  };

  if (config.database.connectionString) {
    const connectionUrl = new URL(config.database.connectionString);
    connectionUrl.hostname = "127.0.0.1";
    connectionUrl.port = String(config.localPort);
    updated.DATABASE_URL = connectionUrl.toString();
  }

  return updated;
}

export function buildSshArguments(config) {
  const identityArguments = config.sshKeyPath ? ["-i", config.sshKeyPath] : [];
  return [
    "-N",
    ...identityArguments,
    "-o", "IPQoS=none",
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ConnectTimeout=12",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "-L", `127.0.0.1:${config.localPort}:${config.database.host}:${config.database.port}`,
    "-l", config.sshUser,
    config.sshHost,
  ];
}

function readPidRecord() {
  try {
    const value = JSON.parse(fs.readFileSync(pidFilePath, "utf8"));
    const valid = value?.version === 1
      && Number.isSafeInteger(value.pid)
      && value.pid > 1
      && typeof value.token === "string"
      && /^[a-f0-9]{32}$/.test(value.token)
      && value.cwd === projectDirectory
      && value.script === scriptPath;
    return valid ? { kind: "valid", value } : { kind: "invalid" };
  } catch (error) {
    return error.code === "ENOENT" ? { kind: "missing" } : { kind: "invalid" };
  }
}

function removePidFile() {
  try {
    fs.unlinkSync(pidFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function processMatches(record) {
  try {
    const command = execFileSync(
      "ps",
      ["-ww", "-p", String(record.pid), "-o", "command="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return command.includes(scriptPath) && command.includes("supervise") && command.includes(record.token);
  } catch {
    return false;
  }
}

async function isTunnelListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const complete = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => complete(true));
    socket.once("error", () => complete(false));
    socket.setTimeout(750, () => complete(false));
  });
}

async function waitForTunnel(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isTunnelListening(port)) return true;
    await wait(250);
  }
  return false;
}

function writeLog(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function waitForChildExit(child) {
  return new Promise((resolve) => {
    let resolved = false;
    const complete = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };
    child.once("exit", (code, signal) => complete({ code, signal }));
    child.once("error", (error) => complete({ code: null, signal: null, error }));
  });
}

async function supervise(token) {
  const config = readTunnelConfig();
  let stopping = false;
  let sshChild;
  let retryTimer;
  let retryResolver;

  const stop = () => {
    stopping = true;
    if (sshChild && !sshChild.killed) sshChild.kill("SIGTERM");
    if (retryTimer) clearTimeout(retryTimer);
    retryResolver?.();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    let attempt = 0;
    while (!stopping) {
      writeLog(`Подключение SSH-туннеля к ${config.database.host}:${config.database.port}.`);
      sshChild = spawn("ssh", buildSshArguments(config), { stdio: "inherit" });
      const result = await waitForChildExit(sshChild);
      sshChild = undefined;
      if (stopping) break;

      attempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
      writeLog(`SSH-туннель остановлен (${result.error?.message || result.signal || result.code || "unknown"}); повтор через ${Math.round(delay / 1_000)} с.`);
      await new Promise((resolve) => {
        retryResolver = resolve;
        retryTimer = setTimeout(resolve, delay);
      });
      retryTimer = undefined;
      retryResolver = undefined;
    }
  } finally {
    const current = readPidRecord();
    if (current.kind === "valid" && current.value.pid === process.pid && current.value.token === token) {
      removePidFile();
    }
  }
}

export async function tunnelStatus() {
  const current = readPidRecord();
  if (current.kind !== "valid") {
    return { running: false, ready: false, detail: current.kind === "missing" ? "контроллер не запущен" : "PID-файл повреждён" };
  }
  if (!isProcessAlive(current.value.pid) || !processMatches(current.value)) {
    removePidFile();
    return { running: false, ready: false, detail: "stale PID-файл удалён" };
  }
  const config = readTunnelConfig();
  const ready = await isTunnelListening(config.localPort);
  return { running: true, ready, detail: ready ? `127.0.0.1:${config.localPort}` : "переподключение" };
}

export async function startTunnel() {
  const config = readTunnelConfig();
  const current = readPidRecord();
  if (current.kind === "valid" && isProcessAlive(current.value.pid) && processMatches(current.value)) {
    const ready = await waitForTunnel(config.localPort, 20_000);
    return { started: false, ready, config };
  }
  if (current.kind === "valid" || current.kind === "invalid") removePidFile();
  if (await isTunnelListening(config.localPort)) {
    throw new Error(`Порт 127.0.0.1:${config.localPort} уже занят другим процессом. Остановите старый туннель перед запуском контроллера.`);
  }

  const token = randomBytes(16).toString("hex");
  const logDescriptor = fs.openSync(logFilePath, "a", 0o600);
  let child;
  try {
    child = spawn(process.execPath, [scriptPath, "supervise", token], {
      argv0: `rollapp-db-tunnel:${token}`,
      cwd: projectDirectory,
      detached: true,
      env: process.env,
      stdio: ["ignore", logDescriptor, logDescriptor],
    });
    if (!child.pid) throw new Error("Не удалось запустить контроллер SSH-туннеля.");
    const record = {
      version: 1,
      pid: child.pid,
      token,
      startedAt: new Date().toISOString(),
      cwd: projectDirectory,
      script: scriptPath,
    };
    fs.writeFileSync(pidFilePath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    child.unref();
  } catch (error) {
    if (child?.pid) child.kill("SIGTERM");
    removePidFile();
    throw error;
  } finally {
    fs.closeSync(logDescriptor);
  }

  const ready = await waitForTunnel(config.localPort, 20_000);
  return { started: true, ready, config };
}

export async function stopTunnel() {
  const current = readPidRecord();
  if (current.kind === "missing") return { stopped: false, detail: "контроллер уже остановлен" };
  if (current.kind !== "valid" || !isProcessAlive(current.value.pid) || !processMatches(current.value)) {
    removePidFile();
    return { stopped: false, detail: "stale PID-файл удалён" };
  }
  process.kill(current.value.pid, "SIGTERM");
  const deadline = Date.now() + 10_000;
  while (isProcessAlive(current.value.pid) && Date.now() < deadline) await wait(100);
  if (isProcessAlive(current.value.pid)) throw new Error("Контроллер SSH-туннеля не завершился за 10 секунд.");
  removePidFile();
  return { stopped: true, detail: "контроллер остановлен" };
}

async function main() {
  const command = process.argv[2];
  if (command === "supervise") {
    await supervise(process.argv[3]);
    return;
  }
  if (command === "start") {
    const result = await startTunnel();
    console.log(result.ready
      ? `SSH-туннель готов: 127.0.0.1:${result.config.localPort}.`
      : "Контроллер туннеля запущен, но подключение пока не готово. Проверьте npm run db:tunnel:status.");
    if (!result.ready) process.exitCode = 1;
    return;
  }
  if (command === "status") {
    const result = await tunnelStatus();
    console.log(`SSH-туннель: ${result.ready ? "готов" : result.running ? "переподключается" : "остановлен"} (${result.detail}).`);
    if (!result.ready) process.exitCode = 1;
    return;
  }
  if (command === "stop") {
    const result = await stopTunnel();
    console.log(`SSH-туннель: ${result.detail}.`);
    return;
  }
  console.error("Использование: node scripts/production-db-tunnel.mjs <start|status|stop>");
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Ошибка SSH-туннеля: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
