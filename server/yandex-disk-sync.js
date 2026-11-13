import { randomUUID } from "node:crypto";
import { verifyAccountBackupSchema } from "./account-backup.js";
import { uploadYandexBackup } from "./yandex-disk-backup.js";
import { authorizeYandexDisk, diskNotesFolder, readDiskNotes } from "./yandex-disk-connection.js";
import { DiskNotesError, getYandexDiskConfig } from "./yandex-disk.js";

const activeLease = "lease_until>CURRENT_TIMESTAMP";

export async function verifyYandexDiskSyncSchema(transaction) {
  return transaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY");
    const { rows: [schema] } = await client.query("SELECT to_regclass('yandex_disk_sync') IS NOT NULL AS ready");
    if (!schema.ready) return false;
    await client.query(`SELECT user_id,oauth_client_id,enabled,next_at,last_completed_at,last_error,lease_token,lease_until
      FROM yandex_disk_sync LIMIT 0`);
    await verifyAccountBackupSchema(client);
    return true;
  });
}

export async function enableDiskSync(client, userId, clientId, { reconnect = false } = {}) {
  await client.query(`
    INSERT INTO yandex_disk_sync (user_id,oauth_client_id) VALUES ($1,$2)
    ON CONFLICT (user_id,oauth_client_id) DO UPDATE SET enabled=true, next_at=CURRENT_TIMESTAMP, last_error=NULL
    WHERE NOT yandex_disk_sync.enabled OR ($3 AND yandex_disk_sync.last_error='reconnect')
  `, [userId, clientId, reconnect]);
}

export function registerYandexDiskSyncRoutes(app, { requireAuth, asyncRoute, query, transaction, available, wake }) {
  const path = "/api/me/disk-sync";
  async function state(userId, clientId) {
    const { rows: [row] } = await query(`
      SELECT n.user_id IS NOT NULL AS connected, n.revision IS NOT NULL AS has_notes,
        COALESCE(s.enabled,false) AS enabled, COALESCE(${activeLease},false) AS running, s.last_completed_at, s.last_error,
        COALESCE(s.enabled AND (${activeLease} OR
          (s.next_at<=CURRENT_TIMESTAMP AND s.last_error IS NULL)),false) AS pending
      FROM (SELECT $1::text AS user_id, $2::text AS oauth_client_id) owner
      LEFT JOIN yandex_disk_notes n USING (user_id,oauth_client_id)
      LEFT JOIN yandex_disk_sync s USING (user_id,oauth_client_id)
    `, [userId, clientId]);
    return { connected: row.connected, hasNotes: row.has_notes, enabled: row.enabled, pending: row.pending, running: row.running,
      lastCompletedAt: row.last_completed_at, error: row.last_error };
  }
  const route = (handler) => asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const config = getYandexDiskConfig();
    if (!available() || !config.enabled) return res.status(503).json({ error: "Синхронизация пока недоступна." });
    try { await handler(req, res, config.clientId); }
    catch (error) {
      if (error instanceof DiskNotesError) return res.status(error.status).json({ error: error.message, code: error.code });
      throw error;
    }
  });
  app.get(path, requireAuth, route(async (req, res, clientId) => {
    res.json(await state(req.user.id, clientId));
  }));
  app.post(path, requireAuth, route(async (req, res, clientId) => {
    const { action, ownerId } = req.body ?? {};
    const userId = req.user.id;
    if (ownerId !== userId) return res.status(403).json({ error: "Аккаунт изменился. Откройте настройки заново." });
    if (!["enable", "refresh", "disable"].includes(action)) return res.status(400).json({ error: "Неизвестное действие." });

    if (action === "enable") {
      await transaction(async (client) => {
        const connected = await client.query("SELECT 1 FROM yandex_disk_notes WHERE user_id=$1 AND oauth_client_id=$2 FOR KEY SHARE",
          [userId, clientId]);
        if (!connected.rowCount) throw new DiskNotesError("DISK_RECONNECT", "Подключите Яндекс Диск.", 409);
        await enableDiskSync(client, userId, clientId);
      });
    } else if (action === "disable") {
      const stopped = await query(`UPDATE yandex_disk_sync SET enabled=false, lease_token=NULL, lease_until=NULL
        WHERE user_id=$1 AND oauth_client_id=$2 AND (lease_until IS NULL OR NOT (${activeLease}))`, [userId, clientId]);
      if (!stopped.rowCount) return res.status(409).json({ error: "Дождитесь завершения текущего обновления копии." });
    } else {
      await query(`UPDATE yandex_disk_sync SET next_at=CURRENT_TIMESTAMP, last_error=NULL
        WHERE user_id=$1 AND oauth_client_id=$2 AND enabled AND last_error IS DISTINCT FROM 'reconnect'
          AND (lease_until IS NULL OR NOT (${activeLease}))`, [userId, clientId]);
    }
    const current = await state(userId, clientId);
    if (action !== "disable") wake();
    res.json(current);
  }));
}

