import { mkdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createRollappApi, mcpConfig, mcpTokenPattern } from "../../server/mcp-api.js";
import { readSession, saveSession } from "./session.js";

async function readCredentials(origin) {
  if (!process.stdin.isTTY) throw new Error("Для входа запустите команду в интерактивном терминале.");
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (muted) done();
      else process.stderr.write(chunk, done);
    },
  });
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const cancel = new AbortController();
  terminal.once("SIGINT", () => cancel.abort());
  terminal.once("close", () => cancel.abort());
  try {
    process.stderr.write(`Вход в Rollapp (${origin})\n`);
    const email = (await terminal.question("Email: ", { signal: cancel.signal })).trim();
    process.stderr.write("Пароль: ");
    muted = true;
    const password = await terminal.question("", { signal: cancel.signal });
    return { email, password };
  } finally {
    terminal.close();
    if (muted) process.stderr.write("\n");
  }
}

async function changeSession(action, config) {
  const token = await readSession(config);
  if (action === "logout") {
    if (!token) return console.log("Сохранённой сессии MCP нет.");
    await createRollappApi(config.origin, { session: token }).call("/api/auth/logout", { method: "POST" });
    await unlink(config.sessionPath);
    return console.log("Сессия MCP завершена.");
  }
  if (token) throw new Error("Сессия MCP уже сохранена. Сначала выполните npm run mcp:auth -- logout.");
  const { email, password } = await readCredentials(config.origin);
  const session = await createRollappApi(config.origin).login(email, password);
  try {
    await saveSession(config, session.token);
  } catch (error) {
    try {
      await createRollappApi(config.origin, { session: session.token }).call("/api/auth/logout", { method: "POST" });
    } catch {
      throw new Error("Файл сессии сохранить не удалось. Rollapp также не подтвердил завершение новой сессии.");
    }
    throw error;
  }
  console.log(`MCP подключён к аккаунту @${session.username}.`);
}

async function main([action, ...args]) {
  const config = mcpConfig();
  if (action === "token" && (!args.length || (args.length === 1 && args[0] === "--write"))) {
    const scope = args.length ? "write" : "read";
    const api = createRollappApi(config.origin, { session: await readSession(config) });
    const { token } = await api.call("/api/mcp/tokens", { method: "POST", body: { scope } });
    if (mcpTokenPattern.exec(token)?.[1] !== scope) throw new Error("Rollapp не выдал токен с запрошенными правами.");
    return console.log(token);
  }
  if (action === "revoke" && !args.length) {
    const bearer = process.env.ROLLAPP_MCP_TOKEN;
    if (!mcpTokenPattern.test(bearer ?? "")) throw new Error("Задайте токен в ROLLAPP_MCP_TOKEN.");
    await createRollappApi(config.origin, { bearer }).call("/api/mcp/tokens/current", { method: "DELETE" });
    return console.log("Токен MCP отозван.");
  }
  if ((action !== "login" && action !== "logout") || args.length) {
    throw new Error("Использование: npm run mcp:auth -- login|logout|token [--write]|revoke");
  }
  const lock = `${config.sessionPath}.lock`;
  await mkdir(path.dirname(lock), { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error("Дождитесь завершения другой команды mcp:auth для этой сессии.");
  }
  try {
    await changeSession(action, config);
  } finally {
    await rmdir(lock);
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.name === "AbortError" ? "Вход отменён." : error.message);
  process.exitCode = 1;
});
