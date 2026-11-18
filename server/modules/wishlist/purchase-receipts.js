import { createHash } from "node:crypto";
import express from "express";
import { detectImageMimeType } from "../media-import/file-signatures.js";
import { readPurchaseForCare } from "../planning/purchase-history.js";
import { lockPlanningOwner } from "../planning/planning.js";
import { createRateLimit } from "../runtime/rate-limit.js";

const space = "purchase-receipts";
const receiptId = (purchaseId) => `purchase-receipt:${purchaseId}`;
const allowedTypes = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const receiptBody = express.raw({ type: [...Object.keys(allowedTypes), "application/octet-stream"], limit: "5mb" });
const uploadLimit = createRateLimit({ windowMs: 15 * 60_000, max: 20, key: (req) => req.user.id });
const missing = { status: 404, error: "Чек не найден" };
const conflict = { status: 409, error: "Чек уже изменился. Откройте карточку покупки заново." };

function detectReceipt(req) {
  const data = req.body;
  if (!Buffer.isBuffer(data) || !data.length || data.length > 5 * 1024 * 1024) return null;
  const declaredType = String(req.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const pdf = /^%PDF-\d+\.\d+/u.test(data.toString("ascii", 0, 12));
  const mimeType = pdf ? "application/pdf" : detectImageMimeType(data);
  if (!Object.hasOwn(allowedTypes, mimeType) || (declaredType !== "application/octet-stream" && mimeType !== declaredType)) return null;
  let filename;
  try { filename = decodeURIComponent(String(req.get("X-File-Name") || "").slice(0, 2048)); }
  catch { filename = ""; }
  const basename = filename.split(/[\\/]/u).at(-1).replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  const stem = Array.from(basename.replace(/\.[\p{L}\d]{1,6}$/u, "")).slice(0, 140).join("").trim() || "Чек";
  filename = `${stem}${allowedTypes[mimeType]}`;
  const version = createHash("sha256").update(filename).update("\0").update(data).digest("hex");
  return { filename, data, meta: { mimeType, size: data.length, version } };
}

async function readReceipt(q, userId, id, { bytes = false } = {}) {
  const { rows } = await q(`SELECT title AS filename, related_items->0 AS meta${bytes ? ", decode(description,'base64') AS data" : ""}
    FROM planning_tasks WHERE user_id=$1 AND space_id=$2 AND id=$3`, [userId, space, receiptId(id)]);
  return rows[0] ?? null;
}

export async function readReceiptMetadata(q, userId, id) {
  const stored = await readReceipt(q, userId, id);
  return stored && { filename: stored.filename, ...stored.meta };
}

export function registerPurchaseReceiptRoutes(app, { query, transaction, requireAuth, asyncRoute }) {
  const path = "/api/dashboard/purchase-history/:id/receipt";
  const respond = (res, result) => result.error ? res.status(result.status).json({ error: result.error }) : res.json(result);

  app.get(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const file = await readReceipt(query, req.user.id, req.params.id, { bytes: true });
    if (!file) return respond(res, missing);
    const filename = encodeURIComponent(file.filename).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16)}`);
    res.set("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "sandbox");
    return res.type(file.meta.mimeType).send(file.data);
  }));

  app.post(path, requireAuth, uploadLimit, receiptBody, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const file = detectReceipt(req);
    if (!file) return res.status(400).json({ error: "Выберите чек в PDF, JPG, PNG или WebP до 5 МБ" });
    const expected = req.get("X-Receipt-Version");
    const { id } = req.params;
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const q = (sql, args) => client.query(sql, args);
      await lockPlanningOwner(q, userId);
      const current = await readReceiptMetadata(q, userId, id);
      if (current?.version === file.meta.version) return { receipt: current };
      if (expected !== (current?.version || "none")) return conflict;
      const purchase = await readPurchaseForCare(q, userId, id, { preserve: true });
      if (!purchase) return { status: 404, error: "Покупка не найдена" };
      await q(`INSERT INTO planning_tasks (id,user_id,space_id,title,description,status,completed,archived,related_items)
        VALUES ($1,$2,$3,$4,$5,'done',true,true,$6)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,related_items=EXCLUDED.related_items
        WHERE planning_tasks.user_id=EXCLUDED.user_id AND planning_tasks.space_id=EXCLUDED.space_id`,
      [receiptId(id), userId, space, file.filename, file.data.toString("base64"), JSON.stringify([file.meta])]);
      return { receipt: { filename: file.filename, ...file.meta } };
    });
    return respond(res, result);
  }));

  app.delete(path, requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const expected = req.get("X-Receipt-Version");
    const { id } = req.params;
    const userId = req.user.id;
    const result = await transaction(async (client) => {
      const q = (sql, args) => client.query(sql, args);
      await lockPlanningOwner(q, userId);
      const current = await readReceiptMetadata(q, userId, id);
      if (!current) return await readPurchaseForCare(q, userId, id) ? { receipt: null } : missing;
      if (expected !== current.version) return conflict;
      await q("DELETE FROM planning_tasks WHERE id=$1 AND user_id=$2 AND space_id=$3", [receiptId(id), userId, space]);
      return { receipt: null };
    });
    return respond(res, result);
  }));
}
