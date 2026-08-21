import "dotenv/config";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const devScriptPath = path.join(scriptDirectory, "dev.mjs");
const pidFilePath = path.join(projectDirectory, ".dev-server.pid");
const logFilePath = path.join(projectDirectory, ".dev-server.log");
const backendUrl = process.env.ROLLAPP_DEV_BACKEND_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api/healthz`;
const frontendUrl = process.env.ROLLAPP_DEV_FRONTEND_URL || "http://127.0.0.1:5173/login";
const configuredStartTimeout = Number(process.env.ROLLAPP_DEV_START_TIMEOUT_MS || 75_000);
const startTimeoutMs = Number.isFinite(configuredStartTimeout)
  ? Math.min(Math.max(configuredStartTimeout, 1_000), 300_000)
  : 75_000;
const pollIntervalMs = 400;

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function removePidFile() {
  try {
    fs.unlinkSync(pidFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function readPidRecord() {
  let raw;
  try {
    raw = fs.readFileSync(pidFilePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing" };
    throw error;
  }

  try {
    const value = JSON.parse(raw);
    const valid = value?.version === 1
      && Number.isSafeInteger(value.pid)
      && value.pid > 1
      && typeof value.token === "string"
      && /^[a-f0-9]{32}$/.test(value.token)
      && value.cwd === projectDirectory
      && value.script === devScriptPath;
    return valid ? { kind: "valid", value } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
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

function processOwnsPidFile(pid) {
  const procFdDirectory = `/proc/${pid}/fd`;
  if (fs.existsSync(procFdDirectory)) {
    try {
      const expected = fs.statSync(pidFilePath);
      return fs.readdirSync(procFdDirectory).some((entry) => {
        try {
          const actual = fs.statSync(path.join(procFdDirectory, entry));
          return actual.dev === expected.dev && actual.ino === expected.ino;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  try {
    const output = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-Fn", "--", pidFilePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.split("\n").some((line) => line === `n${pidFilePath}`);
  } catch {
    return false;
  }
}

function processCommandMatches(record) {
  try {
    const command = execFileSync(
      "ps",
      ["-ww", "-p", String(record.pid), "-o", "command="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return command.includes(devScriptPath) && command.includes(record.token);
  } catch {
    return false;
  }
}

function inspectOwnedProcess(record) {
  if (!isProcessAlive(record.pid)) return { alive: false, owned: false };
  const owned = processOwnsPidFile(record.pid) || processCommandMatches(record);
  return { alive: true, owned };
}

function pidFileOwners() {
  try {
    const output = execFileSync(
      "lsof",
      ["-t", "--", pidFilePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.split(/\s+/).map(Number).filter(Number.isSafeInteger);
  } catch {
    return [];
  }
}

function cleanInvalidPidFile() {
  const owners = pidFileOwners();
  if (owners.length) {
    throw new Error(`PID-файл открыт процессом ${owners.join(", ")}, но его содержимое повреждено; автоматическая остановка небезопасна.`);
  }
  removePidFile();
}

async function probeBackend() {
  try {
    const response = await fetch(backendUrl, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    const value = await response.json();
    if (value?.ok !== true || value?.service !== "rollapp") {
      return { ok: false, detail: "неожиданный ответ healthcheck" };
    }
    return { ok: true, detail: "готов" };
  } catch (error) {
    return { ok: false, detail: error?.message || "нет ответа" };
  }
}

async function probeFrontend() {
  try {
    const response = await fetch(frontendUrl, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    const html = await response.text();
    if (!/<div\s+id=["']root["']/.test(html)) {
      return { ok: false, detail: "ответ не похож на Rollapp/Vite" };
    }
    return { ok: true, detail: "готов" };
  } catch (error) {
    return { ok: false, detail: error?.message || "нет ответа" };
  }
}

async function serviceHealth() {
  const [backend, frontend] = await Promise.all([probeBackend(), probeFrontend()]);
  return { backend, frontend, ready: backend.ok && frontend.ok };
}

function healthSummary(health) {
  return `API: ${health.backend.detail}; frontend: ${health.frontend.detail}`;
}

function logTail() {
  try {
    const stat = fs.statSync(logFilePath);
    const length = Math.min(stat.size, 16 * 1024);
    if (!length) return "";
    const descriptor = fs.openSync(logFilePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(descriptor, buffer, 0, length, stat.size - length);
      return buffer.toString("utf8").trim().split("\n").slice(-24).join("\n");
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return "";
  }
}

function reportStartFailure(message, health) {
  console.error(message);
  if (health) console.error(healthSummary(health));
  console.error(`Лог: ${logFilePath}`);
  const tail = logTail();
  if (tail) console.error(`\nПоследние строки лога:\n${tail}`);
  process.exitCode = 1;
}

async function waitUntilReady(record, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let health = {
    backend: { ok: false, detail: "ожидание запуска" },
    frontend: { ok: false, detail: "ожидание запуска" },
    ready: false,
  };
  while (Date.now() < deadline) {
    if (!isProcessAlive(record.pid)) return { ready: false, exited: true, health };
    health = await serviceHealth();
    if (health.ready) {
      return isProcessAlive(record.pid)
        ? { ready: true, exited: false, health }
        : { ready: false, exited: true, health };
    }
    await wait(pollIntervalMs);
  }
  return { ready: false, exited: !isProcessAlive(record.pid), health };
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid) && Date.now() < deadline) await wait(100);
  return !isProcessAlive(pid);
}

async function startService() {
  const current = readPidRecord();
  if (current.kind === "invalid") cleanInvalidPidFile();
  if (current.kind === "valid") {
    const inspection = inspectOwnedProcess(current.value);
    if (!inspection.alive) {
      removePidFile();
    } else if (!inspection.owned) {
      removePidFile();
      throw new Error(`PID ${current.value.pid} уже принадлежит другому процессу; stale PID-файл удалён без отправки сигнала.`);
    } else {
      const result = await waitUntilReady(current.value, startTimeoutMs);
      if (result.ready) {
        console.log(`Rollapp dev service уже запущен (PID ${current.value.pid}).`);
        console.log(`Frontend: ${frontendUrl}`);
        return;
      }
      reportStartFailure(`Rollapp dev service (PID ${current.value.pid}) запущен, но не стал готов за ${startTimeoutMs} мс.`, result.health);
      return;
    }
  }

  const token = randomBytes(16).toString("hex");
  let pidDescriptor;
  let logDescriptor;
  try {
    pidDescriptor = fs.openSync(pidFilePath, "wx+", 0o600);
    logDescriptor = fs.openSync(logFilePath, "a", 0o600);
    fs.writeSync(logDescriptor, `\n[${new Date().toISOString()}] Starting Rollapp dev service\n`);
    const child = spawn(process.execPath, [devScriptPath], {
      argv0: `rollapp-dev:${token}`,
      cwd: projectDirectory,
      detached: true,
      env: process.env,
      stdio: ["ignore", logDescriptor, logDescriptor, pidDescriptor],
    });
    if (!child.pid) throw new Error("Не удалось получить PID фонового процесса.");

    const record = {
      version: 1,
      pid: child.pid,
      token,
      startedAt: new Date().toISOString(),
      cwd: projectDirectory,
      script: devScriptPath,
    };
    fs.ftruncateSync(pidDescriptor, 0);
    fs.writeSync(pidDescriptor, `${JSON.stringify(record, null, 2)}\n`, 0, "utf8");
    fs.fsyncSync(pidDescriptor);
    child.unref();
    fs.closeSync(pidDescriptor);
    pidDescriptor = undefined;
    fs.closeSync(logDescriptor);
    logDescriptor = undefined;

    const result = await waitUntilReady(record, startTimeoutMs);
    if (result.ready) {
      console.log(`Rollapp dev service запущен (PID ${record.pid}).`);
      console.log(`Frontend: ${frontendUrl}`);
      console.log(`Лог: ${logFilePath}`);
      return;
    }

    let stopped = result.exited;
    if (!result.exited && inspectOwnedProcess(record).owned) {
      process.kill(record.pid, "SIGTERM");
      stopped = await waitForProcessExit(record.pid, 10_000);
    }
    if (stopped) removePidFile();
    reportStartFailure(
      result.exited
        ? `Rollapp dev service завершился до готовности.`
        : stopped
          ? `Rollapp dev service не стал готов за ${startTimeoutMs} мс и был остановлен.`
          : `Rollapp dev service не стал готов за ${startTimeoutMs} мс и не завершился после SIGTERM; PID-файл сохранён.`,
      result.health,
    );
  } catch (error) {
    if (pidDescriptor !== undefined) fs.closeSync(pidDescriptor);
    if (logDescriptor !== undefined) fs.closeSync(logDescriptor);
    removePidFile();
    throw error;
  }
}

async function statusService() {
  const current = readPidRecord();
  if (current.kind === "missing") {
    console.log("Rollapp dev service остановлен: PID-файл отсутствует.");
    process.exitCode = 1;
    return;
  }
  if (current.kind === "invalid") {
    cleanInvalidPidFile();
    console.log("Rollapp dev service остановлен: повреждённый stale PID-файл удалён.");
    process.exitCode = 1;
    return;
  }

  const inspection = inspectOwnedProcess(current.value);
  if (!inspection.alive) {
    removePidFile();
    console.log(`Rollapp dev service остановлен: stale PID ${current.value.pid} удалён.`);
    process.exitCode = 1;
    return;
  }
  if (!inspection.owned) {
    removePidFile();
    console.error(`PID ${current.value.pid} принадлежит другому процессу; stale PID-файл удалён без отправки сигнала.`);
    process.exitCode = 1;
    return;
  }

  const health = await serviceHealth();
  console.log(`Rollapp dev service: ${health.ready ? "готов" : "не готов"} (PID ${current.value.pid}).`);
  console.log(healthSummary(health));
  console.log(`Frontend: ${frontendUrl}`);
  console.log(`Лог: ${logFilePath}`);
  if (!health.ready) process.exitCode = 1;
}

async function stopService() {
  const current = readPidRecord();
  if (current.kind === "missing") {
    console.log("Rollapp dev service уже остановлен.");
    return;
  }
  if (current.kind === "invalid") {
    cleanInvalidPidFile();
    console.log("Повреждённый stale PID-файл удалён; сигнал процессам не отправлялся.");
    return;
  }

  const inspection = inspectOwnedProcess(current.value);
  if (!inspection.alive) {
    removePidFile();
    console.log(`Stale PID ${current.value.pid} удалён; сервис уже остановлен.`);
    return;
  }
  if (!inspection.owned) {
    removePidFile();
    throw new Error(`PID ${current.value.pid} принадлежит другому процессу; stale PID-файл удалён без отправки сигнала.`);
  }

  process.kill(current.value.pid, "SIGTERM");
  if (!(await waitForProcessExit(current.value.pid, 10_000))) {
    throw new Error(`Процесс ${current.value.pid} не завершился за 10 секунд; PID-файл сохранён для безопасного повтора.`);
  }
  removePidFile();
  console.log(`Rollapp dev service остановлен (PID ${current.value.pid}).`);
}

const command = process.argv[2];

try {
  if (command === "start") await startService();
  else if (command === "status") await statusService();
  else if (command === "stop") await stopService();
  else {
    console.error("Использование: node scripts/dev-service.mjs <start|status|stop>");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`Ошибка dev service: ${error?.message || error}`);
  process.exitCode = 1;
}
