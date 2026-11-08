import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createYandexAuthorization, readYandexAuthorization } from "./yandex-auth.js";
import { decryptUserCredential, encryptUserCredential } from "./user-credentials.js";
import {
  createYandexDiskClient, DiskNotesError, diskUnavailable, getYandexDiskConfig, NOTE_MAX_BYTES, reconnectError,
} from "./yandex-disk.js";

const API = "/api/private-notes";
const PAGE = "/app/private-notes";
const PURPOSE = "disk-notes";
const CALLBACK = `${API}/connection/callback`;
const COOKIE = "rw_disk_notes_oauth";
const folderPath = (id) => `app:/rollapp-notes-${id}`;
const filePath = (id, revision) => `${folderPath(id)}/${revision}.md`;
const etag = (row, markdown) =>
  `${row.revision || "empty"}:${createHash("sha256").update(row.folder_id).update("\0").update(markdown).digest("hex")}`;
const patchSchema = z.object({
  ownerId: z.string().min(1).max(128),
  revision: z.string().regex(/^(empty|[0-9]{17}-[0-9a-f-]{36}):[0-9a-f]{64}$/),
  markdown: z.string().refine((value) => value.isWellFormed() && Buffer.byteLength(value) <= NOTE_MAX_BYTES),
}).strict();
const tokenContext = (userId, clientId) => ({ userId, provider: `${PURPOSE}:${clientId}` });

function noteResponse(row, markdown) {
  return { markdown, revision: etag(row, markdown) };
}

async function connection(client, userId, clientId) {
  const result = await client.query(
    `SELECT folder_id,encrypted_tokens,revision FROM yandex_disk_notes
     WHERE user_id=$1 AND oauth_client_id=$2 FOR UPDATE`,
    [userId, clientId],
  );
  return result.rows[0];
}

async function currentMarkdown(disk, token, row) {
  if (row.revision) return disk.read(token, filePath(row.folder_id, row.revision));
  await disk.checkFolder(token, folderPath(row.folder_id));
  return "";
}

export async function writeDiskNote(disk, token, row, { revision, markdown }) {
  const current = await currentMarkdown(disk, token, row);
  // A response can be lost after commit. Retrying the same snapshot is safe.
  if (current === markdown) return { head: row.revision, note: noteResponse(row, current) };
  if (revision !== etag(row, current)) {
    throw new DiskNotesError(
      "DISK_NOTE_CONFLICT",
      "На Диске уже есть другая версия. Ваш черновик остался в редакторе.", 409,
    );
  }
  const timestamp = new Date().toISOString().replace(/\D/g, "");
  const head = `${timestamp}-${randomUUID()}`;
  await disk.write(token, filePath(row.folder_id, head), markdown);
  return { head, note: noteResponse({ ...row, revision: head }, markdown) };
}

