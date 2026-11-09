import { constants } from "node:fs";
import { link, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { sessionTokenPattern } from "../../server/mcp-api.js";

export async function readSession({ origin, sessionPath }) {
  let file;
  try {
    file = await open(sessionPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) || stat.uid !== process.getuid()) {
      throw new Error("Файл сессии MCP должен принадлежать текущему пользователю и иметь права 0600.");
    }
    const contents = await file.readFile("utf8");
    let session;
    try {
      session = JSON.parse(contents);
    } catch {
      throw new Error("Файл сессии MCP повреждён.");
    }
    if (session?.origin !== origin || !sessionTokenPattern.test(session.token ?? "")) {
      throw new Error("Файл сессии MCP не подходит для этого адреса Rollapp.");
    }
    return session.token;
  } finally {
    await file.close();
  }
}

export async function saveSession({ origin, sessionPath }, token) {
  const directory = path.dirname(sessionPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(directory, ".mcp-session-"));
  try {
    const temporaryFile = path.join(staging, "session");
    await writeFile(temporaryFile, JSON.stringify({ origin, token }), { mode: 0o600 });
    await link(temporaryFile, sessionPath);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
