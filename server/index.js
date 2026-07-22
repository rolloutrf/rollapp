import "dotenv/config";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { initializeDatabase } from "./schema.js";
import { pool, query, transaction } from "./db.js";
import { fetchPublicHtml, MetadataFetchError } from "./metadata-fetch.js";
import { parseProductMetadata } from "./metadata.js";
import { createSessionToken, hashPassword, hashToken, slugify, verifyPassword } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = "rw_session";

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

function createRateLimit({ windowMs, max }) {
  const clients = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    if (clients.size > 10_000) {
      clients.clear();
      lastSweep = now;
    } else if (now - lastSweep >= windowMs) {
      for (const [key, value] of clients) {
        if (value.resetAt <= now) clients.delete(key);
      }
      lastSweep = now;
    }

    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count >= max) {
      res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Слишком много попыток. Попробуйте немного позже" });
    }

    current.count += 1;
    next();
  };
}

const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const metadataRateLimit = createRateLimit({ windowMs: 5 * 60 * 1000, max: 40 });
const metadataCache = new Map();
const metadataCacheTtlMs = 10 * 60 * 1000;
const metadataCacheLimit = 500;
const mutationLocks = new Map();

async function withMutationLock(key, callback) {
  const previous = mutationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  mutationLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (mutationLocks.get(key) === current) mutationLocks.delete(key);
  }
}

function cleanUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    bio: row.bio,
    birthday: row.birthday,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

function mapList(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    privacy: row.privacy,
    occasionDate: row.occasion_date,
    color: row.color,
    shareToken: row.share_token,
    wishCount: Number(row.wish_count || 0),
  };
}

function mapWish(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.image_url,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    priority: Number(row.priority),
    privacy: row.privacy,
    allowMultiple: row.allow_multiple,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    reservationCount: Number(row.reservation_count || 0),
    reservedByMe: Boolean(row.reserved_by_me),
    listIds: row.list_ids || [],
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function optionalAuth(req, _res, next) {
  const token = req.cookies[sessionCookie];
  if (!token) return next();
  const result = await query(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), new Date()],
  );
  req.user = result.rows[0] || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Сначала войдите в аккаунт" });
  next();
}

app.use("/api", asyncRoute(optionalAuth));

async function createSession(res, userId) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expiresAt]);
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction && process.env.COOKIE_SECURE !== "false",
    path: "/",
    expires: expiresAt,
  });
}

async function uniqueUsername(name) {
  const base = slugify(name);
  for (let index = 0; index < 20; index += 1) {
    const candidate = index ? `${base}-${index + 1}` : base;
    const found = await query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!found.rowCount) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

async function notify(userId, type, title, body = "", href = "") {
  await query(
    "INSERT INTO notifications (id,user_id,type,title,body,href) VALUES ($1,$2,$3,$4,$5,$6)",
    [randomUUID(), userId, type, title, body, href],
  );
}

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

app.get("/api/healthz", asyncRoute(async (_req, res) => {
  await query("SELECT 1 AS ok");
  res.json({ ok: true, service: "rollapp", version: process.env.APP_VERSION || "development" });
}));

app.post("/api/auth/register", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте имя, email и пароль — минимум 8 символов" });
  const { name, email, password } = parsed.data;
  const exists = await query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (exists.rowCount) return res.status(409).json({ error: "Аккаунт с таким email уже есть" });

  const userId = randomUUID();
  const username = await uniqueUsername(name);
  const passwordHash = await hashPassword(password);
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
      [userId, email, username, name, passwordHash],
    );
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,color,share_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, "Мои желания", "Всё, чему я буду рад", "public", "coral", randomBytes(10).toString("base64url")],
    );
    await client.query(
      "INSERT INTO notifications (id,user_id,type,title,body,href) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), userId, "welcome", "Добро пожаловать в Rollapp", "Добавьте первое желание или сохраните идею из каталога.", "/app/ideas"],
    );
  });
  await createSession(res, userId);
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  res.status(201).json({ user: cleanUser(result.rows[0]) });
}));

