import "dotenv/config";
import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { OHMYWISHES_API_BASE, OHMYWISHES_SOURCE } from "../server/ohmywishes-catalog.js";
import { ohMyWishesBrandItem } from "../server/ohmywishes-brands.js";
import { externalCatalogBrandsSchema, getStoredCatalogBrandPage } from "../server/external-catalog-brands.js";

// The eleven storefronts requested for this import, in screenshot order.
export const BRAND_SLUGS = [
  "littleblackjewelry", "moonswoon", "genotek", "bork.ru", "aprell", "tengran",
  "design_eho", "moonsoul", "papershoot", "store77", "sokolov",
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);

async function publicJson(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response;
    try {
      response = await fetch(`${OHMYWISHES_API_BASE}${path}`, {
        headers: { Accept: "application/json", "Accept-Language": "ru", "X-Content-Region": "RU", "x-no-auth": "true" },
        signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await response.body?.cancel();
      await wait(Math.min(30_000, Math.max(500 * 2 ** attempt, Number(response.headers.get("Retry-After")) * 1000 || 0)));
      continue;
    }
    throw new Error(`OhMyWishes HTTP ${response.status}: ${path}`);
  }
}

export function validateSnapshot(snapshot) {
  if (snapshot?.version !== 1 || snapshot.source !== OHMYWISHES_SOURCE.id || !Number.isFinite(Date.parse(snapshot.fetchedAt))) {
    throw new Error("Неизвестный формат снимка каталога.");
  }
  if (!Array.isArray(snapshot.brands) || snapshot.brands.length !== BRAND_SLUGS.length) throw new Error("Нужны все 11 брендов.");
  const slugs = new Set();
  const ids = new Set();
  const allItemIds = new Set();
  for (const brand of snapshot.brands) {
    if (!BRAND_SLUGS.includes(brand.slug) || slugs.has(brand.slug) || !brand.id || ids.has(brand.id)
      || brand.profile?.id !== brand.id || brand.profile?.username !== brand.slug || brand.profile?.accountType !== "brand") {
      throw new Error(`Не удалось подтвердить бренд ${brand.slug}.`);
    }
    slugs.add(brand.slug);
    ids.add(brand.id);
    if (!Number.isSafeInteger(brand.total) || brand.total < 0 || brand.profile.wishesCount !== brand.total
      || !Array.isArray(brand.items) || brand.items.length !== brand.total) {
      throw new Error(`Неполный каталог ${brand.slug}: ${brand.items?.length}/${brand.total}.`);
    }
    const itemIds = new Set();
    for (const idea of brand.items) {
      if (!idea.id || itemIds.has(idea.id) || allItemIds.has(idea.id) || !idea.title?.trim() || idea.isIdea !== true || idea.creator?.id !== brand.id) {
        throw new Error(`Некорректная или повторная карточка ${brand.slug}/${idea.id}.`);
      }
      itemIds.add(idea.id);
      allItemIds.add(idea.id);
    }
  }
  return snapshot;
}

async function scrape() {
  const root = await publicJson("/selections");
  if (!Array.isArray(root?.item?.brands)) throw new Error("Не удалось прочитать список брендов.");
  const brands = [];
  // At most three public requests at a time; finish each storefront before starting the next.
  for (const slug of BRAND_SLUGS) {
    const listed = root.item.brands.find((brand) => brand.username === slug && brand.accountType === "brand");
    if (!listed) throw new Error(`В публичном каталоге отсутствует ${slug}.`);
    const { item: profile } = await publicJson(`/users/${encodeURIComponent(listed.id)}`);
    const total = profile?.wishesCount;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error(`Нет числа товаров у ${slug}.`);
    const summaries = [];
    for (let offset = 0; offset < total; offset += 30) {
      const page = await publicJson(`/users/${encodeURIComponent(listed.id)}/wish-lists/all/wishes?limit=30&offset=${offset}`);
      if (!Array.isArray(page.items) || page.items.length !== Math.min(30, total - offset)) {
        throw new Error(`Неполная страница ${slug}, offset=${offset}.`);
      }
      summaries.push(...page.items);
      await wait(150);
    }
    const items = new Array(summaries.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < summaries.length) {
        const index = cursor++;
        const detail = await publicJson(`/wishes-v2/${encodeURIComponent(summaries[index].id)}`);
        if (detail.item?.id !== summaries[index].id) throw new Error(`Отсутствует карточка ${slug}/${summaries[index].id}.`);
        items[index] = detail.item;
        await wait(150);
      }
    }));
    const brand = { id: listed.id, slug, label: profile.fullname || listed.fullname || slug,
      logoUrl: profile.avatar?.image?.url || profile.avatar?.url || "", total, profile, items };
    brands.push(brand);
    console.log(`${brand.label}: ${items.length}/${total} полных карточек.`);
  }
  return validateSnapshot({ version: 1, source: OHMYWISHES_SOURCE.id, fetchedAt: new Date().toISOString(), brands });
}

