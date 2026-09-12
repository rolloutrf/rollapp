import { CDEK_REFRESH_MS, CdekError, createCdekCatalog, listCdekCities, searchCdekPoints } from "./cdek.js";
import { createRateLimit } from "./rate-limit.js";

export function registerCdekRoutes(app, { requireAuth, query }) {
  const catalog = createCdekCatalog(query);
  const limit = createRateLimit({ windowMs: 60_000, max: 90, key: (req) => req.user.id });
  app.get("/api/delivery/cdek/cities", requireAuth, limit, async (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const { points } = await catalog();
      res.json({ cities: listCdekCities(points) });
    } catch (error) {
      if (error instanceof CdekError) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
    }
  });
  app.get("/api/delivery/cdek/points", requireAuth, limit, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const cityCode = typeof req.query.cityCode === "string" ? req.query.cityCode.trim() : "";
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    const pageSize = req.query.limit === undefined ? 30 : Number(req.query.limit);
    if ((!cityCode && search.length < 2) || search.length > 120 || cityCode.length > 40 || (req.query.cityCode !== undefined && !cityCode) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 30) {
      return res.status(400).json({ error: "Выберите город и введите адрес длиной до 120 символов." });
    }
    try {
      const { points, syncedAt } = await catalog();
      res.json({ ...searchCdekPoints(points, search, offset, cityCode, pageSize), syncedAt, stale: Date.now() - Date.parse(syncedAt) > CDEK_REFRESH_MS });
    } catch (error) {
      if (error instanceof CdekError) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
    }
  });
}
