import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function serviceLabel(directory) {
  return `rf.rollapp.development.${createHash("sha256").update(directory).digest("hex").slice(0, 12)}`;
}
const xml = (value) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);

export function launchAgentPlist({ directory, nodePath, executablePath, token, userDirectory = os.homedir() }) {
  const logPath = path.join(userDirectory, "Library/Logs/Rollapp", `${serviceLabel(directory)}.log`);
  // launchd itself cannot chdir into protected Desktop folders. Let Node open
  // the workspace, and keep launchd's own working directory and logs in Library.
  const bootstrap = `process.chdir(${JSON.stringify(directory)}); process.argv = [process.execPath, ${JSON.stringify(path.join(directory, "scripts/dev.mjs"))}, "--managed", ${JSON.stringify(token)}]; import(${JSON.stringify(pathToFileURL(path.join(directory, "scripts/dev.mjs")).href)});`;
  const args = [nodePath, "--input-type=module", "--eval", bootstrap];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(serviceLabel(directory))}</string>
  <key>ProgramArguments</key><array>${args.map((value) => `<string>${xml(value)}</string>`).join("")}</array>
  <key>WorkingDirectory</key><string>${xml(userDirectory)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${xml(executablePath)}</string>
    <key>NODE_ENV</key><string>development</string>
    <key>DEMO_MODE</key><string>false</string>
    <key>ROLLAPP_DEV_LOG_PATH</key><string>${xml(logPath)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ExitTimeOut</key><integer>20</integer>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(logPath)}</string>
</dict></plist>
`;
}

async function main() {
  if (process.platform !== "darwin") throw new Error("Постоянный сервис использует launchd и доступен только на macOS.");
  const command = process.argv[2];
  const label = serviceLabel(projectDirectory);
  const domain = `gui/${process.getuid()}`;
  const target = `${domain}/${label}`;
  const plistPath = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);
  const run = (args) => execFileSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const loaded = () => { try { run(["print", target]); return true; } catch { return false; } };

  if (command === "status") {
    console.log(loaded() ? `Автовосстановление включено: ${label}` : "Автовосстановление выключено.");
    execFileSync(process.execPath, [path.join(projectDirectory, "scripts/dev-service.mjs"), "status"], { cwd: projectDirectory, stdio: "inherit" });
    return;
  }
  if (command !== "enable" && command !== "disable") throw new Error("Использование: node scripts/dev-keepalive.mjs <enable|disable|status>");
  if (loaded()) run(["bootout", target]);
  // Reuse the ownership checks and graceful shutdown of the normal dev service.
  execFileSync(process.execPath, [path.join(projectDirectory, "scripts/dev-service.mjs"), "stop"], { cwd: projectDirectory, stdio: "inherit" });
  if (command === "disable") {
    fs.rmSync(plistPath, { force: true });
    console.log("Автовосстановление Rollapp отключено.");
    return;
  }
  const { productionConnectionMode } = await import("./production-dev-config.mjs");
  await import("./production-db-tunnel.mjs"); // Load the repository's environment.
  productionConnectionMode(process.env);
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(path.join(os.homedir(), "Library/Logs/Rollapp"), { recursive: true });
  const executablePath = [...new Set([path.dirname(process.execPath), ...process.env.PATH.split(path.delimiter)])]
    .filter((entry) => path.isAbsolute(entry) && !/[\r\n]/.test(entry) && fs.existsSync(entry)).join(path.delimiter);
  fs.writeFileSync(plistPath, launchAgentPlist({ directory: projectDirectory, nodePath: process.execPath, executablePath, token: randomBytes(16).toString("hex") }), { mode: 0o600 });
  execFileSync("/usr/bin/plutil", ["-lint", plistPath], { stdio: "inherit" });
  run(["bootstrap", domain, plistPath]);
  console.log(`Автовосстановление и запуск при входе включены: ${label}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