app.post("/api/auth/login", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректные email и пароль" });
  const result = await query("SELECT * FROM users WHERE email = $1", [parsed.data.email]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Неверные email или пароль" });
  }
  await createSession(res, user.id);
  res.json({ user: cleanUser(user) });
}));

app.post("/api/auth/demo", asyncRoute(async (_req, res) => {
  if (process.env.DEMO_MODE === "false") return res.status(404).json({ error: "Демо-вход отключён" });
  const result = await query("SELECT * FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (!result.rowCount) return res.status(404).json({ error: "Демо-профиль не найден" });
  await createSession(res, result.rows[0].id);
  res.json({ user: cleanUser(result.rows[0]) });
}));

app.post("/api/auth/logout", asyncRoute(async (req, res) => {
  const token = req.cookies[sessionCookie];
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  res.clearCookie(sessionCookie, { path: "/" });
  res.json({ ok: true });
}));

app.get("/api/me", asyncRoute(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const unread = await query(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL AND available_at<=$2 AND type NOT IN ('santa','santa-message')",
    [req.user.id, new Date()],
  );
  res.json({ user: cleanUser(req.user), unreadCount: Number(unread.rows[0].count) });
}));

app.patch("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,32}$/).optional(),
    bio: z.string().trim().max(300).optional(),
    birthday: z.string().date().nullable().optional(),
    avatarUrl: z.string().url().max(1000).or(z.literal("")).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось сохранить: проверьте формат полей" });
  const next = {
    name: parsed.data.name ?? req.user.name,
    username: parsed.data.username ?? req.user.username,
    bio: parsed.data.bio ?? req.user.bio,
    birthday: parsed.data.birthday === undefined ? req.user.birthday : parsed.data.birthday,
    avatarUrl: parsed.data.avatarUrl ?? req.user.avatar_url,
  };
  try {
    const result = await query(
      `UPDATE users SET name=$1,username=$2,bio=$3,birthday=$4,avatar_url=$5 WHERE id=$6 RETURNING *`,
      [next.name, next.username, next.bio, next.birthday, next.avatarUrl, req.user.id],
    );
    res.json({ user: cleanUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Такое имя профиля уже занято" });
    throw error;
  }
}));

async function getLists(userId) {
  const result = await query(
    `SELECT l.* FROM wishlists l WHERE l.user_id=$1 ORDER BY l.created_at`,
    [userId],
  );
  const lists = [];
  for (const row of result.rows) {
    const count = await query(
      `SELECT COUNT(*) AS count FROM wishlist_wishes ww
       JOIN wishes w ON w.id=ww.wish_id
       WHERE ww.wishlist_id=$1 AND w.status='active'`,
      [row.id],
    );
    lists.push(mapList({ ...row, wish_count: count.rows[0].count }));
  }
  return lists;
}

async function getWishes(userId, viewerId = null, includePrivate = false) {
  const params = [userId];
  const privacyClause = includePrivate ? "" : "AND w.privacy <> 'private'";
  const result = await query(
    `SELECT w.* FROM wishes w WHERE w.user_id=$1 ${privacyClause}
     ORDER BY w.status='active' DESC, w.sort_order ASC, w.created_at DESC`,
    params,
  );
  const wishes = result.rows.map(mapWish);
  for (const wish of wishes) {
    if (viewerId === userId) {
      wish.reservationCount = 0;
      wish.reservedByMe = false;
    } else {
      const reservations = await query("SELECT user_id FROM reservations WHERE wish_id=$1 AND status IN ('reserved','multiple')", [wish.id]);
      wish.reservationCount = reservations.rowCount;
      wish.reservedByMe = reservations.rows.some((row) => row.user_id === viewerId);
    }
    const links = await query("SELECT wishlist_id FROM wishlist_wishes WHERE wish_id=$1", [wish.id]);
    wish.listIds = links.rows.map((row) => row.wishlist_id);
  }
  return wishes;
}

