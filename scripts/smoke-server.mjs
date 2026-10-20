// Bind a fresh loopback port atomically; probing then releasing a fixed port
// races other worktrees. An explicit diagnostic port still fails if occupied.
export function smokePort(value) {
  if (value == null) return 0;
  if (!/^(?:0|[1-9]\d*)$/.test(String(value)) || Number(value) > 65535) throw new Error("Invalid smoke server port");
  return Number(value);
}

export function smokeOrigin(server) {
  const address = server.httpServer?.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1" || !Number.isInteger(address.port) || address.port < 1 || address.port > 65535) {
    throw new Error("Smoke server must be listening on IPv4 loopback");
  }
  return `http://127.0.0.1:${address.port}`;
}

export async function listenSmokeServer(server) {
  try {
    if (server.config.server.host !== "127.0.0.1" || !server.httpServer) throw new Error("Smoke server requires IPv4 loopback HTTP");
    if (server.config.server.port !== 0) return await server.listen();
    // Pinned Vite normalizes listen(0) to 5173. Its public Node HTTP server
    // retains Vite's initialization listener and supports a real atomic bind0.
    await new Promise((resolve, reject) => {
      const cleanup = () => { server.httpServer.off("error", failed);server.httpServer.off("listening", ready); };
      const failed = error => { cleanup();reject(error); };
      const ready = () => { cleanup();resolve(); };
      server.httpServer.once("error", failed);server.httpServer.once("listening", ready);
      server.httpServer.listen(0, "127.0.0.1");
    });
    return server;
  } catch (error) { await server.close();throw error; }
}
