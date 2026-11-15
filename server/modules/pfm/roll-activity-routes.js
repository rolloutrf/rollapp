import { createRateLimit } from "../runtime/rate-limit.js";
import { readRollActivity, readRollActivityEntries, rollActivityEntriesQuery, rollActivityQuery } from "./roll-activity.js";

export function registerRollActivityRoutes(app, { requireAuth, transaction }) {
  const limit = createRateLimit({ windowMs: 60_000, max: 60, key: (req) => req.user.id });
  function handle(schema, read) {
    return async (req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "Проверьте период и параметры выписки", code: "INVALID_ROLL_ACTIVITY_QUERY" });
      try {
        const result = await transaction(async (client) => {
          await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
          return read(client, req.user.id, parsed.data);
        });
        res.json(result);
      } catch (error) { next(error); }
    };
  }
  app.get("/api/rolls/activity", requireAuth, limit, handle(rollActivityQuery, readRollActivity));
  app.get("/api/rolls/activity/entries", requireAuth, limit, handle(rollActivityEntriesQuery, readRollActivityEntries));
}
