import "dotenv/config";
import {
  mergeOhMyWishesIdea,
  OHMYWISHES_API_BASE,
  OHMYWISHES_SOURCE,
  ohMyWishesCatalogRecord,
} from "../server/ohmywishes-catalog.js";

const argumentsSet = new Set(process.argv.slice(2));
const apply = argumentsSet.has("--apply");
const useProductionTunnel = argumentsSet.has("--production");
const pageSize = 20;

function numericArgument(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} должен быть целым числом от ${min} до ${max}.`);
  }
  return value;
}

const concurrency = numericArgument("--concurrency", 3, { max: 8 });
const delayMs = numericArgument("--delay", 140, { min: 0, max: 5_000 });
const categoryLimit = numericArgument("--limit-categories", 0, { min: 0, max: 100 });
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ru",
      "X-Content-Region": "RU",
      "x-no-auth": "true",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await wait(Math.min(8_000, 500 * (2 ** (attempt - 1))));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`OhMyWishes вернул HTTP ${response.status} для ${new URL(url).pathname}.`);
  }
  return response.json();
}

async function loadPublicCatalog() {
  const response = await fetchJson(`${OHMYWISHES_API_BASE}/selections`);
  const root = response?.item;
  if (!root?.id || !Array.isArray(root.selections)) {
    throw new Error("OhMyWishes вернул неизвестную структуру подборок.");
  }

  const publicSelections = root.selections
    .filter((selection) => selection?.contentType === "ideas" && selection?.id && selection?.slug)
    .concat(root.contentType === "ideas" && root.slug ? [root] : []);
  const selections = categoryLimit ? publicSelections.slice(0, categoryLimit) : publicSelections;
  const tasks = selections.flatMap((selection, selectionIndex) => {
    const pageCount = Math.ceil(Number(selection.ideasCount || 0) / pageSize);
    return Array.from({ length: pageCount }, (_, pageIndex) => ({
      selection,
      selectionIndex,
      offset: pageIndex * pageSize,
    }));
  });
  if (!tasks.length) throw new Error("В публичных подборках OhMyWishes не найдено страниц каталога.");

  const items = new Map();
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const url = `${OHMYWISHES_API_BASE}/selections/${encodeURIComponent(task.selection.id)}/ideas-v2?limit=${pageSize}&offset=${task.offset}`;
      const page = await fetchJson(url);
      if (!Array.isArray(page?.items)) throw new Error(`Подборка «${task.selection.title}» вернула неизвестный формат.`);
      page.items.forEach((idea) => mergeOhMyWishesIdea(items, idea, task.selection, task.selectionIndex));
      completed += 1;
      if (completed % 25 === 0 || completed === tasks.length) {
        console.log(`Получено страниц: ${completed}/${tasks.length}; уникальных позиций: ${items.size}.`);
      }
      if (delayMs) await wait(delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  if (!items.size) throw new Error("OhMyWishes не вернул ни одной позиции каталога.");

  return {
    records: [...items.values()].map(ohMyWishesCatalogRecord),
    selectionCount: selections.length,
    pageCount: tasks.length,
    complete: !categoryLimit,
  };
}

function insertBatch(client, records, syncedAt) {
  const columns = [
    "source", "external_id", "title", "description", "url", "image_url", "price", "currency",
    "space", "source_label", "source_home_url", "source_logo_url", "categories_json", "source_rank",
    "active", "last_seen_at", "updated_at",
  ];
  const values = [];
  const rows = records.map((record) => {
    const row = [
      record.source, record.externalId, record.title, record.description, record.url, record.imageUrl,
      record.price, record.currency, record.space, record.sourceLabel, record.sourceHomeUrl,
      record.sourceLogoUrl, record.categoriesJson, record.sourceRank, true, syncedAt, syncedAt,
    ];
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(",")})`;
  });
  return client.query(
    `INSERT INTO external_catalog_items (${columns.join(",")}) VALUES ${rows.join(",")}
     ON CONFLICT (source,external_id) DO UPDATE SET
       title=EXCLUDED.title,description=EXCLUDED.description,url=EXCLUDED.url,image_url=EXCLUDED.image_url,
       price=EXCLUDED.price,currency=EXCLUDED.currency,space=EXCLUDED.space,source_label=EXCLUDED.source_label,
       source_home_url=EXCLUDED.source_home_url,source_logo_url=EXCLUDED.source_logo_url,
       categories_json=EXCLUDED.categories_json,source_rank=EXCLUDED.source_rank,active=TRUE,
       last_seen_at=EXCLUDED.last_seen_at,updated_at=EXCLUDED.updated_at`,
    values,
  );
}

