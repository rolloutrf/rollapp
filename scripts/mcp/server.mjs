import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createRollappApi, mcpConfig } from "../../server/mcp-api.js";
import { readSession } from "./session.js";
import { createRollappMcp } from "../../server/mcp-tools.js";

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--write")) {
    throw new Error("Использование: node scripts/mcp/server.mjs [--write]");
  }
  const config = mcpConfig();
  const api = createRollappApi(config.origin, { session: await readSession(config) });
  serveStdio(() => createRollappMcp(api, { allowWrite: args[0] === "--write" }));
} catch (error) {
  console.error(`Rollapp MCP: ${error.message}`);
  process.exitCode = 1;
}