export function registerYandexDiskNotesRoutes(app, { requireAuth, authRateLimit, query, transaction }) {
  const cookieOptions = {
    httpOnly: true, sameSite: "lax", path: CALLBACK,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  };

  function route(handler) {
    return async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      try { await handler(req, res, getYandexDiskConfig()); }
      catch (error) {
        if (error instanceof DiskNotesError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        // Provider URLs, credentials and note contents must stay out of logs.
        console.error("[disk-notes] Internal error", error?.code || error?.name || "unknown");
        return res.status(503).json({ error: diskUnavailable().message, code: "DISK_UNAVAILABLE" });
      }
    };
  }

  function requireConfig(config) {
    if (!config.enabled) throw new DiskNotesError("DISK_NOT_CONFIGURED", "Личные заметки пока недоступны.", 503);
  }

  function requireOwner(req, ownerId) {
    if (ownerId !== req.user.id) {
      throw new DiskNotesError("DISK_ACCOUNT_CHANGED", "Аккаунт изменился. Откройте заметки заново.", 403);
    }
  }

  // Serialize per account across instances. Commit a rotated refresh token even
  // if the subsequent file operation fails, but never advance a failed save.
  async function withConnection(userId, config, work) {
    requireConfig(config);
    const outcome = await transaction(async (client) => {
      await client.query("SET LOCAL lock_timeout = '3s'");
      const row = await connection(client, userId, config.clientId);
      if (!row) throw reconnectError();
      let tokens;
      try { tokens = JSON.parse(decryptUserCredential(row.encrypted_tokens, tokenContext(userId, config.clientId))); }
      catch { throw diskUnavailable(); }
      const disk = createYandexDiskClient(config);
      if (tokens.expiresAt <= Date.now() + 60_000) {
        tokens = await disk.refresh(tokens.refreshToken);
        await client.query("UPDATE yandex_disk_notes SET encrypted_tokens=$3 WHERE user_id=$1 AND oauth_client_id=$2",
          [userId, config.clientId, encryptUserCredential(JSON.stringify(tokens), tokenContext(userId, config.clientId))]);
      }
      try { return { value: await work(client, disk, tokens.accessToken, row) }; }
      catch (error) {
        if (!(error instanceof DiskNotesError)) throw error;
        return { error };
      }
    });
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }

  app.get(`${API}/connection`, requireAuth, route(async (req, res, config) => {
    if (!config.enabled) return res.json({ enabled: false, connected: false });
    const result = await query("SELECT 1 FROM yandex_disk_notes WHERE user_id=$1 AND oauth_client_id=$2", [req.user.id, config.clientId]);
    res.json({ enabled: true, connected: result.rowCount > 0 });
  }));

  app.post(`${API}/connection/start`, requireAuth, authRateLimit, route(async (req, res, config) => {
    requireConfig(config);
    requireOwner(req, req.body?.ownerId);
    const authorization = createYandexAuthorization(config, { nextPath: PAGE, linkUserId: req.user.id });
    await query("DELETE FROM yandex_oauth_attempts WHERE purpose=$1 AND expires_at<=CURRENT_TIMESTAMP", [PURPOSE]);
    await query(
      `INSERT INTO yandex_oauth_attempts (state_hash,code_verifier,next_path,purpose,user_id,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [authorization.attempt.stateHash, authorization.attempt.verifier, PAGE, PURPOSE, req.user.id, authorization.expiresAt],
    );
    res.cookie(COOKIE, authorization.state, { ...cookieOptions, expires: authorization.expiresAt });
    res.json({ authorizationUrl: authorization.authorizationUrl });
  }));

  app.get(CALLBACK, route(async (req, res, config) => {
    const finish = (status) => res.redirect(303, `${PAGE}?disk=${status}`);
    const cookieState = req.cookies[COOKIE];
    // A stale tab must not clear a more recent connection attempt.
    if (cookieState === req.query.state) res.clearCookie(COOKIE, cookieOptions);
    if (!req.user || !config.enabled) return finish("failed");
    let stateHash;
    try { stateHash = readYandexAuthorization(cookieState, req.query.state); }
    catch { return finish("failed"); }
    const attempt = await query(
      `DELETE FROM yandex_oauth_attempts
       WHERE state_hash=$1 AND purpose=$2 AND user_id=$3 AND expires_at>CURRENT_TIMESTAMP
       RETURNING code_verifier`,
      [stateHash, PURPOSE, req.user.id],
    );
    if (!attempt.rowCount) return finish("failed");
    if (req.query.error === "access_denied") return finish("cancelled");
    const code = req.query.code;
    if (typeof code !== "string" || code.length < 1 || code.length > 4096) return finish("failed");
    try {
      const tokens = await createYandexDiskClient(config).exchange(code, attempt.rows[0].code_verifier);
      const userId = req.user.id;
      await transaction(async (client) => {
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE", [userId]);
        const existing = await connection(client, userId, config.clientId);
        const disk = createYandexDiskClient(config);
        const folderId = existing?.folder_id || randomUUID();
        if (existing) await currentMarkdown(disk, tokens.accessToken, existing);
        else await disk.createFolder(tokens.accessToken, folderPath(folderId));
        await client.query(
          `INSERT INTO yandex_disk_notes (user_id,oauth_client_id,folder_id,encrypted_tokens) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id,oauth_client_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens`,
          [userId, config.clientId, folderId, encryptUserCredential(JSON.stringify(tokens), tokenContext(userId, config.clientId))],
        );
      });
      return finish("connected");
    } catch (error) {
      if (["DISK_WRONG_ACCOUNT", "DISK_NOTES_MISSING"].includes(error.code)) return finish("missing");
      console.error("[disk-notes] Connection failed", error?.code || error?.name || "unknown");
      return finish("failed");
    }
  }));

  app.get(API, requireAuth, route(async (req, res, config) => {
    requireOwner(req, req.query.ownerId);
    res.json(await withConnection(req.user.id, config, async (_client, disk, token, row) => (
      noteResponse(row, await currentMarkdown(disk, token, row))
    )));
  }));

  app.patch(API, requireAuth, route(async (req, res, config) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new DiskNotesError("DISK_NOTE_VALIDATION", "Не удалось сохранить заметки. Проверьте размер текста.", 400);
    }
    const { ownerId } = parsed.data;
    requireOwner(req, ownerId);
    const userId = req.user.id;
    res.json(await withConnection(userId, config, async (client, disk, token, row) => {
      const { head, note } = await writeDiskNote(disk, token, row, parsed.data);
      if (head !== row.revision) {
        await client.query("UPDATE yandex_disk_notes SET revision=$3 WHERE user_id=$1 AND oauth_client_id=$2",
          [userId, config.clientId, head]);
      }
      return note;
    }));
  }));
}
