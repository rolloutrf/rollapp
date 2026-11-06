import { randomUUID } from "node:crypto";
import { mkdtemp, open, rmdir, statfs, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { writeAccountBackup } from "./account-backup.js";

const api = "https://cloud-api.yandex.net/v1/disk/";
const folder = "disk:/ROLLAPP";
const statusLifetime = 60 * 60 * 1000;
// This is temporary storage; keep the runtime from filling the filesystem
// even if a deployment has already reduced its free space.
const serverDiskReserve = 1024 ** 3;

class DiskError extends Error {
  constructor(status) {
    super(status);
    this.status = status;
  }
}

function diskFailure(response) {
  if (response.status === 401 || response.status === 403) return new DiskError("permission");
  if (response.status === 507) return new DiskError("space");
  return new DiskError("failed");
}

function uploaderUrl(href) {
  const url = new URL(href);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash
    || !/^uploader[a-z0-9-]*\.disk\.yandex\.net$/i.test(url.hostname)) {
    throw new DiskError("failed");
  }
  return url;
}

async function* readArchive(file, size) {
  for (let offset = 0; offset < size;) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size - offset));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    if (!bytesRead) throw new Error("Backup archive is incomplete");
    offset += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}

export async function uploadYandexBackup({
  accessToken, transaction, userId, fetchImpl = fetch, now = new Date(), minimumFreeBytes = serverDiskReserve,
}) {
  const signal = AbortSignal.timeout(8 * 60 * 1000);
  const diskRequest = (resource, parameters, method = "GET") => {
    const url = new URL(resource, api);
    url.search = new URLSearchParams(parameters);
    return fetchImpl(url, {
      method,
      headers: { Authorization: `OAuth ${accessToken}` },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
  };
  const getFolder = () => diskRequest("resources", { path: folder, fields: "type,share,public_key,public_url" });
  const requirePrivateFolder = async (metadata) => {
    if (!metadata.ok) throw diskFailure(metadata);
    const details = await metadata.json();
    // A public/shared folder would expose the private archive to other people.
    if (details.type !== "dir" || details.share || details.public_key || details.public_url) throw new DiskError("folder");
  };
  let metadata = await getFolder();
  if (metadata.status === 404) {
    await metadata.body?.cancel();
    const created = await diskRequest("resources", { path: folder }, "PUT");
    if (!created.ok && created.status !== 409) throw diskFailure(created);
    await created.body?.cancel();
    metadata = await getFolder();
  }
  await requirePrivateFolder(metadata);

  const createdAt = now.toISOString();
  const filename = `rollapp-${createdAt.replaceAll(":", "-")}-${randomUUID()}.json.gz`;
  const directory = await mkdtemp(join(tmpdir(), "rollapp-backup-"));
  const localPath = join(directory, "archive");
  let file;
  let untilSpaceCheck = 0;
  try {
    file = await open(localPath, "wx+", 0o600);
    // Keep the archive accessible only via this descriptor. Even SIGKILL
    // cannot leave a named file containing a user's private data behind.
    await unlink(localPath);
    await writeAccountBackup({
      transaction, userId, createdAt, signal,
      output: new Writable({
        write(chunk, _encoding, callback) {
          const write = async () => {
            untilSpaceCheck -= chunk.length;
            if (untilSpaceCheck <= 0) {
              const free = await statfs(directory);
              if (free.bavail * free.bsize < minimumFreeBytes) throw new DiskError("failed");
              untilSpaceCheck = 1024 ** 2;
            }
            await file.writeFile(chunk);
          };
          write().then(() => callback(), callback);
        },
      }),
    });
    const { size } = await file.stat();
    // Preparing a large archive can take time; check sharing again before sending it.
    await requirePrivateFolder(await getFolder());
    const link = await diskRequest("resources/upload", { path: `${folder}/${filename}`, overwrite: "false" });
    if (!link.ok) throw diskFailure(link);
    const { href, method } = await link.json();
    if (method !== "PUT") throw new DiskError("failed");
    const destination = uploaderUrl(href);
    const uploaded = await fetchImpl(destination, {
      method: "PUT",
      headers: { "Content-Type": "application/gzip", "Content-Length": String(size) },
      body: readArchive(file, size), duplex: "half", redirect: "error", signal,
    });
    await uploaded.body?.cancel();
    if (uploaded.status !== 201) throw diskFailure(uploaded);
    return filename;
  } finally {
    try {
      await file?.close();
    } finally {
      try { await unlink(localPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
      await rmdir(directory);
    }
  }
}

export function createYandexBackupJobs({ upload, log = console.error }) {
  const jobs = new Map();
  let pending = 0;
  // Only one backup may hold a snapshot at a time. The production pool
  // has two connections and ordinary app requests still need one.
  let previous = Promise.resolve();
  return {
    start({ userId, accessToken }) {
      const current = Date.now();
      for (const [id, job] of jobs) {
        if (job.expiresAt <= current) jobs.delete(id);
        else if (job.userId === userId && job.status === "pending") return { id };
      }
      if (pending >= 8) return { busy: true };
      if (jobs.size >= 256) jobs.delete(jobs.keys().find((id) => jobs.get(id).status !== "pending"));

      const id = randomUUID();
      const job = { userId, status: "pending", expiresAt: Infinity };
      jobs.set(id, job);
      pending += 1;
      const task = previous.then(() => upload({ userId, accessToken })).then(
        (filename) => { Object.assign(job, { status: "complete", filename }); },
        (error) => {
          job.status = error instanceof DiskError ? error.status : "failed";
          log(`[yandex-disk-backup] ${job.status}`);
        },
      ).finally(() => {
        pending -= 1;
        job.expiresAt = Date.now() + statusLifetime;
      });
      previous = task;
      return { id, task };
    },
    get(id, userId) {
      const job = jobs.get(id);
      if (!job || job.userId !== userId || job.expiresAt <= Date.now()) return null;
      return { status: job.status, ...(job.filename && { filename: job.filename }) };
    },
  };
}
