import { listOpenPurchasePlans } from "../planning/planning.js";
import { purchasePriceWatchView } from "./purchase-price-watch.js";
import { purchaseProductId } from "../../../shared/modules/planning/purchase-plan.js";
import { listSubscriptions } from "./purchase-subscriptions.js";
import { listPurchaseCollaborations } from "./purchase-collaboration.js";

import { registerWishPurchasePlanRoutes } from "./wish-purchase-plan-routes.js";
import { updateOwnedWishStatus } from "./wish-status.js";
import { registerProductSuggestionRoutes } from "../../product-suggestions.js";
import { registerWishlistBusinessRoutes } from "./wishlist-business.js";
import { publicMood } from "../profile/profile-mood.js";
import { EXTERNAL_WISHLIST_PROVIDERS, externalWishlistLinks } from "../../../shared/modules/profile/external-wishlists.js";
import { marketplaceWishlistKey, parseBrowserWishlist } from "../../browser-wishlist-import.js";
import { externalWishlistReaders, insertExternalWishlistItems, WishlistImportError } from "../../external-wishlist-import.js";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../../db.js";
import { grantWishReward } from "../loyalty/roll-rewards.js";
import { registerWishGroupFundraisingRoutes } from "../../wish-group-fundraising.js";
import { formatMemberNumber } from "../auth/invites.js";
import { deleteOwnedWishGroup, moveOwnedWishGroup, removeWishFromOwnedGroup, syncWishGroupMemberships } from "./wish-groups.js";
import { externalCatalogItemFromRow } from "../catalog-marketplace/external-catalog.js";
import { applyWishParticipantChanges, validateWishParticipantChanges } from "../../wish-participants.js";
import { maxWishParticipants } from "../../../shared/modules/wishlist/wish-participants.js";
import { getOhMyWishesRecommendationsPage } from "../catalog-marketplace/ohmywishes-brands.js";
import { getStoredCatalogBrands, getStoredCatalogBrandPage } from "../catalog-marketplace/external-catalog-brands.js";
import { canonicalCatalogUrl, catalogActionKey, catalogIdentityKey, externalCatalogReference, groupCatalogRows, preservedCatalogRow } from "../catalog-marketplace/wish-catalog.js";
import { registerWishHistoryImport } from "../history/wish-history-import.js";
import { buildFulfilledWishSuggestions } from "../assistant/fulfilled-wish-suggestions.js";
import { VehicleCatalogUnavailableError, vehicleCatalog } from "../catalog-marketplace/vehicle-catalog.js";
import { fetchPublicHtml, fetchPublicJson, MetadataFetchError } from "../media-import/metadata-fetch.js";
import { resolveRetailerMetadata } from "../media-import/retailer-metadata.js";
import { OpenRouterOffersError } from "../assistant/openrouter-marketplace-offers.js";
import { hasLiveMarketplaceOffer } from "../assistant/marketplace-resolvers.js";
import { userCredentialsConfigured } from "../auth/user-credentials.js";
import { hasAiCredential, sharedAiConfigured } from "../../ai-provider.js";
import { findWishMarketplaceOffers } from "../assistant/wish-marketplace-search.js";
import { YandexAiError } from "../assistant/yandex-ai.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { canonicalRetailerProductUrl } from "../../../shared/modules/media-import/retailer-previews.js";
import { bookmateApiUrl, isBookmateUrl, isKinopoiskUrl, isVkVideoUrl, isYandexMapsUrl, isYouTubeUrl, kinopoiskContentUrlError, parseBookmateMetadata, parseKinopoiskMetadata, parseProductMetadata, parseYandexMapsMetadata, parseYouTubeMetadata, parseYouTubeVideoId, youtubeThumbnailUrl } from "../media-import/metadata.js";

function projectOpenPurchasePlans(openPlans, wishes) {
  const ownedWishes = new Map(wishes.map((wish) => [wish.id, wish]));
  return openPlans.flatMap(({ priceWatch, ...plan }) => {
    if (plan.need) return [plan];
    const wish = ownedWishes.get(purchaseProductId(plan));
    if (!wish || (!plan.replenishment && wish.status !== "active")) return [];
    return [{ ...plan, title: wish.title, ...(priceWatch && { priceWatch: purchasePriceWatchView(priceWatch, wish.url) }) }];
  });
}

