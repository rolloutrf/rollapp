import { existsSync } from "node:fs";

// Shared by the extended, database-free UI checks on macOS and Linux.
export function browserLaunchOptions() {
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error("Install Chrome/Chromium or set CHROME_PATH to its executable.");
  return { executablePath, headless: true, args: [
    ...(process.platform === "darwin" ? ["--disable-crashpad-for-testing", "--disable-updater-scheduler"] : []),
    ...(process.env.CI ? ["--no-sandbox"] : []),
  ] };
}

// Keep each worktree's browser fixtures on its own loopback port range.
export function smokePort(base, env = process.env) {
  const offset = Number(env.ROLLAPP_SMOKE_PORT_OFFSET || 0);
  const port = base + offset;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('ROLLAPP_SMOKE_PORT_OFFSET must produce a valid TCP port (1–65535).');
  }
  return port;
}
