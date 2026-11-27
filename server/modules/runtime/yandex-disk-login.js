import { randomUUID } from "node:crypto";
import { encryptUserCredential } from "../auth/user-credentials.js";
import {
  diskNotesFolder,
  diskTokenContext,
  lockYandexDiskConnection,
} from "./yandex-disk-connection.js";
import { createYandexDiskClient, diskUnavailable } from "./yandex-disk.js";
import { enableDiskSync } from "./yandex-disk-sync.js";

function validToken(value) {
  return typeof value === "string" && /^[\x21-\x7e]{1,8192}$/.test(value);
}

function validateTokens(tokens) {
  if (!validToken(tokens?.accessToken) || !validToken(tokens?.refreshToken)
    || !Number.isSafeInteger(tokens?.expiresAt) || tokens.expiresAt <= Date.now()) {
    throw diskUnavailable();
  }
  return tokens;
}

export async function connectYandexDiskOnLogin(client, {
  userId,
  config,
  tokens,
  environment = process.env,
  disk = createYandexDiskClient(config),
} = {}) {
  if (!config?.enabled || !config.autoConnect || !userId) throw diskUnavailable();
  validateTokens(tokens);

  await client.query("SET LOCAL lock_timeout = '3s'");
  const owner = await client.query("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE", [userId]);
  if (owner.rowCount !== 1) throw diskUnavailable();

  const existing = await lockYandexDiskConnection(client, userId, config.clientId);
  const folderId = existing?.folder_id || randomUUID();
  if (existing) await disk.checkFolder(tokens.accessToken, diskNotesFolder(folderId));
  else await disk.createFolder(tokens.accessToken, diskNotesFolder(folderId));

  const encryptedTokens = encryptUserCredential(
    JSON.stringify(tokens),
    { ...diskTokenContext(userId, config.clientId), env: environment },
  );
  await client.query(
    `INSERT INTO yandex_disk_notes (user_id,oauth_client_id,folder_id,encrypted_tokens) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id,oauth_client_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens`,
    [userId, config.clientId, folderId, encryptedTokens],
  );
  await enableDiskSync(client, userId, config.clientId, { reconnect: true });
  return { folderId, created: !existing };
}
