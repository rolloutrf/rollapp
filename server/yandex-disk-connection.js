import { decryptUserCredential, encryptUserCredential } from "./user-credentials.js";
import { createYandexDiskClient, diskUnavailable, reconnectError } from "./yandex-disk.js";

export const diskNotesFolder = (id) => `app:/rollapp-notes-${id}`;
export const diskTokenContext = (userId, clientId) => ({ userId, provider: `disk-notes:${clientId}` });

export async function lockYandexDiskConnection(client, userId, clientId) {
  const result = await client.query(
    `SELECT folder_id,encrypted_tokens,revision FROM yandex_disk_notes
     WHERE user_id=$1 AND oauth_client_id=$2 FOR UPDATE`,
    [userId, clientId],
  );
  return result.rows[0];
}

export async function authorizeYandexDisk(client, userId, config) {
  await client.query("SET LOCAL lock_timeout = '3s'");
  const row = await lockYandexDiskConnection(client, userId, config.clientId);
  if (!row) throw reconnectError();
  const context = diskTokenContext(userId, config.clientId);
  let tokens;
  try { tokens = JSON.parse(decryptUserCredential(row.encrypted_tokens, context)); }
  catch { throw diskUnavailable(); }
  const disk = createYandexDiskClient(config);
  if (tokens.expiresAt <= Date.now() + 60_000) {
    tokens = await disk.refresh(tokens.refreshToken);
    await client.query("UPDATE yandex_disk_notes SET encrypted_tokens=$3 WHERE user_id=$1 AND oauth_client_id=$2",
      [userId, config.clientId, encryptUserCredential(JSON.stringify(tokens), context)]);
  }
  return { disk, token: tokens.accessToken, row };
}