async function canViewWish(wish, viewerId, shareToken = "", client = null) {
  const runQuery = client ? (...args) => client.query(...args) : query;
  if (wish.user_id === viewerId) return true;
  if (wish.privacy === "private") return false;

  const linkedLists = await runQuery(
    `SELECT l.privacy,l.share_token FROM wishlist_wishes ww
     JOIN wishlists l ON l.id=ww.wishlist_id WHERE ww.wish_id=$1`,
    [wish.id],
  );
  if (!linkedLists.rowCount) return true;
  if (linkedLists.rows.some((list) => list.privacy === "public")) return true;
  if (shareToken && linkedLists.rows.some((list) => list.privacy === "link" && list.share_token === shareToken)) return true;
  if (!linkedLists.rows.some((list) => list.privacy === "followers")) return false;

  const follows = await runQuery(
    "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
    [viewerId, wish.user_id],
  );
  return Boolean(follows.rowCount);
}

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const [lists, wishes, follows, birthdays, reservations] = await Promise.all([
    getLists(req.user.id),
    getWishes(req.user.id, req.user.id, true),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [req.user.id]),
    query(
      `SELECT u.id,u.username,u.name,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$1 AND u.birthday IS NOT NULL ORDER BY u.birthday LIMIT 4`,
      [req.user.id],
    ),
    query(
      `SELECT r.id,r.created_at,w.id AS wish_id,w.title,w.image_url,w.price,w.currency,
              w.status AS wish_status,w.privacy AS wish_privacy,
              u.name AS owner_name,u.username AS owner_username,
              f.follower_id AS follows_owner,l.privacy AS list_privacy
       FROM reservations r
       JOIN wishes w ON w.id=r.wish_id
       JOIN users u ON u.id=w.user_id
       LEFT JOIN follows f ON f.follower_id=$1 AND f.following_id=w.user_id
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE r.user_id=$1
         AND r.status IN ('reserved','multiple')
       ORDER BY r.created_at DESC`,
      [req.user.id],
    ),
  ]);
  const reservationGroups = new Map();
  for (const row of reservations.rows) {
    if (!reservationGroups.has(row.id)) reservationGroups.set(row.id, { row, listPrivacies: new Set() });
    if (row.list_privacy) reservationGroups.get(row.id).listPrivacies.add(row.list_privacy);
  }
  const visibleReservations = [...reservationGroups.values()]
    .filter(({ row, listPrivacies }) => (
      row.wish_status === "active"
      && row.wish_privacy !== "private"
      && Boolean(row.follows_owner)
      && (!listPrivacies.size || [...listPrivacies].some((privacy) => ["public", "followers", "link"].includes(privacy)))
    ))
    .slice(0, 6)
    .map(({ row }) => {
      const { wish_status: _wishStatus, wish_privacy: _wishPrivacy, follows_owner: _followsOwner, list_privacy: _listPrivacy, ...item } = row;
      return { ...item, price: item.price === null ? null : Number(item.price) };
    });
  res.json({
    lists,
    wishes,
    followingCount: Number(follows.rows[0].count),
    birthdays: birthdays.rows.map((row) => ({ ...cleanUser(row), email: undefined })),
    reservations: visibleReservations,
    games: [],
  });
}));