export async function productionDatabase() {
  dotenv.config({ path: ".env.local", override: false, quiet: true });
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error("Production PostgreSQL не настроен.");
  if (process.argv.includes("--production")) {
    const { readTunnelConfig, startTunnel, createProductionDatabaseEnvironment } = await import("./production-db-tunnel.mjs");
    const config = readTunnelConfig();
    try {
      const tunnel = await startTunnel();
      if (!tunnel.ready) throw new Error("Production-туннель не готов.");
    } catch (error) {
      if (!String(error.message).includes("уже занят другим процессом")) throw error;
      // The TLS-verified PostgreSQL connection below verifies an existing listener.
    }
    Object.assign(process.env, createProductionDatabaseEnvironment(process.env, config));
  }
  process.env.DEMO_MODE = "false";
  if (!process.env.PGPASSWORD && !process.env.DATABASE_URL && process.env.YC_LOCKBOX_SECRET_ID) {
    const { loadLockboxValue } = await import("../server/lockbox.js");
    process.env.PGPASSWORD = await loadLockboxValue(process.env.YC_LOCKBOX_SECRET_ID, process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password");
  }
  const database = await import("../server/db.js");
  if (database.isMemoryDatabase) throw new Error("Импорт в локальную базу запрещён.");
  return database;
}

async function persist(snapshot) {
  validateSnapshot(snapshot);
  const database = await productionDatabase();
  try {
    const target = await database.query("SELECT current_database() AS database, current_user AS role, to_regclass('external_catalog_items')::text AS catalog");
    const expectedDatabase = process.env.DATABASE_URL ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) : process.env.PGDATABASE;
    if (target.rows[0].database !== expectedDatabase || target.rows[0].catalog !== "external_catalog_items") throw new Error("Не удалось подтвердить целевую базу и таблицу каталога.");
    console.log(`Цель: production PostgreSQL ${target.rows[0].database}, таблица ${target.rows[0].catalog}.`);
    const syncedAt = new Date().toISOString();
    await database.transaction(async (client) => {
      await client.query(externalCatalogBrandsSchema);
      for (const [brandIndex, brand] of snapshot.brands.entries()) {
        await client.query(`INSERT INTO external_catalog_brands (source,external_id,slug,label,logo_url,sort_order,profile,synced_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (source,external_id) DO UPDATE SET slug=EXCLUDED.slug,label=EXCLUDED.label,
          logo_url=EXCLUDED.logo_url,sort_order=EXCLUDED.sort_order,profile=EXCLUDED.profile,synced_at=EXCLUDED.synced_at`,
        [snapshot.source, brand.id, brand.slug, brand.label, brand.logoUrl, brandIndex, JSON.stringify(brand.profile), syncedAt]);
        for (const [rank, idea] of brand.items.entries()) {
          const item = ohMyWishesBrandItem(idea, brand);
          // Keep the direct shop URL usable while retaining the provider URL and all photos in the snapshot table.
          let shopUrl = "";
          try { const url = new URL(idea.externalUri); if (!idea.isExternalUriBlocked && ["https:", "http:"].includes(url.protocol)) shopUrl = url.href; } catch { /* No shop link. */ }
          await client.query(`INSERT INTO external_catalog_items
            (source,external_id,title,description,url,image_url,price,currency,space,source_label,source_home_url,source_logo_url,source_rank,active,last_seen_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14,$14)
            ON CONFLICT (source,external_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
              url=EXCLUDED.url,image_url=EXCLUDED.image_url,price=EXCLUDED.price,currency=EXCLUDED.currency,
              active=TRUE,last_seen_at=EXCLUDED.last_seen_at,updated_at=EXCLUDED.updated_at`,
          [snapshot.source, idea.id, item.title.trim(), item.description, shopUrl || item.url, item.imageUrl,
            item.price, item.currency, item.space, OHMYWISHES_SOURCE.label, OHMYWISHES_SOURCE.homeUrl,
            OHMYWISHES_SOURCE.logoUrl, brandIndex, syncedAt]);
          await client.query(`INSERT INTO external_catalog_brand_items (source,brand_id,external_id,sort_order,source_url,payload,synced_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source,brand_id,external_id) DO UPDATE SET
            sort_order=EXCLUDED.sort_order,source_url=EXCLUDED.source_url,payload=EXCLUDED.payload,synced_at=EXCLUDED.synced_at`,
          [snapshot.source, brand.id, idea.id, rank, item.url, JSON.stringify(idea), syncedAt]);
        }
        const page = await getStoredCatalogBrandPage(client.query.bind(client), snapshot.source, brand.slug, 96, 0);
        if (page.total !== brand.total || page.items.length !== Math.min(96, brand.total)) throw new Error(`Проверка записи ${brand.slug} не пройдена.`);
      }
    });
    console.log(`Импорт завершён: ${snapshot.brands.length} брендов, ${snapshot.brands.reduce((sum, brand) => sum + brand.total, 0)} товаров.`);
  } finally {
    await database.pool.end();
  }
}