async function configureProductionDatabase() {
  if (!useProductionTunnel) return;
  const {
    createProductionDatabaseEnvironment,
    readTunnelConfig,
    startTunnel,
  } = await import("./production-db-tunnel.mjs");
  const config = readTunnelConfig(process.env);
  let tunnel;
  try {
    tunnel = await startTunnel();
  } catch (error) {
    if (!String(error?.message || "").includes("уже занят другим процессом")) throw error;
    const { createConnection } = await import("node:net");
    const existingTunnelReady = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port: config.localPort });
      const finish = (ready) => { socket.removeAllListeners(); socket.destroy(); resolve(ready); };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(1_000, () => finish(false));
    });
    if (!existingTunnelReady) throw error;
    console.log(`Используется уже открытый production-туннель на 127.0.0.1:${config.localPort}.`);
    tunnel = { ready: true };
  }
  if (!tunnel.ready) throw new Error("SSH-туннель к production PostgreSQL не стал готов.");
  Object.assign(process.env, createProductionDatabaseEnvironment(process.env, config));
}

async function persist(records, complete) {
  await configureProductionDatabase();
  const [{ initializeDatabase }, database] = await Promise.all([
    import("../server/schema.js"),
    import("../server/db.js"),
  ]);
  if (database.isMemoryDatabase) {
    throw new Error("Импорт разрешён только в настроенную production PostgreSQL; локальная память не используется.");
  }
  await initializeDatabase();
  const syncedAt = new Date().toISOString();
  await database.transaction(async (client) => {
    for (let index = 0; index < records.length; index += 100) {
      await insertBatch(client, records.slice(index, index + 100), syncedAt);
    }
    if (complete) {
      await client.query(
        `UPDATE external_catalog_items SET active=FALSE,updated_at=$1
         WHERE source=$2 AND last_seen_at < $1 AND active=TRUE`,
        [syncedAt, OHMYWISHES_SOURCE.id],
      );
    }
  });
  const summary = await database.query(
    `SELECT space,COUNT(*)::int AS count FROM external_catalog_items
     WHERE source=$1 AND active=TRUE GROUP BY space ORDER BY space`,
    [OHMYWISHES_SOURCE.id],
  );
  await database.pool.end();
  return summary.rows;
}

try {
  console.log(`Источник: ${OHMYWISHES_SOURCE.homeUrl}`);
  const catalog = await loadPublicCatalog();
  const spaceCounts = catalog.records.reduce((counts, record) => {
    counts[record.space] = (counts[record.space] || 0) + 1;
    return counts;
  }, {});
  console.log(`Подборок: ${catalog.selectionCount}; страниц: ${catalog.pageCount}; уникальных позиций: ${catalog.records.length}.`);
  console.log(`Распределение: ${JSON.stringify(spaceCounts)}.`);
  if (!apply) {
    console.log("Проверка завершена без записи. Для синхронизации используйте --apply --production.");
  } else {
    const summary = await persist(catalog.records, catalog.complete);
    console.log(`Production-каталог синхронизирован: ${summary.map((row) => `${row.space}=${row.count}`).join(", ")}.`);
  }
} catch (error) {
  console.error(`Ошибка импорта OhMyWishes: ${error?.message || error}`);
  process.exitCode = 1;
}