app.post("/api/lists", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(""),
    privacy: z.enum(["public", "followers", "link", "private"]).default("public"),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).default("coral"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название и настройки списка" });
  const id = randomUUID();
  const token = randomBytes(10).toString("base64url");
  const data = parsed.data;
  await query(
    `INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, req.user.id, data.title, data.description, data.privacy, data.occasionDate || null, data.color, token],
  );
  const result = await query("SELECT *,0 AS wish_count FROM wishlists WHERE id=$1", [id]);
  res.status(201).json({ list: mapList(result.rows[0]) });
}));

app.patch("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const patchSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    privacy: z.enum(["public", "followers", "link", "private"]).optional(),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).optional(),
  });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте настройки списка" });
  const data = parsed.data;
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };
    const current = owned.rows[0];
    await client.query(
      `UPDATE wishlists SET title=$1,description=$2,privacy=$3,occasion_date=$4,color=$5 WHERE id=$6`,
      [data.title ?? current.title, data.description ?? current.description, data.privacy ?? current.privacy, data.occasionDate === undefined ? current.occasion_date : data.occasionDate, data.color ?? current.color, current.id],
    );
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await query("SELECT * FROM wishlists WHERE id=$1", [outcome.id]);
  const count = await query(
    `SELECT COUNT(*) AS count FROM wishlist_wishes ww
     JOIN wishes w ON w.id=ww.wish_id
     WHERE ww.wishlist_id=$1 AND w.status='active'`,
    [outcome.id],
  );
  res.json({ list: mapList({ ...result.rows[0], wish_count: count.rows[0].count }) });
}));

app.delete("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id,privacy FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };

    const fallback = await client.query(
      `SELECT id FROM wishlists
       WHERE user_id=$1 AND id<>$2
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at
       LIMIT 1 FOR UPDATE`,
      [req.user.id, req.params.id],
    );
    if (!fallback.rowCount) return { status: 400, error: "Нельзя удалить единственный список" };

    const linked = await client.query("SELECT wish_id FROM wishlist_wishes WHERE wishlist_id=$1", [req.params.id]);
    let reassignedCount = 0;
    for (const row of linked.rows) {
      const other = await client.query(
        "SELECT 1 FROM wishlist_wishes WHERE wish_id=$1 AND wishlist_id<>$2 LIMIT 1",
        [row.wish_id, req.params.id],
      );
      if (other.rowCount) continue;
      await client.query(
        "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
        [fallback.rows[0].id, row.wish_id],
      );
      if (owned.rows[0].privacy !== "public") {
        await client.query("UPDATE wishes SET privacy='private' WHERE id=$1", [row.wish_id]);
      }
      reassignedCount += 1;
    }
    await client.query("DELETE FROM wishlists WHERE id=$1", [req.params.id]);
    return { status: 200, reassignedCount, fallbackListId: fallback.rows[0].id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, reassignedCount: outcome.reassignedCount, fallbackListId: outcome.fallbackListId });
}));

const localImageUrlSchema = z.string().max(2000).regex(/^\/(?!\/)[^\s\\]*$/);
const listIdsSchema = z.array(z.string()).refine(
  (listIds) => new Set(listIds).size === listIds.length,
  { message: "Список нельзя выбрать дважды" },
);

const wishSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  url: z.string().url().max(2000).or(z.literal("")).default(""),
  imageUrl: z.string().url().max(2000).or(localImageUrlSchema).or(z.literal("")).default(""),
  price: z.coerce.number().min(0).max(999999999).nullable().optional(),
  currency: z.enum(["RUB", "USD", "EUR", "KZT", "BYN"]).default("RUB"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  privacy: z.enum(["inherit", "private"]).default("inherit"),
  allowMultiple: z.boolean().default(false),
  listIds: listIdsSchema,
});

app.post("/api/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = wishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Добавьте название и проверьте данные желания" });
  const data = parsed.data;
  const ownedLists = await query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
  const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
  if (data.listIds.some((id) => !ownedIds.has(id))) return res.status(403).json({ error: "Список вам не принадлежит" });
  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,price,currency,priority,privacy,allow_multiple)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, req.user.id, data.title, data.description, data.url, data.imageUrl, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple],
    );
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, id]);
  });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: result.find((wish) => wish.id === id) });
}));

app.patch("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Желание не найдено" };
    const current = owned.rows[0];
    const currentLinks = await client.query("SELECT wishlist_id FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    const merged = {
      title: req.body.title ?? current.title,
      description: req.body.description ?? current.description,
      url: req.body.url ?? current.url,
      imageUrl: req.body.imageUrl ?? current.image_url,
      price: req.body.price === undefined ? current.price : req.body.price,
      currency: req.body.currency ?? current.currency,
      priority: req.body.priority ?? current.priority,
      privacy: req.body.privacy ?? current.privacy,
      allowMultiple: req.body.allowMultiple ?? current.allow_multiple,
      listIds: req.body.listIds ?? currentLinks.rows.map((row) => row.wishlist_id),
    };
    const parsed = wishSchema.safeParse(merged);
    if (!parsed.success) return { status: 400, error: "Проверьте данные желания" };
    const data = parsed.data;
    const ownedLists = await client.query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
    const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
    if (data.listIds.some((id) => !ownedIds.has(id))) {
      return { status: 403, error: "Список вам не принадлежит" };
    }
    await client.query(
      `UPDATE wishes SET title=$1,description=$2,url=$3,image_url=$4,price=$5,currency=$6,priority=$7,privacy=$8,allow_multiple=$9 WHERE id=$10`,
      [data.title, data.description, data.url, data.imageUrl, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, current.id],
    );
    const reservations = await client.query(
      "SELECT id FROM reservations WHERE wish_id=$1 ORDER BY created_at,id",
      [current.id],
    );
    if (data.allowMultiple) {
      await client.query("UPDATE reservations SET status='multiple' WHERE wish_id=$1", [current.id]);
    } else if (reservations.rowCount) {
      const [kept, ...duplicates] = reservations.rows;
      for (const duplicate of duplicates) {
        await client.query("DELETE FROM notifications WHERE reference_id=$1 AND type='reservation'", [duplicate.id]);
        await client.query("DELETE FROM reservations WHERE id=$1", [duplicate.id]);
      }
      await client.query("UPDATE reservations SET status='reserved' WHERE id=$1", [kept.id]);
    }
    await client.query("DELETE FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, current.id]);
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.json({ wish: result.find((wish) => wish.id === outcome.id) });
}));

app.post("/api/wishes/:id/fulfilled", requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    "UPDATE wishes SET status=CASE WHEN status='fulfilled' THEN 'active' ELSE 'fulfilled' END WHERE id=$1 AND user_id=$2 RETURNING status",
    [req.params.id, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ status: result.rows[0].status });
}));

app.delete("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const result = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { rowCount: 0, rows: [] };
    const reservations = await client.query(
      "SELECT id FROM reservations WHERE wish_id=$1",
      [req.params.id],
    );
    for (const reservation of reservations.rows) {
      await client.query("DELETE FROM notifications WHERE reference_id=$1 AND type='reservation'", [reservation.id]);
    }
    return client.query("DELETE FROM wishes WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  }));
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ ok: true });
}));

app.post("/api/wishes/:id/copy", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM wishes WHERE id=$1 AND status='active'", [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  const source = found.rows[0];
  if (source.user_id === req.user.id) return res.status(400).json({ error: "Это желание уже находится в вашем списке" });
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  if (!(await canViewWish(source, req.user.id, shareToken))) return res.status(404).json({ error: "Желание не найдено" });

  const requestedListId = typeof req.body?.listId === "string" ? req.body.listId : "";
  const target = requestedListId
    ? await query("SELECT id FROM wishlists WHERE id=$1 AND user_id=$2", [requestedListId, req.user.id])
    : await query(
      `SELECT id FROM wishlists WHERE user_id=$1
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at LIMIT 1`,
      [req.user.id],
    );
  if (!target.rowCount) return res.status(400).json({ error: "Сначала создайте список желаний" });

  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,price,currency,priority,privacy,allow_multiple)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'inherit',FALSE)`,
      [id, req.user.id, source.title, source.description, source.url, source.image_url, source.price, source.currency, source.priority],
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [target.rows[0].id, id]);
  });
  const wishes = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: wishes.find((wish) => wish.id === id) });
}));