export function registerWishlistRoutes(app, {
  asyncRoute, backfillWishPreviews, canViewWish, cleanUser, decorateCatalogItems, formatEventDate, getLists, getSharedWishes, getVisibleWishGroups, getWishes, listSpaceValues, mapList, metadataRateLimit, moodColumns, openRouterCredentialRow, requireAuth, resolveCatalogActionItem, resolveOpenRouterApiKey, resolveVkVideoMetadata, runWishGroupTransaction, withMutationLock,
}) {
  const localImageUrlSchema = z.string().max(2000).regex(/^\/(?!\/)[^\s\\]*$/);

  const listSpaceSchema = z.enum(listSpaceValues);

  const catalogQuerySchema = z.object({
    source: z.enum(["community", "brands", "ohmywishes"]).default("community").transform((source) => source === "brands" ? "ohmywishes" : source),
    brand: z.string().trim().min(1).max(100).optional(),
    sections: z.literal("certificates").optional(),
    space: listSpaceSchema.default("products"),
    limit: z.coerce.number().int().min(1).max(96).default(48),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  }).strict();

  const catalogItemIdSchema = z.string().trim().min(1).max(2_000);

  const catalogLikeSchema = z.object({
    itemId: catalogItemIdSchema,
    liked: z.boolean(),
  }).strict();

  const catalogAddSchema = z.object({
    itemId: catalogItemIdSchema,
  }).strict();

  const previewBackfillRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 6 });

  const wishlistImportRateLimit = createRateLimit({ windowMs: 60 * 1000, max: 6, key: (req) => req.user.id });

  const marketplaceOffersRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    key: (req) => `marketplace:${req.user?.id || req.ip}:${req.params.id}`,
    message: "Для этого товара поиск запускался слишком часто",
    code: "marketplace_offers_rate_limited",
  });

  const metadataCache = new Map();

  const metadataCacheTtlMs = 10 * 60 * 1000;

  const metadataCacheLimit = 500;

  const previewBackfillJobs = new Map();

  const previewBackfillCooldownMs = 15 * 60 * 1000;

  function deduplicatedPreviewBackfill(userId) {
    const now = Date.now();
    const current = previewBackfillJobs.get(userId);
    if (current?.expiresAt > now) return current.promise;

    if (previewBackfillJobs.size >= 10_000) {
      for (const [key, entry] of previewBackfillJobs) {
        if (entry.expiresAt <= now) previewBackfillJobs.delete(key);
      }
    }

    const promise = backfillWishPreviews(userId);
    const entry = { promise, expiresAt: now + previewBackfillCooldownMs };
    previewBackfillJobs.set(userId, entry);
    void promise.catch(() => {
      if (previewBackfillJobs.get(userId) === entry) previewBackfillJobs.delete(userId);
    });
    return promise;
  }

  function mapWishMediaNote(row) {
    return {
      summary: row?.summary || "",
      keyIdeas: row?.key_ideas || "",
      quotes: row?.quotes || "",
      applications: row?.applications || "",
      updatedAt: row?.updated_at || null,
    };
  }

  registerWishGroupFundraisingRoutes(app, { requireAuth, query, transaction, canViewWish });

  registerWishlistBusinessRoutes(app, { requireAuth, query, transaction });

  registerProductSuggestionRoutes(app, { requireAuth });

  app.post("/api/me/wishlist-import/:provider", requireAuth, wishlistImportRateLimit, asyncRoute(async (req, res) => {
    const provider = EXTERNAL_WISHLIST_PROVIDERS.find(({ id }) => id === req.params.provider);
    const read = externalWishlistReaders.get(provider?.id);
    if (!read) return res.status(404).json({ error: "Импорт из этого сервиса пока недоступен." });
    const url = externalWishlistLinks(req.user.wishlist_links)[provider.id];
    if (!url) return res.status(400).json({ error: `Сначала сохраните ссылку на ${provider.label} в настройках профиля.` });
    try {
      const { items, partial } = await read(url);
      const added = await transaction(async (client) => {
        const current = await client.query("SELECT wishlist_links FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
        if (externalWishlistLinks(current.rows[0]?.wishlist_links)[provider.id] !== url) {
          throw new WishlistImportError(409, "Ссылка изменилась во время импорта. Попробуйте снова.");
        }
        return insertExternalWishlistItems(client, req.user.id, items);
      });
      res.set("Cache-Control", "private, no-store");
      return res.json({ added, skipped: items.length - added, partial });
    } catch (error) {
      if (error instanceof WishlistImportError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  }));

  app.post("/api/me/browser-wishlist-import/:provider", requireAuth, wishlistImportRateLimit, asyncRoute(async (req, res) => {
    const { provider } = req.params;
    if (typeof req.body?.ownerId === "string" && req.body.ownerId !== req.user.id) {
      return res.status(409).json({ error: "Аккаунт Rollapp сменился во время чтения. Запустите импорт снова." });
    }
    const items = parseBrowserWishlist(provider, req.body, req.user.id);
    if (!items) return res.status(400).json({ error: "Проверьте список товаров и версию расширения Rollapp." });

    const added = await transaction(async (client) => {
      const current = await client.query("SELECT wishlist_links FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      if (req.body.linkedUrl && externalWishlistLinks(current.rows[0]?.wishlist_links)[provider] !== req.body.linkedUrl) return null;
      const existing = await client.query("SELECT url FROM wishes WHERE user_id=$1 AND url<>''", [req.user.id]);
      const keys = new Set(existing.rows.map(({ url }) => marketplaceWishlistKey(provider, url)));
      return insertExternalWishlistItems(client, req.user.id, items.filter(({ key }) => !keys.has(key)));
    });
    if (added === null) return res.status(409).json({ error: "Ссылка изменилась во время импорта. Попробуйте снова." });
    res.set("Cache-Control", "private, no-store");
    return res.json({ added, skipped: items.length - added });
  }));

  function catalogWishSnapshot({ item }) {
    const read = (snakeCase, camelCase, fallback = "") => item[snakeCase] ?? item[camelCase] ?? fallback;
    const currency = String(read("currency", "currency", "RUB"));
    const priority = Number(read("priority", "priority", 2));
    return {
      title: String(read("title", "title")).trim().slice(0, 160),
      description: String(read("description", "description")).trim().slice(0, 1_000),
      url: String(read("url", "url")),
      imageUrl: String(read("image_url", "imageUrl")),
      fundraisingUrl: String(read("fundraising_url", "fundraisingUrl")),
      vehicleMake: String(read("vehicle_make", "vehicleMake")).trim().slice(0, 120),
      vehicleModel: String(read("vehicle_model", "vehicleModel")).trim().slice(0, 120),
      price: read("price", "price", null),
      currency: ["RUB", "USD", "EUR", "KZT", "BYN"].includes(currency) ? currency : "RUB",
      priority: [1, 2, 3].includes(priority) ? priority : 2,
      eventDate: formatEventDate(read("event_date", "eventDate", null)),
      space: listSpaceValues.includes(item.space) ? item.space : "products",
    };
  }

  app.get("/api/catalog/brands", requireAuth, asyncRoute(async (req, res) => {
    const parsedSpace = listSpaceSchema.safeParse(req.query.space || "products");
    if (!parsedSpace.success) return res.status(400).json({ error: "Неизвестное пространство каталога" });
    res.set("Cache-Control", "private, no-store");
    return res.json({ brands: await getStoredCatalogBrands(query, "ohmywishes", parsedSpace.data) });
  }));

  app.get("/api/catalog", requireAuth, asyncRoute(async (req, res) => {
    const parsed = catalogQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте параметры каталога" });
    const { source, brand, sections, space, limit, offset } = parsed.data;
    res.set("Cache-Control", "private, no-store");
    if (source === "ohmywishes" && brand) {
      const page = await getStoredCatalogBrandPage(query, source, brand, limit, offset, space, { separateCertificates: sections === "certificates" });
      if (!page) return res.status(404).json({ error: "Бренд не найден в каталоге" });
      const decorated = await decorateCatalogItems([...page.items, ...(page.certificates || [])], req.user.id, space);
      return res.json({
        source, brand: page.brand, space, total: page.total, limit, offset,
        items: decorated.slice(0, page.items.length),
        ...(page.certificates && { certificates: decorated.slice(page.items.length) }),
      });
    }
    if (source === "ohmywishes") {
      if (space !== "products") return res.json({ source, space, collection: "recommendations", total: 0, limit, offset, items: [] });
      let page;
      try { page = await getOhMyWishesRecommendationsPage(limit, offset); }
      catch (error) { return res.status(502).json({ error: error.message }); }
      const externalIds = page.items.map((item) => externalCatalogReference(item.id).externalId);
      const imported = externalIds.length ? await query(
        `SELECT * FROM external_catalog_items
         WHERE active=TRUE AND source=$1 AND external_id=ANY($2::text[])`,
        [source, externalIds],
      ) : { rows: [] };
      const importedById = new Map(imported.rows.map((row) => [row.external_id, externalCatalogItemFromRow(row)]));
      const recommendationItems = page.items.map((item) => importedById.get(externalCatalogReference(item.id).externalId) || item);
      const items = await decorateCatalogItems(recommendationItems, req.user.id);
      return res.json({ source, collection: "recommendations", total: page.total, limit, offset, items });
    }
    const result = await query(
      `SELECT w.*,
              u.id AS owner_id,u.username AS owner_username,u.name AS owner_name,u.avatar_url AS owner_avatar_url
       FROM wishes w
       JOIN users u ON u.id=w.user_id
       LEFT JOIN (
         SELECT ww.wish_id,
                MAX(CASE WHEN l.privacy='private' THEN 1 ELSE 0 END) AS has_private,
                MAX(CASE WHEN l.privacy='public' THEN 1 ELSE 0 END) AS has_public
         FROM wishlist_wishes ww
         JOIN wishlists l ON l.id=ww.wishlist_id
         GROUP BY ww.wish_id
       ) visibility ON visibility.wish_id=w.id
       WHERE w.status='active'
         AND COALESCE(w.space,'products')=$1
         AND w.privacy <> 'private'
         AND (w.catalog_item_key IS NULL OR w.catalog_item_key NOT LIKE 'external:%')
         AND COALESCE(visibility.has_private,0)=0
         AND (visibility.wish_id IS NULL OR visibility.has_public=1)
       ORDER BY w.created_at DESC,w.id`,
      [space],
    );
    const preserved = await query("SELECT snapshot FROM catalog_preserved_items WHERE space=$1", [space]);
    const nativeItems = groupCatalogRows([...result.rows, ...preserved.rows.map((row) => row.snapshot)]);
    const nativeItemsForPage = nativeItems.slice(offset, offset + limit);
    const items = await decorateCatalogItems(nativeItemsForPage, req.user.id, space);
    return res.json({
      source,
      space,
      total: nativeItems.length,
      limit,
      offset,
      items,
    });
  }));

  app.get("/api/catalog/items/:itemId", requireAuth, asyncRoute(async (req, res) => {
    const parsed = catalogItemIdSchema.safeParse(req.params.itemId);
    if (!parsed.success || (!externalCatalogReference(parsed.data) && !z.uuid().safeParse(parsed.data).success)) {
      return res.status(404).json({ error: "Позиция каталога не найдена" });
    }
    const resolved = await resolveCatalogActionItem(parsed.data);
    if (!resolved) return res.status(404).json({ error: "Позиция каталога не найдена" });
    const item = resolved.kind === "external" ? resolved.item : groupCatalogRows([resolved.item])[0];
    const external = externalCatalogReference(item.id);
    if (external) {
      const brand = await query(
        `SELECT b.external_id,b.slug,b.label,b.logo_url
         FROM external_catalog_brands b
         JOIN external_catalog_brand_items bi ON bi.source=b.source AND bi.brand_id=b.external_id AND bi.synced_at=b.synced_at
         WHERE bi.source=$1 AND bi.external_id=$2 ORDER BY b.sort_order,b.slug LIMIT 1`,
        [external.source, external.externalId],
      );
      if (brand.rowCount) {
        const row = brand.rows[0];
        item.brand = { id: row.external_id, slug: row.slug, label: row.label, logoUrl: row.logo_url };
      }
    }
    const [decorated] = await decorateCatalogItems([item], req.user.id, item.space);
    res.set("Cache-Control", "private, no-store");
    res.json({ item: decorated });
  }));

  app.patch("/api/catalog/items/like", requireAuth, asyncRoute(async (req, res) => {
    const parsed = catalogLikeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось изменить лайк" });
    const { itemId, liked } = parsed.data;
    const outcome = await withMutationLock(`catalog-like:${req.user.id}:${itemId}`, () => transaction(async (client) => {
      const resolved = await resolveCatalogActionItem(itemId, client);
      if (!resolved) return { status: 404, error: "Позиция каталога не найдена" };
      const itemKey = catalogActionKey(resolved.item);
      if (liked) {
        await client.query(
          `INSERT INTO catalog_item_likes (user_id,item_key) VALUES ($1,$2)
           ON CONFLICT (user_id,item_key) DO NOTHING`,
          [req.user.id, itemKey],
        );
      } else {
        await client.query(
          "DELETE FROM catalog_item_likes WHERE user_id=$1 AND item_key=$2",
          [req.user.id, itemKey],
        );
      }
      const count = await client.query(
        "SELECT COUNT(*)::int AS like_count FROM catalog_item_likes WHERE item_key=$1",
        [itemKey],
      );
      return { status: 200, likeCount: Number(count.rows[0]?.like_count) || 0 };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.json({ likedByMe: liked, likeCount: outcome.likeCount });
  }));

  app.post("/api/catalog/items/remove", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ itemId: z.string().min(1).max(500), wishId: z.string().min(1).max(160) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось определить желание" });
    const { itemId, wishId } = parsed.data;
    const outcome = await withMutationLock(`wish:${wishId}`, () => transaction(async (client) => {
      const owned = await client.query("SELECT * FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE", [wishId, req.user.id]);
      if (!owned.rowCount) return { ok: true };
      const resolved = await resolveCatalogActionItem(itemId, client);
      if (!resolved) return { status: 404, error: "Позиция каталога не найдена" };
      const wish = owned.rows[0];
      const sameItem = wish.catalog_item_key === catalogActionKey(resolved.item)
        || (resolved.kind === "native" && catalogIdentityKey(wish) === catalogIdentityKey(resolved.item))
        || (resolved.kind === "external" && canonicalCatalogUrl(wish.url)
          && canonicalCatalogUrl(wish.url) === canonicalCatalogUrl(resolved.item.url));
      if (!sameItem) return { status: 409, error: "Желание не соответствует позиции каталога" };
      if (resolved.kind === "native") {
        const snapshot = preservedCatalogRow(resolved.item);
        await client.query(
          `INSERT INTO catalog_preserved_items (id,space,snapshot) VALUES ($1,$2,$3::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [snapshot.id, snapshot.space, JSON.stringify(snapshot)],
        );
      }
      await client.query("DELETE FROM wishes WHERE id=$1 AND user_id=$2", [wishId, req.user.id]);
      return { ok: true };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    res.json(outcome);
  }));

  app.post("/api/catalog/items/add", requireAuth, asyncRoute(async (req, res) => {
    const parsed = catalogAddSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось добавить позицию" });
    const { itemId } = parsed.data;
    const outcome = await withMutationLock(`catalog-add:${req.user.id}:${itemId}`, () => transaction(async (client) => {
      const resolved = await resolveCatalogActionItem(itemId, client);
      if (!resolved) return { status: 404, error: "Позиция каталога не найдена" };
      const snapshotResult = wishFieldsSchema.safeParse({
        ...catalogWishSnapshot(resolved),
        privacy: "inherit",
        allowMultiple: false,
      });
      if (!snapshotResult.success) return { status: 422, error: "Данные позиции не подходят для добавления" };
      const snapshot = snapshotResult.data;
      const itemKey = catalogActionKey(resolved.item);
      const identityKey = catalogIdentityKey(resolved.item);
      const direct = await client.query(
        `SELECT * FROM wishes
         WHERE user_id=$1
           AND (catalog_item_key=$2 OR ($3::text IS NOT NULL AND (id=$3 OR source_wish_id=$3)))
         ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,created_at DESC,id
         LIMIT 1`,
        [req.user.id, itemKey, resolved.sourceWishId],
      );
      if (direct.rowCount) {
        const existing = direct.rows[0];
        const restored = existing.status !== "active" || (existing.space || "products") !== snapshot.space;
        const updated = await client.query(
          `UPDATE wishes
           SET status='active',space=$1,catalog_item_key=COALESCE(catalog_item_key,$2)
           WHERE id=$3 AND user_id=$4
           RETURNING id`,
          [snapshot.space, itemKey, existing.id, req.user.id],
        );
        return { status: 200, id: updated.rows[0].id, created: false, restored };
      }
      const owned = await client.query(
        `SELECT * FROM wishes
         WHERE user_id=$1 AND COALESCE(space,'products')=$2
         ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,created_at DESC,id`,
        [req.user.id, snapshot.space],
      );
      const sourceUrl = canonicalCatalogUrl(resolved.item.url);
      const existing = resolved.kind === "native"
        ? owned.rows.find((wish) => catalogIdentityKey(wish) === identityKey)
        : owned.rows.find((wish) => sourceUrl && canonicalCatalogUrl(wish.url) === sourceUrl);
      if (existing) {
        const restored = await client.query(
          `UPDATE wishes
           SET status='active',catalog_item_key=COALESCE(catalog_item_key,$1)
           WHERE id=$2 AND user_id=$3
           RETURNING id`,
          [itemKey, existing.id, req.user.id],
        );
        return { status: 200, id: restored.rows[0].id, created: false, restored: existing.status !== "active" };
      }

      const wishId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO wishes (
           id,user_id,title,description,url,image_url,fundraising_url,vehicle_make,vehicle_model,
           price,currency,priority,privacy,allow_multiple,event_date,space,source_wish_id,catalog_item_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inherit',FALSE,$13,$14,$15,$16)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          wishId, req.user.id, snapshot.title, snapshot.description, snapshot.url, snapshot.imageUrl,
          snapshot.fundraisingUrl, snapshot.vehicleMake, snapshot.vehicleModel, snapshot.price,
          snapshot.currency, snapshot.priority, snapshot.eventDate, snapshot.space,
          resolved.sourceWishId, itemKey,
        ],
      );
      if (inserted.rowCount) {
        const reward = await grantWishReward(client, req.user.id, { id: wishId, title: snapshot.title });
        return { status: 201, id: wishId, created: true, reward };
      }

      const raced = await client.query(
        `SELECT id FROM wishes
         WHERE user_id=$1
           AND (catalog_item_key=$2 OR ($3::text IS NOT NULL AND source_wish_id=$3))
         ORDER BY created_at DESC,id
         LIMIT 1`,
        [req.user.id, itemKey, resolved.sourceWishId],
      );
      if (!raced.rowCount) return { status: 409, error: "Позиция уже была добавлена другим запросом" };
      await client.query("UPDATE wishes SET status='active',space=$2 WHERE id=$1", [raced.rows[0].id, snapshot.space]);
      return { status: 200, id: raced.rows[0].id, created: false, restored: true };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    const wishes = await getWishes(req.user.id, req.user.id, true);
    res.set("Cache-Control", "private, no-store");
    return res.status(outcome.status).json({
      wish: wishes.find((wish) => wish.id === outcome.id),
      created: outcome.created,
      restored: Boolean(outcome.restored),
      reward: outcome.reward || null,
    });
  }));

  app.get("/api/gift-suggestions", requireAuth, asyncRoute(async (req, res) => {
    const fulfilled = await query(
      `SELECT * FROM wishes
       WHERE user_id=$1 AND status='fulfilled'
       ORDER BY created_at DESC,id
       LIMIT 200`,
      [req.user.id],
    );
    if (!fulfilled.rowCount) {
      res.set("Cache-Control", "private, no-store");
      return res.json({ items: [] });
    }

    const spaces = [...new Set(fulfilled.rows.map((wish) => wish.space || "products"))];
    const spacePlaceholders = spaces.map((_, index) => `$${index + 2}`).join(",");
    const candidates = await query(
      `SELECT w.*,
              u.id AS owner_id,u.username AS owner_username,u.name AS owner_name,u.avatar_url AS owner_avatar_url
       FROM wishes w
       JOIN users u ON u.id=w.user_id
       LEFT JOIN (
         SELECT ww.wish_id,
                MAX(CASE WHEN l.privacy='private' THEN 1 ELSE 0 END) AS has_private,
                MAX(CASE WHEN l.privacy='public' THEN 1 ELSE 0 END) AS has_public
         FROM wishlist_wishes ww
         JOIN wishlists l ON l.id=ww.wishlist_id
         GROUP BY ww.wish_id
       ) visibility ON visibility.wish_id=w.id
       WHERE w.user_id<>$1
         AND w.status='active'
         AND COALESCE(w.space,'products') IN (${spacePlaceholders})
         AND w.privacy <> 'private'
         AND COALESCE(visibility.has_private,0)=0
         AND (visibility.wish_id IS NULL OR visibility.has_public=1)
       ORDER BY w.created_at DESC,w.id`,
      [req.user.id, ...spaces],
    );

    res.set("Cache-Control", "private, no-store");
    return res.json({ items: buildFulfilledWishSuggestions(fulfilled.rows, candidates.rows) });
  }));

  registerWishPurchasePlanRoutes(app, { query, transaction, requireAuth, asyncRoute });

  app.get("/api/dashboard/purchases", requireAuth, asyncRoute(async (req, res) => {
    const userId = req.user.id;
    const [openPlans, subscriptions, purchaseCollaborations, { rows: wishes }] = await Promise.all([
      listOpenPurchasePlans(query, userId),
      listSubscriptions(query, userId),
      listPurchaseCollaborations(query, userId),
      query("SELECT id,title,currency,url,status FROM wishes WHERE user_id=$1 ORDER BY created_at DESC,id", [userId]),
    ]);
    res.set("Cache-Control", "private, no-store");
    res.json({
      purchasePlans: projectOpenPurchasePlans(openPlans, wishes),
      subscriptions,
      purchaseCollaborations,
      wishes: wishes.map(({ id, title, currency }) => ({ id, title, currency })),
    });
  }));

  app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
    const [lists, wishes, sharedWishes, openPlans, subscriptions, purchaseCollaborations, follows, birthdays, reservations, groupRows] = await Promise.all([
      getLists(req.user.id),
      getWishes(req.user.id, req.user.id, true),
      getSharedWishes(req.user.id),
      listOpenPurchasePlans(query, req.user.id),
      listSubscriptions(query, req.user.id),
      listPurchaseCollaborations(query, req.user.id),
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
      query(
        `SELECT g.id,g.wishlist_id,g.space,g.title,m.wish_id
         FROM wish_groups g
         JOIN wishlists l ON l.id=g.wishlist_id
         LEFT JOIN wish_group_members m ON m.group_id=g.id
         WHERE l.user_id=$1 ORDER BY g.created_at,m.wish_id`,
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
        && !listPrivacies.has("private")
        && (!listPrivacies.size || [...listPrivacies].some((privacy) => ["public", "followers", "link"].includes(privacy)))
      ))
      .slice(0, 6)
      .map(({ row }) => {
        const { wish_status: _wishStatus, wish_privacy: _wishPrivacy, follows_owner: _followsOwner, list_privacy: _listPrivacy, ...item } = row;
        return { ...item, price: item.price === null ? null : Number(item.price) };
      });
    const groupsById = new Map();
    for (const row of groupRows.rows) {
      if (!groupsById.has(row.id)) groupsById.set(row.id, { id: row.id, listId: row.wishlist_id, space: row.space, title: row.title, wishIds: [] });
      if (row.wish_id) groupsById.get(row.id).wishIds.push(row.wish_id);
    }
    res.set("Cache-Control", "private, no-store");
    res.json({
      lists,
      wishes,
      sharedWishes,
      purchasePlans: projectOpenPurchasePlans(openPlans, wishes),
      subscriptions,
      purchaseCollaborations,
      groups: [...groupsById.values()],
      followingCount: Number(follows.rows[0].count),
      birthdays: birthdays.rows.map((row) => ({ ...cleanUser(row), email: undefined })),
      reservations: visibleReservations,
      games: [],
    });
  }));

  app.patch("/api/wishes/reorder", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ wishIds: z.array(z.string().min(1)).min(1).max(1000) })
      .refine(({ wishIds }) => new Set(wishIds).size === wishIds.length)
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Некорректный порядок желаний" });
    const outcome = await transaction(async (client) => {
      const wishPlaceholders = parsed.data.wishIds.map((_, index) => `$${index + 2}`).join(",");
      const owned = await client.query(
        `SELECT id FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders}) FOR UPDATE`,
        [req.user.id, ...parsed.data.wishIds],
      );
      if (owned.rowCount !== parsed.data.wishIds.length) return false;
      for (const [index, wishId] of parsed.data.wishIds.entries()) {
        await client.query("UPDATE wishes SET sort_order=$1 WHERE id=$2 AND user_id=$3", [index, wishId, req.user.id]);
      }
      return true;
    });
    if (!outcome) return res.status(404).json({ error: "Одно из желаний не найдено" });
    res.json({ ok: true });
  }));

  function inferWishGroupSpace(list, wishes, requestedSpace) {
    if (requestedSpace) return requestedSpace;
    const wishSpaces = new Set(wishes.map((wish) => wish.space).filter((space) => listSpaceValues.includes(space)));
    if (wishSpaces.size === 1) return [...wishSpaces][0];
    return listSpaceValues.includes(list.space) ? list.space : "products";
  }

  app.post("/api/lists/:id/groups", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({
      wishIds: z.array(z.string().min(1)).min(1).max(2)
        .refine((ids) => new Set(ids).size === ids.length),
      space: listSpaceSchema.optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Выберите одно или два разных желания" });
    const outcome = await runWishGroupTransaction(req.params.id, async (client) => {
      const list = await client.query("SELECT id,space FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, req.user.id]);
      if (!list.rowCount) return { status: 404, error: "Список не найден" };
      const wishPlaceholders = parsed.data.wishIds.map((_, index) => `$${index + 2}`).join(",");
      const wishes = await client.query(
        `SELECT id,space FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders}) ORDER BY id FOR UPDATE`,
        [req.user.id, ...parsed.data.wishIds],
      );
      if (wishes.rowCount !== parsed.data.wishIds.length) return { status: 404, error: "Одно из желаний не найдено" };
      const space = inferWishGroupSpace(list.rows[0], wishes.rows, parsed.data.space);
      const occupiedPlaceholders = parsed.data.wishIds.map((_, index) => `$${index + 3}`).join(",");
      const occupied = await client.query(
        `SELECT wish_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id IN (${occupiedPlaceholders})`,
        [req.params.id, space, ...parsed.data.wishIds],
      );
      if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
      const id = randomUUID();
      for (const wishId of parsed.data.wishIds) {
        await client.query(
          `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
           ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
          [req.params.id, wishId],
        );
      }
      await client.query("INSERT INTO wish_groups (id,wishlist_id,space) VALUES ($1,$2,$3)", [id, req.params.id, space]);
      for (const wishId of parsed.data.wishIds) {
        await client.query(
          "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
          [id, req.params.id, space, wishId],
        );
      }
      return { id, space };
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.status(201).json({ group: { id: outcome.id, listId: req.params.id, space: outcome.space, title: "Группа", wishIds: parsed.data.wishIds } });
  }));

  app.post("/api/lists/:listId/groups/:groupId/wishes", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ wishId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Желание не выбрано" });
    const outcome = await runWishGroupTransaction(req.params.listId, async (client) => {
      const list = await client.query(
        "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.listId, req.user.id],
      );
      if (!list.rowCount) return { status: 404, error: "Список не найден" };
      const group = await client.query(
        "SELECT id,space FROM wish_groups WHERE id=$1 AND wishlist_id=$2 FOR UPDATE",
        [req.params.groupId, req.params.listId],
      );
      if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
      const wish = await client.query(
        "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [parsed.data.wishId, req.user.id],
      );
      if (!wish.rowCount) return { status: 404, error: "Желание не найдено" };
      const occupied = await client.query(
        "SELECT group_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id=$3",
        [req.params.listId, group.rows[0].space, parsed.data.wishId],
      );
      if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
      await client.query(
        `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
         ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
        [req.params.listId, parsed.data.wishId],
      );
      await client.query(
        "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
        [req.params.groupId, req.params.listId, group.rows[0].space, parsed.data.wishId],
      );
      return { wishId: parsed.data.wishId };
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.status(201).json({ wishId: outcome.wishId });
  }));

  app.delete("/api/lists/:listId/groups/:groupId/wishes/:wishId", requireAuth, asyncRoute(async (req, res) => {
    const outcome = await runWishGroupTransaction(req.params.listId, (client) => removeWishFromOwnedGroup({
      client,
      groupId: req.params.groupId,
      listId: req.params.listId,
      wishId: req.params.wishId,
      userId: req.user.id,
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.json({ ok: true, wishId: outcome.wishId, dissolved: outcome.dissolved, group: outcome.group });
  }));

  app.patch("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(60) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте название группы" });
    const result = await query(
      `UPDATE wish_groups g SET title=$1
       FROM wishlists l
       WHERE g.id=$2 AND g.wishlist_id=$3 AND l.id=g.wishlist_id AND l.user_id=$4
       RETURNING g.id,g.title`,
      [parsed.data.title, req.params.groupId, req.params.listId, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
    res.json({ group: { id: result.rows[0].id, title: result.rows[0].title } });
  }));

  app.post("/api/lists/:listId/groups/:groupId/move", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ targetListId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Выберите список для переноса" });
    const outcome = await runWishGroupTransaction(req.params.listId, (client) => moveOwnedWishGroup({
      client,
      groupId: req.params.groupId,
      sourceListId: req.params.listId,
      targetListId: parsed.data.targetListId,
      userId: req.user.id,
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.json(outcome);
  }));

  app.delete("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
    const result = await deleteOwnedWishGroup({
      groupId: req.params.groupId,
      listId: req.params.listId,
      userId: req.user.id,
    });
    if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
    res.json({ ok: true });
  }));

  app.post("/api/lists", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({
      title: z.string().trim().min(1).max(80),
      description: z.string().trim().max(300).default(""),
      privacy: z.enum(["public", "followers", "link", "private"]).default("public"),
      occasionDate: z.string().date().nullable().optional(),
      color: z.enum(["coral", "blue", "lime", "sun", "ink"]).default("coral"),
      space: listSpaceSchema.default("products"),
      wishIds: z.array(z.string().min(1)).max(1_000).default([]),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Укажите название и настройки списка" });
    const id = randomUUID();
    const token = randomBytes(10).toString("base64url");
    const data = parsed.data;
    const wishIds = [...new Set(data.wishIds)];
    const created = await transaction(async (client) => {
      if (wishIds.length) {
        const wishPlaceholders = wishIds.map((_, index) => `$${index + 2}`).join(",");
        const owned = await client.query(
          `SELECT id FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders})`,
          [req.user.id, ...wishIds],
        );
        if (owned.rowCount !== wishIds.length) return false;
      }
      await client.query(
        `INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token,space)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, req.user.id, data.title, data.description, data.privacy, data.occasionDate || null, data.color, token, data.space],
      );
      for (const wishId of wishIds) {
        await client.query(
          `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
           ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
          [id, wishId],
        );
      }
      return true;
    });
    if (!created) return res.status(400).json({ error: "Одно из желаний не найдено" });
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
      space: listSpaceSchema.optional(),
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
        `UPDATE wishlists SET title=$1,description=$2,privacy=$3,occasion_date=$4,color=$5,space=$6 WHERE id=$7`,
        [data.title ?? current.title, data.description ?? current.description, data.privacy ?? current.privacy, data.occasionDate === undefined ? current.occasion_date : data.occasionDate, data.color ?? current.color, data.space ?? current.space, current.id],
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

  const uniqueListIds = (listIds) => new Set(listIds).size === listIds.length;

  const listIdsSchema = z.array(z.string()).refine(
    uniqueListIds,
    { message: "Список нельзя выбрать дважды" },
  );

  // Желание теперь может существовать без списка: пространство задаёт
  // собственное поле space желания, поэтому пустой listIds разрешён и при создании.
  const createListIdsSchema = listIdsSchema;

  const participantIdsSchema = z.array(z.string().trim().min(1).max(100))
    .max(maxWishParticipants).refine((ids) => new Set(ids).size === ids.length);

  const wishParticipantChangesSchema = z.object({
    add: participantIdsSchema.default([]),
    remove: participantIdsSchema.default([]),
  }).strict().refine(({ add, remove }) => !add.some((id) => remove.includes(id)));

  const wishFieldsSchema = z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(""),
    url: z.string().url().max(2000).or(z.literal("")).default(""),
    imageUrl: z.string().url().max(2000).or(localImageUrlSchema).or(z.literal("")).default(""),
    fundraisingUrl: z.string().url().max(2000).or(z.literal("")).default(""),
    vehicleMake: z.string().trim().max(120).default(""),
    vehicleModel: z.string().trim().max(120).default(""),
    price: z.coerce.number().min(0).max(999999999).nullable().optional(),
    currency: z.enum(["RUB", "USD", "EUR", "KZT", "BYN"]).default("RUB"),
    priority: z.coerce.number().int().min(1).max(3).default(2),
    privacy: z.enum(["inherit", "private"]).default("inherit"),
    allowMultiple: z.boolean().default(false),
    eventDate: z.string().date().nullable().default(null),
    space: listSpaceSchema.nullable().optional(),
  });

  // Создание: пустой listIds разрешён — желание живёт в своём пространстве (space).
  const wishSchema = wishFieldsSchema.extend({ listIds: createListIdsSchema, participantIds: participantIdsSchema.default([]) });

  // Патч: listIds: [] по-прежнему разрешён для намеренной отвязки желания от списков.
  const wishPatchSchema = wishFieldsSchema.extend({ listIds: listIdsSchema, participantChanges: wishParticipantChangesSchema.optional() });

  const wishMediaNoteSchema = z.object({
    summary: z.string().max(12000).default(""),
    keyIdeas: z.string().max(40000).default(""),
    quotes: z.string().max(40000).default(""),
    applications: z.string().max(40000).default(""),
  }).strict();

  const vehicleModelsQuerySchema = z.object({
    make: z.string().trim().min(1).max(120),
  });

  const vehicleMatchSchema = z.object({
    title: z.string().trim().max(500).default(""),
    description: z.string().trim().max(2_000).default(""),
    url: z.string().trim().max(2_000).default(""),
  }).refine((value) => value.title || value.description || value.url, { message: "Добавьте текст или ссылку объявления" });

  function sendVehicleCatalogError(res, error) {
    if (!(error instanceof VehicleCatalogUnavailableError)) throw error;
    return res.status(503).json({
      error: "Справочник «Авто» временно недоступен. Марку и модель можно ввести вручную.",
      code: error.code,
    });
  }

  app.get("/api/vehicle-catalog/makes", requireAuth, asyncRoute(async (_req, res) => {
    try {
      const makes = await vehicleCatalog.listMakes();
      res.set("Cache-Control", "private, max-age=300");
      return res.json({ makes });
    } catch (error) {
      return sendVehicleCatalogError(res, error);
    }
  }));

  app.get("/api/vehicle-catalog/models", requireAuth, asyncRoute(async (req, res) => {
    const parsed = vehicleModelsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Укажите марку автомобиля" });
    try {
      const models = await vehicleCatalog.listModels(parsed.data.make);
      res.set("Cache-Control", "private, max-age=300");
      return res.json({ models });
    } catch (error) {
      return sendVehicleCatalogError(res, error);
    }
  }));

  app.post("/api/vehicle-catalog/match", requireAuth, asyncRoute(async (req, res) => {
    const parsed = vehicleMatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Добавьте название или описание объявления" });
    try {
      const vehicle = await vehicleCatalog.matchListing(parsed.data);
      res.set("Cache-Control", "private, no-store");
      return res.json({ vehicle });
    } catch (error) {
      return sendVehicleCatalogError(res, error);
    }
  }));

  function parseMarketplaceOfferSnapshot(row, wishTitle = "") {
    if (!row) return null;
    let offers = [];
    try {
      const parsed = JSON.parse(row.offers_json || "[]");
      if (Array.isArray(parsed)) offers = parsed;
    } catch {
      offers = [];
    }
    const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
    return {
      query: row.query,
      offers,
      summary: row.summary || "",
      model: row.model || "",
      searchedAt: row.searched_at ? new Date(row.searched_at).toISOString() : null,
      expiresAt,
      stale: !expiresAt || Date.parse(expiresAt) <= Date.now() || row.query !== wishTitle,
    };
  }

  function writeMarketplaceOfferEvent(res, event, value) {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    res.flush?.();
  }

  app.get("/api/wishes/:id/marketplace-offers", requireAuth, asyncRoute(async (req, res) => {
    const owned = await query(
      "SELECT id,title FROM wishes WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return res.status(404).json({ error: "Желание не найдено" });
    const [snapshot, credential] = await Promise.all([
      query(
        `SELECT query,offers_json,summary,model,searched_at,expires_at
         FROM wish_marketplace_offer_snapshots WHERE wish_id=$1 AND user_id=$2`,
        [req.params.id, req.user.id],
      ),
      openRouterCredentialRow(req.user.id),
    ]);
    const aiConfigured = Boolean(sharedAiConfigured() || (credential && userCredentialsConfigured()));
    res.set("Cache-Control", "private, no-store");
    return res.json({
      configured: true,
      aiConfigured,
      personalKeyConfigured: Boolean(credential),
      snapshot: parseMarketplaceOfferSnapshot(snapshot.rows[0], owned.rows[0].title),
    });
  }));

  app.post("/api/wishes/:id/marketplace-offers/refresh", requireAuth, marketplaceOffersRateLimit, async (req, res, next) => {
    let owned;
    try {
      owned = await query(
        `SELECT id,title,description,url,vehicle_make AS "vehicleMake",vehicle_model AS "vehicleModel",price,currency,space
         FROM wishes WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.id],
      );
    } catch (error) {
      return next(error);
    }
    if (!owned.rowCount) return res.status(404).json({ error: "Желание не найдено" });

    let openRouterCredential;
    try {
      openRouterCredential = await resolveOpenRouterApiKey(req.user.id);
    } catch (error) {
      return next(error);
    }

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const controller = new AbortController();
    const searchStartedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(new Error("AI search timed out")), 90_000);
    const keepAlive = setInterval(() => writeMarketplaceOfferEvent(res, "ping", { at: Date.now() }), 12_000);
    res.once("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const foodSearch = owned.rows[0].space === "food";
      const vehicleSearch = owned.rows[0].space === "transport";
      writeMarketplaceOfferEvent(res, "status", {
        stage: "searching",
        message: vehicleSearch ? "Ищем автомобиль в объявлениях…" : foodSearch ? "Ищем продукт в магазинах…" : "Ищем товар на маркетплейсах…",
      });
      if (openRouterCredential.warning) {
        writeMarketplaceOfferEvent(res, "warning", {
          warning: hasAiCredential(openRouterCredential)
            ? "Личный ключ нейропоиска недоступен; используется базовая модель Rollapp."
            : "Личный ключ нейропоиска недоступен; поиск продолжен в прямых каталогах магазинов.",
          code: openRouterCredential.warning.code,
        });
      }
      const marketplaceIds = vehicleSearch
        ? ["auto-ru", "avito-auto", "drom"]
        : foodSearch
          ? ["samokat", "lavka", "lenta", "vkusvill"]
          : ["ozon", "wildberries", "yandex-market", "megamarket", "dns"];
      const wish = owned.rows[0];
      const { result, aiSearch, resolvedOffers } = await findWishMarketplaceOffers(wish, {
        credential: openRouterCredential,
        marketplaceIds,
        signal: controller.signal,
        onPreview: (offers) => writeMarketplaceOfferEvent(res, "offers", { offers }),
        onIndexError: (error) => console.warn("Marketplace index search failed", {
          code: error instanceof YandexAiError ? error.code : "yandex_search_failed",
        }),
      });
      if (!hasLiveMarketplaceOffer(result.offers)) {
        if (aiSearch.status === "rejected") throw aiSearch.reason;
        throw new OpenRouterOffersError(vehicleSearch ? "Не удалось найти новые прямые объявления автомобиля" : "Не удалось найти новые прямые карточки товара", {
          status: 422,
          code: "marketplace_offers_not_found",
        });
      }
      if (!hasAiCredential(openRouterCredential) && !openRouterCredential.warning) {
        writeMarketplaceOfferEvent(res, "warning", {
          warning: "Нейропоиск не настроен; показаны предложения с прямыми ссылками на магазины.",
          code: "openrouter_not_configured",
        });
      } else if (aiSearch.status === "rejected") {
        const aiError = aiSearch.reason;
        const knownAiError = aiError instanceof OpenRouterOffersError || aiError instanceof YandexAiError;
        console.warn("Marketplace AI search failed", {
          code: knownAiError ? aiError.code : "openrouter_request_failed",
          durationMs: Date.now() - searchStartedAt,
        });
        writeMarketplaceOfferEvent(res, "warning", {
          warning: knownAiError
            ? `${aiError.message}; показаны предложения с прямыми ссылками на магазины.`
            : "Нейропоиск временно недоступен; показаны предложения с прямыми ссылками на магазины.",
          code: knownAiError ? aiError.code : "openrouter_request_failed",
        });
      }
      if (resolvedOffers.some((offer) => !offer.source)) {
        result.summary = "Найдены прямые карточки. Цену и наличие можно проверить в магазине.";
      } else if (result.offers.length && result.offers.every((offer) => offer.source)) {
        result.summary = "Новых точных предложений не найдено. Исходная ссылка сохранена.";
      }
      writeMarketplaceOfferEvent(res, "status", { stage: "ranking", message: vehicleSearch ? "Сверяем автомобили и выбираем лучшие объявления…" : "Проверяем цены и выбираем лучшие…" });

      const configuredMinutes = Number.parseInt(process.env.OPENROUTER_OFFERS_CACHE_MINUTES || "60", 10);
      const cacheMinutes = Math.min(1_440, Math.max(5, Number.isFinite(configuredMinutes) ? configuredMinutes : 60));
      const searchedAt = new Date();
      const expiresAt = new Date(searchedAt.getTime() + cacheMinutes * 60_000);
      const saved = await query(
        `INSERT INTO wish_marketplace_offer_snapshots
           (wish_id,user_id,query,offers_json,summary,model,searched_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (wish_id) DO UPDATE SET
           user_id=EXCLUDED.user_id,
           query=EXCLUDED.query,
           offers_json=EXCLUDED.offers_json,
           summary=EXCLUDED.summary,
           model=EXCLUDED.model,
           searched_at=EXCLUDED.searched_at,
           expires_at=EXCLUDED.expires_at
         WHERE wish_marketplace_offer_snapshots.user_id=EXCLUDED.user_id
         RETURNING query,offers_json,summary,model,searched_at,expires_at`,
        [
          req.params.id,
          req.user.id,
          owned.rows[0].title,
          JSON.stringify(result.offers),
          result.summary,
          result.model,
          searchedAt,
          expiresAt,
        ],
      );
      if (!saved.rowCount) throw new OpenRouterOffersError("Нет доступа к предложениям", { status: 403, code: "marketplace_offers_forbidden" });
      writeMarketplaceOfferEvent(res, "done", {
        snapshot: parseMarketplaceOfferSnapshot(saved.rows[0], owned.rows[0].title),
      });
      console.info("Marketplace offer refresh completed", {
        ai: Boolean(result.model),
        offers: result.offers.length,
        durationMs: Date.now() - searchStartedAt,
      });
    } catch (error) {
      const known = error instanceof OpenRouterOffersError || error instanceof YandexAiError;
      const aborted = controller.signal.aborted;
      console.warn("Marketplace offer refresh failed", {
        code: aborted ? "marketplace_offers_timeout" : known ? error.code : "marketplace_offers_failed",
        durationMs: Date.now() - searchStartedAt,
      });
      writeMarketplaceOfferEvent(res, "error", {
        error: aborted ? "Поиск занял слишком много времени. Попробуйте ещё раз" : known ? error.message : "Не удалось обновить предложения",
        code: aborted ? "marketplace_offers_timeout" : known ? error.code : "marketplace_offers_failed",
      });
    } finally {
      clearTimeout(timeout);
      clearInterval(keepAlive);
      if (!res.writableEnded) res.end();
    }
  });

  app.get(["/api/wishes/:id/media-note", "/api/wishes/:id/book-note"], requireAuth, asyncRoute(async (req, res) => {
    const owned = await query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return res.status(404).json({ error: "Медиа-айтем не найден" });
    const result = await query(
      `SELECT summary,key_ideas,quotes,applications,updated_at
       FROM wish_book_notes WHERE wish_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id],
    );
    res.set("Cache-Control", "private, no-store");
    return res.json({ note: mapWishMediaNote(result.rows[0]) });
  }));

  app.patch(["/api/wishes/:id/media-note", "/api/wishes/:id/book-note"], requireAuth, asyncRoute(async (req, res) => {
    const parsed = wishMediaNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Конспект слишком большой или содержит неверные данные" });
    const data = parsed.data;
    const outcome = await withMutationLock(`wish-media-note:${req.params.id}`, () => transaction(async (client) => {
      const owned = await client.query(
        "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.id, req.user.id],
      );
      if (!owned.rowCount) return { status: 404, error: "Медиа-айтем не найден" };
      const result = await client.query(
        `INSERT INTO wish_book_notes (wish_id,user_id,summary,key_ideas,quotes,applications)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (wish_id) DO UPDATE SET
           summary=EXCLUDED.summary,
           key_ideas=EXCLUDED.key_ideas,
           quotes=EXCLUDED.quotes,
           applications=EXCLUDED.applications,
           updated_at=CURRENT_TIMESTAMP
         WHERE wish_book_notes.user_id=EXCLUDED.user_id
         RETURNING summary,key_ideas,quotes,applications,updated_at`,
        [req.params.id, req.user.id, data.summary, data.keyIdeas, data.quotes, data.applications],
      );
      if (!result.rowCount) return { status: 403, error: "Нет доступа к конспекту" };
      return { note: mapWishMediaNote(result.rows[0]) };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.set("Cache-Control", "private, no-store");
    return res.json({ note: outcome.note });
  }));

  app.post("/api/wishes", requireAuth, asyncRoute(async (req, res) => {
    const parsed = wishSchema.safeParse(req.body);
    if (!parsed.success) {
      const listIdsIssue = parsed.error.issues.find((issue) => issue.path[0] === "listIds");
      if (listIdsIssue) return res.status(400).json({ error: listIdsIssue.message });
      return res.status(400).json({ error: "Добавьте название и проверьте данные желания" });
    }
    const data = parsed.data;
    const ownedLists = await query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
    const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
    if (data.listIds.some((id) => !ownedIds.has(id))) return res.status(403).json({ error: "Список вам не принадлежит" });
    const id = randomUUID();
    const outcome = await transaction(async (client) => {
      const participantChanges = { add: data.participantIds, remove: [] };
      const error = await validateWishParticipantChanges(client, req.user.id, null, participantChanges);
      if (error) return { error };
      await client.query(
        `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,vehicle_make,vehicle_model,price,currency,priority,privacy,allow_multiple,event_date,space)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, req.user.id, data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.vehicleMake, data.vehicleModel, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null],
      );
      for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, id]);
      await applyWishParticipantChanges(client, id, participantChanges);
      return { reward: await grantWishReward(client, req.user.id, { id, title: data.title }) };
    });
    if (outcome.error) return res.status(400).json({ error: outcome.error });
    const result = await getWishes(req.user.id, req.user.id, true);
    res.status(201).json({ wish: result.find((wish) => wish.id === id), reward: outcome.reward });
  }));

  registerWishHistoryImport(app, { requireAuth, asyncRoute, transaction });

  app.post("/api/wishes/backfill-previews", requireAuth, previewBackfillRateLimit, asyncRoute(async (req, res) => {
    res.json(await deduplicatedPreviewBackfill(req.user.id));
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
        fundraisingUrl: req.body.fundraisingUrl ?? current.fundraising_url,
        vehicleMake: req.body.vehicleMake ?? current.vehicle_make,
        vehicleModel: req.body.vehicleModel ?? current.vehicle_model,
        price: req.body.price === undefined ? current.price : req.body.price,
        currency: req.body.currency ?? current.currency,
        priority: req.body.priority ?? current.priority,
        privacy: req.body.privacy ?? current.privacy,
        allowMultiple: req.body.allowMultiple ?? current.allow_multiple,
        eventDate: req.body.eventDate === undefined ? formatEventDate(current.event_date) : req.body.eventDate,
        space: req.body.space === undefined ? current.space : req.body.space,
        listIds: req.body.listIds ?? currentLinks.rows.map((row) => row.wishlist_id),
        participantChanges: req.body.participantChanges,
      };
      const parsed = wishPatchSchema.safeParse(merged);
      if (!parsed.success) return { status: 400, error: "Проверьте данные желания" };
      const data = parsed.data;
      const ownedLists = await client.query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
      const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
      if (data.listIds.some((id) => !ownedIds.has(id))) {
        return { status: 403, error: "Список вам не принадлежит" };
      }
      if (data.participantChanges) {
        const error = await validateWishParticipantChanges(client, req.user.id, current.id, data.participantChanges);
        if (error) return { status: 400, error };
        await applyWishParticipantChanges(client, current.id, data.participantChanges);
      }
      await client.query(
        `UPDATE wishes SET title=$1,description=$2,url=$3,image_url=$4,fundraising_url=$5,vehicle_make=$6,vehicle_model=$7,price=$8,currency=$9,priority=$10,privacy=$11,allow_multiple=$12,event_date=$13,space=$14 WHERE id=$15`,
        [data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.vehicleMake, data.vehicleModel, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null, current.id],
      );
      const reservations = await client.query(
        "SELECT id FROM reservations WHERE wish_id=$1 ORDER BY created_at,id",
        [current.id],
      );
      if (data.allowMultiple) {
        await client.query("UPDATE reservations SET status='multiple' WHERE wish_id=$1", [current.id]);
      } else if (reservations.rowCount) {
        const [kept, ...duplicates] = reservations.rows;
        for (const duplicate of duplicates) await client.query("DELETE FROM reservations WHERE id=$1", [duplicate.id]);
        await client.query("UPDATE reservations SET status='reserved' WHERE id=$1", [kept.id]);
      }
      await client.query("DELETE FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
      for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, current.id]);
      await syncWishGroupMemberships({ client, wishId: current.id, listIds: data.listIds, userId: req.user.id });
      return { status: 200, id: current.id };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    const result = await getWishes(req.user.id, req.user.id, true);
    res.json({ wish: result.find((wish) => wish.id === outcome.id) });
  }));

  app.post("/api/wishes/:id/lists/:listId", requireAuth, asyncRoute(async (req, res) => {
    const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
      const [ownedWish, ownedList] = await Promise.all([
        client.query(
          "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [req.params.id, req.user.id],
        ),
        client.query(
          "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2",
          [req.params.listId, req.user.id],
        ),
      ]);
      if (!ownedWish.rowCount) return { status: 404, error: "Желание не найдено" };
      if (!ownedList.rowCount) return { status: 403, error: "Список вам не принадлежит" };
      await client.query(
        "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
        [req.params.listId, req.params.id],
      );
      return { status: 200, id: req.params.id };
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    const result = await getWishes(req.user.id, req.user.id, true);
    res.json({ wish: result.find((wish) => wish.id === outcome.id) });
  }));

  app.post("/api/wishes/:id/fulfilled", requireAuth, asyncRoute(async (req, res) => {
    const parsed = z.object({ fulfilled: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте статус желания" });
    const requestedStatus = parsed.data.fulfilled === undefined
      ? null
      : parsed.data.fulfilled ? "fulfilled" : "active";
    const result = await updateOwnedWishStatus(query, req.user.id, req.params.id, requestedStatus);
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
      return client.query("DELETE FROM wishes WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
    }));
    if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
    res.json({ ok: true });
  }));

  app.delete("/api/wishes/:id/participation", requireAuth, asyncRoute(async (req, res) => {
    await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
      await client.query("SELECT id FROM wishes WHERE id=$1 FOR UPDATE", [req.params.id]);
      await applyWishParticipantChanges(client, req.params.id, { add: [], remove: [req.user.id] });
    }));
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

    const outcome = await withMutationLock(`wish-like:${req.user.id}:${source.id}`, () => transaction(async (client) => {
      const existing = await client.query(
        "SELECT id FROM wishes WHERE user_id=$1 AND source_wish_id=$2 LIMIT 1",
        [req.user.id, source.id],
      );
      if (existing.rowCount) return { id: existing.rows[0].id, created: false, reward: null };
      const copyId = randomUUID();
      await client.query(
        `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,vehicle_make,vehicle_model,price,currency,priority,privacy,allow_multiple,event_date,space,source_wish_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inherit',FALSE,$13,$14,$15)`,
        [copyId, req.user.id, source.title, source.description, source.url, source.image_url, source.fundraising_url, source.vehicle_make, source.vehicle_model, source.price, source.currency, source.priority, source.event_date, source.space, source.id],
      );
      await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [target.rows[0].id, copyId]);
      const reward = await grantWishReward(client, req.user.id, { id: copyId, title: source.title });
      return { id: copyId, created: true, reward };
    }));
    const wishes = await getWishes(req.user.id, req.user.id, true);
    res.status(outcome.created ? 201 : 200).json({
      wish: wishes.find((wish) => wish.id === outcome.id),
      reward: outcome.reward,
    });
  }));

  app.post("/api/metadata", requireAuth, metadataRateLimit, asyncRoute(async (req, res) => {
    const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Нужна корректная ссылка" });
    const metadataUrl = new URL(parsed.data.url);
    metadataUrl.hash = "";
    const kinopoiskUrlError = kinopoiskContentUrlError(metadataUrl);
    if (kinopoiskUrlError) {
      return res.status(422).json({
        error: kinopoiskUrlError,
        code: "kinopoisk_content_url_required",
      });
    }
    const cacheUrl = canonicalRetailerProductUrl(metadataUrl) || metadataUrl;
    const cacheKey = cacheUrl.href;
    const cached = metadataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
    if (cached) metadataCache.delete(cacheKey);

    try {
      let value;
      if (isYouTubeUrl(metadataUrl)) {
        // YouTube watch pages are heavy and often hide og:image; the oEmbed
        // endpoint is the reliable source. On any failure we still return the
        // deterministic thumbnail so the wish preview always gets an image.
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(metadataUrl.href)}&format=json`;
          const { json } = await fetchPublicJson(oembedUrl);
          value = parseYouTubeMetadata(json, metadataUrl);
        } catch {
          value = {
            title: "",
            description: "",
            imageUrl: youtubeThumbnailUrl(parseYouTubeVideoId(metadataUrl)),
            price: null,
            currency: "",
            kind: "video",
          };
        }
      } else if (isVkVideoUrl(metadataUrl)) {
        // VK exposes public video metadata through video.getOembed. Unlike the
        // regular watch page, this endpoint does not loop through auth redirects
        // and returns a stable title and thumbnail without an access token.
        value = await resolveVkVideoMetadata(metadataUrl);
      } else if (isBookmateUrl(metadataUrl)) {
        // Bookmate pages and their social-preview images are protected by a
        // browser challenge. Its public metadata API returns the original cover
        // directly and also resolves legacy Bookmate ids.
        const apiUrl = bookmateApiUrl(metadataUrl);
        const { json, url } = await fetchPublicJson(apiUrl);
        value = parseBookmateMetadata(json, url);
      } else if (isKinopoiskUrl(metadataUrl)) {
        // Film pages redirect anonymous server requests through Yandex SSO. The
        // public Kinopoisk poster CDN is deterministic by content id, so it is a
        // faster and more reliable preview source than scraping the page shell.
        value = parseKinopoiskMetadata(metadataUrl);
      } else {
        const retailerMetadata = await resolveRetailerMetadata(metadataUrl);
        if (retailerMetadata !== null) {
          // Grocery retailers vary between structured product pages, generic app
          // shells and bot challenges. Their adapter validates product data and
          // always supplies a safe local preview if the remote image is unavailable.
          value = retailerMetadata;
        } else {
          const { html, url } = await fetchPublicHtml(metadataUrl);
          value = isYandexMapsUrl(url)
            ? parseYandexMapsMetadata(html, url)
            : parseProductMetadata(html, url);
        }
      }
      // A branded fallback means the retailer temporarily served a challenge or
      // an incomplete app shell. Do not cache that transient result: a retry may
      // receive the public product JSON-LD with its real image and price.
      if (value.previewFallback !== true) {
        if (metadataCache.size >= metadataCacheLimit) metadataCache.delete(metadataCache.keys().next().value);
        metadataCache.set(cacheKey, { value, expiresAt: Date.now() + metadataCacheTtlMs });
      }
      res.json(value);
    } catch (error) {
      if (error instanceof MetadataFetchError) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  }));

  app.get("/api/shared/:token", asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Cookie");
    const found = await query(
      `SELECT l.*,u.username,u.name,u.bio,u.avatar_url,u.birthday,u.member_number${moodColumns()} FROM wishlists l JOIN users u ON u.id=l.user_id WHERE l.share_token=$1`,
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
    res.json({ profile: { id: row.user_id, username: row.username, name: row.name, memberNumber: formatMemberNumber(row.member_number), bio: row.bio, avatarUrl: row.avatar_url, birthday: row.birthday, publicMood: publicMood(row) }, list, wishes, groups: await getVisibleWishGroups(row.user_id, [list], wishes), isOwner, isFollowing: Boolean(follows.rowCount) });
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
        return { status: 201, reserved: true };
      })));
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Это желание уже забронировал кто-то другой" });
      throw error;
    }
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.status(outcome.status).json({ reserved: outcome.reserved });
  }));
}