async function verify(snapshot) {
  const database = await productionDatabase();
  try {
    for (const brand of snapshot.brands) {
      const items = [];
      for (let offset = 0; offset < Math.max(1, brand.total); offset += 48) {
        const page = await getStoredCatalogBrandPage(database.query, snapshot.source, brand.slug, 48, offset);
        if (!page || page.total !== brand.total) throw new Error(`Число товаров ${brand.slug} в БД не совпало со снимком.`);
        items.push(...page.items);
      }
      for (const [index, idea] of brand.items.entries()) {
        const item = items[index];
        const expected = ohMyWishesBrandItem(idea, brand);
        if (!item || item.id !== expected.id || item.title !== expected.title.trim()
          || item.description !== expected.description || item.price !== expected.price || item.imageUrl !== expected.imageUrl) {
          throw new Error(`Сохранённая карточка ${brand.slug}/${idea.id} отличается от снимка.`);
        }
      }
      if (items.length !== brand.total || new Set(items.map((item) => item.id)).size !== brand.total) {
        throw new Error(`Ошибка пагинации ${brand.slug}.`);
      }
      const raw = await database.query(`SELECT external_id,payload FROM external_catalog_brand_items WHERE source=$1 AND brand_id=$2`, [snapshot.source, brand.id]);
      const byId = new Map(raw.rows.map((row) => [row.external_id, row.payload]));
      for (const idea of brand.items) {
        const saved = byId.get(idea.id);
        if (saved?.externalUri !== idea.externalUri || saved?.photos?.length !== idea.photos?.length) throw new Error(`Не сохранены ссылки или фотографии ${idea.id}.`);
      }
      console.log(`${brand.label}: ${items.length} товаров в production, содержимое и страницы по 48 проверены.`);
    }
  } finally { await database.pool.end(); }
}

async function main() {
  const input = argument("--input");
  const snapshot = input ? validateSnapshot(JSON.parse(await readFile(input, "utf8"))) : await scrape();
  const output = argument("--output");
  if (output) await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
  console.log(`Проверено: ${snapshot.brands.length} брендов, ${snapshot.brands.reduce((sum, brand) => sum + brand.total, 0)} товаров.`);
  if (process.argv.includes("--apply") && process.argv.includes("--verify")) throw new Error("Запускайте --apply и --verify отдельно.");
  if (process.argv.includes("--verify")) await verify(snapshot);
  else if (process.argv.includes("--apply")) await persist(snapshot);
  else console.log("Снимок проверен без записи в БД. Для импорта: --apply; для настроенного SSH-туннеля дополнительно --production.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Ошибка импорта брендов: ${error.message}`); process.exitCode = 1; });
}