app.post("/api/metadata", requireAuth, metadataRateLimit, asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Нужна корректная ссылка" });
  const cacheUrl = new URL(parsed.data.url);
  cacheUrl.hash = "";
  const cacheKey = cacheUrl.href;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
  if (cached) metadataCache.delete(cacheKey);

  try {
    const { html, url } = await fetchPublicHtml(cacheUrl);
    const value = parseProductMetadata(html, url);
    if (metadataCache.size >= metadataCacheLimit) metadataCache.delete(metadataCache.keys().next().value);
    metadataCache.set(cacheKey, { value, expiresAt: Date.now() + metadataCacheTtlMs });
    res.json(value);
  } catch (error) {
    if (error instanceof MetadataFetchError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

app.get("/api/profile/:username", asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const owner = found.rows[0];
  const isOwner = req.user?.id === owner.id;
  const follows = req.user ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, owner.id]) : { rowCount: 0 };
  const follower = Boolean(follows.rowCount);
  const allLists = await getLists(owner.id);
  const lists = allLists.filter((list) => isOwner || list.privacy === "public" || (list.privacy === "followers" && follower));
  const allowedIds = new Set(lists.map((list) => list.id));
  const wishes = (await getWishes(owner.id, req.user?.id, isOwner))
    .filter((wish) => isOwner || wish.status === "active")
    .filter((wish) => wish.listIds.length === 0 || wish.listIds.some((id) => allowedIds.has(id)))
    .map((wish) => isOwner ? wish : { ...wish, listIds: wish.listIds.filter((id) => allowedIds.has(id)) });
  const stats = await Promise.all([
    query("SELECT COUNT(*) AS count FROM follows WHERE following_id=$1", [owner.id]),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [owner.id]),
  ]);
  const visibleLists = isOwner ? lists : lists.map(({ shareToken: _shareToken, ...list }) => ({
    ...list,
    wishCount: wishes.filter((wish) => wish.status === "active" && wish.listIds.includes(list.id)).length,
  }));
  res.json({
    profile: { ...cleanUser(owner), email: undefined }, lists: visibleLists, wishes,
    isOwner, isFollowing: follower,
    followersCount: Number(stats[0].rows[0].count), followingCount: Number(stats[1].rows[0].count),
  });
}));

