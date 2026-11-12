import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { externalWishlistLinks } from "../shared/external-wishlists.js";
import { mergeProfileWishlistLinks } from "./profile-wishlists.js";
import { authorizeYandexDisk, diskNotesFolder } from "./yandex-disk-connection.js";
import { DiskNotesError, getYandexDiskConfig, reconnectError } from "./yandex-disk.js";

const maxBytes = 32_768;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const headPattern = new RegExp(`^(${uuid}):(${uuid}):([0-9a-f]{64})$`);
const checksum = (text) => createHash("sha256").update(text).digest("hex");
const profilePath = (folderId, revision) => `${diskNotesFolder(folderId)}/profile-${revision}.json`;

const profileRecord = z.object({
  format: z.literal("rollapp-profile"),
  version: z.literal(1),
  ownerId: z.string(),
  profile: z.object({
    username: z.string(),
    name: z.string(),
    bio: z.string(),
    birthday: z.string().nullable(),
    avatar_url: z.string(),
    wishlist_links: z.record(z.string(), z.string()),
  }).strict(),
}).strict();

export const profileDiskEnabled = (env = process.env) => env.ROLLAPP_YANDEX_DISK_PROFILE_ENABLED === "true";
const profileUnavailable = () => new DiskNotesError("DISK_PROFILE_UNAVAILABLE", "Не удалось прочитать профиль с Яндекс Диска.", 503);
const missingProfile = () => new DiskNotesError("DISK_PROFILE_MISSING", "Файл профиля не найден. Восстановите его на Яндекс Диске.", 409);
export const profileDiskConflict = () => new DiskNotesError("DISK_PROFILE_CONFLICT", "Профиль изменился в другой сессии. Попробуйте сохранить ещё раз.", 409);
const projectionConflict = () => new DiskNotesError("DISK_PROFILE_PROJECTION_CONFLICT", "Версии профиля на Диске и в Rollapp разошлись. Обновление приостановлено.", 409);

function profileBirthday(value) {
  if (!(value instanceof Date)) return value ?? null;
  return [String(value.getFullYear()).padStart(4, "0"), String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")].join("-");
}

export function editableProfile(row) {
  return {
    username: row.username,
    name: row.name,
    bio: row.bio || "",
    birthday: profileBirthday(row.birthday),
    avatar_url: row.avatar_url || "",
    wishlist_links: externalWishlistLinks(row.wishlist_links),
  };
}

export function patchEditableProfile(profile, patch) {
  return {
    username: patch.username ?? profile.username,
    name: patch.name ?? profile.name,
    bio: patch.bio ?? profile.bio,
    birthday: patch.birthday === undefined ? profile.birthday : patch.birthday,
    avatar_url: patch.avatarUrl ?? profile.avatar_url,
    wishlist_links: patch.wishlistLinks ? mergeProfileWishlistLinks(profile.wishlist_links, patch.wishlistLinks) : profile.wishlist_links,
  };
}

export async function readDiskProfile({ disk, token, row }, ownerId, head) {
  const parts = headPattern.exec(head);
  if (!parts || parts[1] !== row.folder_id) throw profileUnavailable();
  const [, folderId, revision, hash] = parts;
  const text = await disk.read(token, profilePath(folderId, revision), { maxBytes, missing: missingProfile });
  if (checksum(text) !== hash) throw profileUnavailable();
  let record;
  try { record = profileRecord.parse(JSON.parse(text)); }
  catch { throw profileUnavailable(); }
  if (record.ownerId !== ownerId) throw profileUnavailable();
  return record.profile;
}

export async function writeDiskProfile({ disk, token, row }, ownerId, profile) {
  const text = JSON.stringify(profileRecord.parse({ format: "rollapp-profile", version: 1, ownerId, profile }));
  if (Buffer.byteLength(text) > maxBytes) throw profileUnavailable();
  const revision = randomUUID();
  await disk.write(token, profilePath(row.folder_id, revision), text, { contentType: "application/json; charset=utf-8", maxBytes });
  return `${row.folder_id}:${revision}:${checksum(text)}`;
}

export function createDiskProfileStorage({ query, transaction, updateProfile, authorize = authorizeYandexDisk, environment = process.env }) {
  const selectProfile = (db, ownerId, lock = false) => db.query(
    `SELECT * FROM users WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [ownerId],
  );
  const open = (ownerId) => {
    const config = getYandexDiskConfig(environment);
    if (!config.enabled) throw reconnectError();
    return transaction(client => authorize(client, ownerId, config)).catch(error => {
      if (error.code === "55P03") throw profileUnavailable();
      throw error;
    });
  };
  async function readCurrent(connection, user) {
    const profile = await readDiskProfile(connection, user.id, user.disk_profile_head);
    if (JSON.stringify(profile) !== JSON.stringify(editableProfile(user))) throw projectionConflict();
    return profile;
  }

  return {
    async state(user) {
      const config = getYandexDiskConfig(environment);
      const enabled = profileDiskEnabled(environment) && config.enabled;
      const connected = config.enabled && (enabled || user.disk_profile_head) && Boolean((await query(
        "SELECT 1 FROM yandex_disk_notes WHERE user_id=$1 AND oauth_client_id=$2", [user.id, config.clientId],
      )).rowCount);
      return { enabled, connected: Boolean(connected), active: Boolean(user.disk_profile_head) };
    },
    async read(user) {
      if (!user.disk_profile_head) return user;
      const profile = await readCurrent(await open(user.id), user);
      return { ...user, ...profile };
    },
    async save(user, patch, { activate = false } = {}) {
      const ownerId = user.id;
      if (activate && !profileDiskEnabled(environment)) throw profileUnavailable();
      if (!user.disk_profile_head && !activate) return updateProfile(ownerId, patch);
      const { rows: [previous] } = await selectProfile({ query }, ownerId);
      if (!previous) throw profileUnavailable();
      if (!previous.disk_profile_head && !activate) return updateProfile(ownerId, patch);
      const connection = await open(ownerId);
      const head = previous.disk_profile_head;
      const before = head ? await readCurrent(connection, previous) : editableProfile(previous);
      const next = patchEditableProfile(before, patch);
      if (head && JSON.stringify(next) === JSON.stringify(before)) return { ...previous, ...before };
      const nextHead = await writeDiskProfile(connection, ownerId, next);
      return updateProfile(ownerId, patch, async (client) => {
        const { rows: [current] } = await selectProfile(client, ownerId, true);
        if (!current || current.disk_profile_head !== head ||
          JSON.stringify(editableProfile(current)) !== JSON.stringify(before)) throw profileDiskConflict();
        return { previous: current, next, nextHead };
      });
    },
  };
}
