import { XMLParser, XMLValidator } from "fast-xml-parser";

export const CDEK_SOURCE = "https://integration.cdek.ru/pvzlist.php?type=PVZ";
export const CDEK_REFRESH_MS = 24 * 60 * 60 * 1000;
export const CDEK_MAX_AGE_MS = 7 * CDEK_REFRESH_MS;
export const cdekSchema = `
  CREATE TABLE IF NOT EXISTS cdek_catalog (
    id TEXT PRIMARY KEY CHECK (id = 'ru'),
    points JSONB NOT NULL CHECK (jsonb_typeof(points) = 'array'),
    synced_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL
  );
`;

export class CdekError extends Error {
  constructor(message = "Не удалось загрузить пункты CDEK. Попробуйте ещё раз чуть позже.") {
    super(message);
    this.code = "CDEK_UNAVAILABLE";
    this.status = 503;
  }
}

export function parseCdekPoints(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new CdekError();
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false }).parse(xml);
  const rows = parsed?.PvzList?.Pvz;
  if (!rows) throw new CdekError();
  const points = new Map();
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (row.countryCodeIso !== "RU" || row.Type !== "PVZ" || row.Status !== "ACTIVE" || row.IsHandout !== "true") continue;
    if (!row.Code || !row.City || !row.Address || !row.CityCode) throw new CdekError();
    const longitude = Number(row.coordX);
    const latitude = Number(row.coordY);
    points.set(row.Code, {
      code: String(row.Code), cityCode: String(row.CityCode), city: String(row.City),
      region: String(row.RegionName || ""), address: String(row.Address),
      fullAddress: String(row.FullAddress || `${row.City}, ${row.Address}`),
      workTime: String(row.WorkTime || ""), note: String(row.AddressComment || row.Note || ""),
      metro: String(row.MetroStation || ""),
      coordinates: Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null,
    });
  }
  if (!points.size) throw new CdekError();
  return [...points.values()].sort((a, b) => a.city.localeCompare(b.city, "ru") || a.address.localeCompare(b.address, "ru") || a.code.localeCompare(b.code));
}

export async function fetchCdekPoints() {
  try {
    const response = await fetch(CDEK_SOURCE, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (!response.ok || !response.body) throw new CdekError();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw new CdekError();
      chunks.push(chunk);
    }
    return parseCdekPoints(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new CdekError(); }
}

export async function saveCdekCatalog(query, points) {
  // Reject an unexpectedly small feed rather than replacing the working catalog
  // with an upstream partial response. The real RU catalog has thousands of PVZ.
  if (points.length < 1000) throw new CdekError("CDEK вернул неполный справочник. Предыдущая версия сохранена.");
  const result = await query(`INSERT INTO cdek_catalog (id,points,synced_at,source)
    VALUES ('ru',$1::jsonb,CURRENT_TIMESTAMP,$2)
    ON CONFLICT (id) DO UPDATE SET points=EXCLUDED.points,synced_at=EXCLUDED.synced_at,source=EXCLUDED.source
    RETURNING synced_at`, [JSON.stringify(points), CDEK_SOURCE]);
  return { points, syncedAt: new Date(result.rows[0].synced_at).toISOString() };
}

const normalize = (value) => value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function listCdekCities(points) {
  const cities = new Map();
  for (const point of points) {
    if (!cities.has(point.cityCode)) cities.set(point.cityCode, {
      code: point.cityCode, name: point.city, region: point.region,
      label: point.region && point.region !== point.city ? `${point.city}, ${point.region}` : point.city,
    });
  }
  const labels = new Map();
  for (const city of cities.values()) labels.set(city.label, (labels.get(city.label) || 0) + 1);
  return [...cities.values()].map((city) => ({ ...city, label: labels.get(city.label) > 1 ? `${city.label} (${city.code})` : city.label }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru") || a.label.localeCompare(b.label, "ru"));
}

export function searchCdekPoints(points, search, offset = 0, cityCode = "", limit = 30) {
  const tokens = normalize(search).split(/\s+/).filter(Boolean);
  const found = tokens.length || (cityCode && !search.trim()) ? points.filter((point) => {
    if (cityCode && point.cityCode !== cityCode) return false;
    const text = normalize((cityCode ? [point.address, point.metro, point.code] : [point.city, point.region, point.address, point.metro, point.code]).join(" "));
    return tokens.every((token) => text.includes(token));
  }) : [];
  return { points: found.slice(offset, offset + limit), total: found.length, nextOffset: offset + limit < found.length ? offset + limit : null };
}

export function createCdekCatalog(query) {
  let cache;
  let checkedAt = 0;
  let retryAt = 0;
  let loading;
  return async () => {
    if (cache && Date.now() - checkedAt < 60_000 && Date.now() - Date.parse(cache.syncedAt) <= CDEK_MAX_AGE_MS) return cache;
    if (loading) return loading;
    loading = (async () => {
      // Always read the configured PostgreSQL catalog; no demo database or
      // bundled snapshot is substituted when the database cannot be reached.
      const result = await query("SELECT points,synced_at FROM cdek_catalog WHERE id='ru'");
      const row = result.rows[0];
      cache = row ? { points: row.points, syncedAt: new Date(row.synced_at).toISOString() } : null;
      if ((!cache || Date.now() - Date.parse(cache.syncedAt) > CDEK_REFRESH_MS) && Date.now() >= retryAt) {
        try { cache = await saveCdekCatalog(query, await fetchCdekPoints()); }
        catch (error) {
          retryAt = Date.now() + 5 * 60_000;
          if (!cache || Date.now() - Date.parse(cache.syncedAt) > CDEK_MAX_AGE_MS) throw error;
        }
      }
      if (!cache || Date.now() - Date.parse(cache.syncedAt) > CDEK_MAX_AGE_MS) throw new CdekError();
      checkedAt = Date.now();
      return cache;
    })().finally(() => { loading = null; });
    return loading;
  };
}

export async function resolveCdekPoint(client, code) {
  const result = await client.query(`SELECT point FROM cdek_catalog,
    jsonb_array_elements(points) AS point
    WHERE id='ru' AND synced_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' AND point->>'code'=$1`, [code]);
  return result.rows[0]?.point || null;
}