app.get("/api/shared/:token", asyncRoute(async (req, res) => {
  const found = await query(
    `SELECT l.*,u.username,u.name,u.bio,u.avatar_url,u.birthday FROM wishlists l JOIN users u ON u.id=l.user_id WHERE l.share_token=$1`,
    [req.params.token],
  );
  if (!found.rowCount) return res.status(404).json({ error: "Список не найден" });
  const row = found.rows[0];
  const isOwner = req.user?.id === row.user_id;
  let canView = isOwner || row.privacy === "public" || row.privacy === "link";
  if (!canView && row.privacy === "followers" && req.user) {
    const follows = await query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
      [req.user.id, row.user_id],
    );
    canView = Boolean(follows.rowCount);
  }
  if (!canView) return res.status(404).json({ error: "Список не найден" });
  const list = mapList({ ...row, wish_count: 0 });
  const follows = req.user && !isOwner
    ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, row.user_id])
    : { rowCount: 0 };
  const wishes = (await getWishes(row.user_id, req.user?.id, isOwner))
    .filter((wish) => wish.listIds.includes(row.id))
    .filter((wish) => isOwner || wish.status === "active")
    .map((wish) => ({ ...wish, listIds: isOwner ? wish.listIds : [row.id], shareToken: req.params.token }));
  res.json({ profile: { id: row.user_id, username: row.username, name: row.name, bio: row.bio, avatarUrl: row.avatar_url, birthday: row.birthday }, list, wishes, isOwner, isFollowing: Boolean(follows.rowCount) });
}));