async function claimSync(transaction, clientId, leaseToken) {
  return transaction(async (client) => {
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('rollapp-yandex-disk-sync',0)) AS acquired");
    if (!lock.acquired) return null;
    const { rows: [job] } = await client.query(`
      WITH due AS (
        SELECT user_id,oauth_client_id FROM yandex_disk_sync
        WHERE oauth_client_id=$1 AND enabled AND last_error IS DISTINCT FROM 'reconnect' AND next_at<=CURRENT_TIMESTAMP
          AND NOT EXISTS (SELECT 1 FROM yandex_disk_sync WHERE ${activeLease})
        ORDER BY next_at,user_id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE yandex_disk_sync s SET lease_token=$2, lease_until=CURRENT_TIMESTAMP+INTERVAL '12 minutes'
      FROM due WHERE (s.user_id,s.oauth_client_id)=(due.user_id,due.oauth_client_id)
      RETURNING s.user_id
    `, [clientId, leaseToken]);
    return job?.user_id;
  });
}

function failureStatus(error) {
  if (["DISK_RECONNECT", "DISK_WRONG_ACCOUNT"].includes(error.code) || error.status === "permission") return "reconnect";
  if (error.code === "DISK_FULL" || error.status === "space") return "space";
  if (error.status === "folder") return "folder";
  return "failed";
}

export function startYandexDiskSync({ query, transaction, track, log = console.error }) {
  const config = getYandexDiskConfig();
  let stopped = false;
  let running = false;
  const controller = new AbortController();
  async function run() {
    const leaseToken = randomUUID();
    const userId = await claimSync(transaction, config.clientId, leaseToken);
    if (!userId) return;
    let failure = null;
    try {
      const { disk, token, row } = await transaction((client) =>
        authorizeYandexDisk(client, userId, config, { minimumValidityMs: 10 * 60_000 }));
      const privateNotes = await readDiskNotes(disk, token, row);
      await uploadYandexBackup({ accessToken: token, transaction, userId, folder: diskNotesFolder(row.folder_id),
        latest: true, privateNotes, signal: controller.signal });
    } catch (error) {
      failure = failureStatus(error);
      log("[disk-sync] Archive update failed:", error.code || failure);
    }
    await query(`
      UPDATE yandex_disk_sync
      SET lease_token=NULL, lease_until=NULL, last_error=$4,
        last_completed_at=CASE WHEN $4::text IS NULL THEN CURRENT_TIMESTAMP ELSE last_completed_at END,
        next_at=CURRENT_TIMESTAMP+CASE WHEN $4::text IS NULL THEN INTERVAL '1 hour' ELSE INTERVAL '10 minutes' END
      WHERE user_id=$1 AND oauth_client_id=$2 AND lease_token=$3
    `, [userId, config.clientId, leaseToken, failure]);
  }
  function wake() {
    if (stopped || running) return;
    running = true;
    track(run().catch((error) => log("[disk-sync] Worker error:", error.code || error.name))
      .finally(() => { running = false; }));
  }
  const timer = setInterval(wake, 30_000);
  timer.unref();
  wake();
  return { wake, stop() { stopped = true; clearInterval(timer); controller.abort(); } };
}