app.post("/api/profile/:username/follow", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT id,name,username FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const target = found.rows[0];
  if (target.id === req.user.id) return res.status(400).json({ error: "На себя уже можно положиться" });
  const following = await withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    const existing = await client.query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
      [req.user.id, target.id],
    );
    if (existing.rowCount) {
      await client.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, target.id]);
      const reservations = await client.query(
        `SELECT r.id FROM reservations r
         JOIN wishes w ON w.id=r.wish_id
         WHERE r.user_id=$1 AND w.user_id=$2`,
        [req.user.id, target.id],
      );
      for (const reservation of reservations.rows) {
        await client.query("DELETE FROM notifications WHERE reference_id=$1 AND type='reservation'", [reservation.id]);
      }
      await client.query(
        `DELETE FROM reservations
         WHERE user_id=$1 AND wish_id IN (SELECT id FROM wishes WHERE user_id=$2)`,
        [req.user.id, target.id],
      );
      return false;
    }
    await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [req.user.id, target.id]);
    await client.query(
      "INSERT INTO notifications (id,user_id,type,title,body,href) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), target.id, "follow", `${req.user.name} подписался на вас`, "Теперь ваши открытые желания будут проще найти.", `/u/${req.user.username}`],
    );
    return true;
  }));
  res.json({ following });
}));

app.post("/api/wishes/:id/reserve", requireAuth, asyncRoute(async (req, res) => {
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  const note = z.string().trim().max(300).catch("").parse(req.body?.note || "");
  let outcome;
  try {
    outcome = await withMutationLock(`wish:${req.params.id}`, () => withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
      const found = await client.query("SELECT * FROM wishes WHERE id=$1 AND status='active' FOR UPDATE", [req.params.id]);
      if (!found.rowCount) return { status: 404, error: "Желание не найдено" };
      const wish = found.rows[0];
      if (wish.user_id === req.user.id) return { status: 400, error: "Своё желание бронировать не нужно" };
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      if (!(await canViewWish(wish, req.user.id, shareToken, client))) return { status: 404, error: "Желание не найдено" };

      const existing = await client.query("SELECT * FROM reservations WHERE wish_id=$1 AND user_id=$2", [wish.id, req.user.id]);
      if (existing.rowCount) {
        await client.query("DELETE FROM notifications WHERE reference_id=$1 AND type='reservation'", [existing.rows[0].id]);
        await client.query("DELETE FROM reservations WHERE id=$1", [existing.rows[0].id]);
        return { status: 200, reserved: false };
      }

      const following = await client.query(
        "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
        [req.user.id, wish.user_id],
      );
      if (!following.rowCount) return { status: 403, error: "Сначала подпишитесь на автора желания" };

      if (!wish.allow_multiple) {
        const occupied = await client.query("SELECT 1 FROM reservations WHERE wish_id=$1 AND status IN ('reserved','multiple')", [wish.id]);
        if (occupied.rowCount) return { status: 409, error: "Это желание уже забронировал кто-то другой" };
      }
      const reservationId = randomUUID();
      await client.query(
        "INSERT INTO reservations (id,wish_id,user_id,note,status) VALUES ($1,$2,$3,$4,$5)",
        [reservationId, wish.id, req.user.id, note, wish.allow_multiple ? "multiple" : "reserved"],
      );
      const availableAt = new Date(Date.now() + (2 + Math.random() * 4) * 60 * 60 * 1000);
      await client.query(
        "INSERT INTO notifications (id,user_id,type,title,body,href,available_at,reference_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [randomUUID(), wish.user_id, "reservation", "Одно из ваших желаний забронировали", "Какое именно и кто готовит подарок — останется секретом.", "/app/wishes", availableAt, reservationId],
      );
      return { status: 201, reserved: true };
    })));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Это желание уже забронировал кто-то другой" });
    throw error;
  }
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(outcome.status).json({ reserved: outcome.reserved });
}));

app.get("/api/people", asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 80);
  const pattern = `%${search.toLowerCase()}%`;
  const result = await query(
    `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
     FROM users u
     WHERE (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
       AND ($2::text IS NULL OR u.id<>$2)
     ORDER BY u.created_at DESC LIMIT 24`,
    [pattern, req.user?.id || null],
  );
  const people = [];
  for (const row of result.rows) {
    const following = req.user ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, row.id]) : { rowCount: 0 };
    const wishes = await query(
      `SELECT COUNT(DISTINCT w.id) AS count
       FROM wishes w
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE w.user_id=$1 AND w.status='active' AND w.privacy<>'private'
         AND (ww.wish_id IS NULL OR l.privacy='public' OR ($2::boolean AND l.privacy='followers'))`,
      [row.id, Boolean(following.rowCount)],
    );
    people.push({ id: row.id, username: row.username, name: row.name, bio: row.bio, avatarUrl: row.avatar_url, birthday: row.birthday, wishCount: Number(wishes.rows[0].count), isFollowing: Boolean(following.rowCount) });
  }
  people.sort((a, b) => b.wishCount - a.wishCount);
  res.json({ people });
}));

app.get("/api/ideas", asyncRoute(async (req, res) => {
  const category = String(req.query.category || "");
  const search = String(req.query.search || "").trim().toLowerCase();
  const result = await query(
    `SELECT * FROM ideas WHERE ($1='' OR category=$1) AND ($2='' OR LOWER(title) LIKE $3 OR LOWER(description) LIKE $3)
     ORDER BY category,title`,
    [category, search, `%${search}%`],
  );
  const categories = await query("SELECT category,COUNT(*) AS count FROM ideas GROUP BY category ORDER BY category");
  res.json({ ideas: result.rows.map((row) => ({ id: row.id, title: row.title, description: row.description, category: row.category, imageUrl: row.image_url, url: row.url, price: row.price === null ? null : Number(row.price), currency: row.currency, badge: row.badge })), categories: categories.rows.map((row) => ({ name: row.category, count: Number(row.count) })) });
}));

app.post("/api/ideas/:id/save", requireAuth, asyncRoute(async (req, res) => {
  const idea = await query("SELECT * FROM ideas WHERE id=$1", [req.params.id]);
  if (!idea.rowCount) return res.status(404).json({ error: "Идея не найдена" });
  const listId = z.string().parse(req.body?.listId);
  const list = await query("SELECT id FROM wishlists WHERE id=$1 AND user_id=$2", [listId, req.user.id]);
  if (!list.rowCount) return res.status(403).json({ error: "Выберите свой список" });
  const row = idea.rows[0];
  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,price,currency,priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,2)`,
      [id, req.user.id, row.title, row.description, row.url, row.image_url, row.price, row.currency],
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, id]);
  });
  res.status(201).json({ id });
}));

app.get("/api/notifications", requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    "SELECT * FROM notifications WHERE user_id=$1 AND available_at<=$2 AND type NOT IN ('santa','santa-message') ORDER BY created_at DESC LIMIT 40",
    [req.user.id, new Date()],
  );
  res.json({ notifications: result.rows.map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, href: row.href, readAt: row.read_at, createdAt: row.created_at })) });
}));

app.post("/api/notifications/read", requireAuth, asyncRoute(async (req, res) => {
  await query(
    "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND read_at IS NULL AND available_at<=$2 AND type NOT IN ('santa','santa-message')",
    [req.user.id, new Date()],
  );
  res.json({ ok: true });
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Маршрут API не найден" }));

if (isProduction) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath, { maxAge: "1y", immutable: true, index: false }));
  app.get("*splat", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Проверьте введённые данные" });
  res.status(500).json({ error: "Внутренняя ошибка. Мы уже разбираемся." });
});

await initializeDatabase();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Rollapp server listening on ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
