import { youtubeThumbnailPath, youtubeThumbnailUrl } from "../../../shared/modules/media-import/video-links.js";
import { createRateLimit } from "../runtime/rate-limit.js";
import { fetchPublicImage } from "./metadata-fetch.js";

export function registerYouTubeThumbnailRoutes(app, { fetchImage = fetchPublicImage } = {}) {
  const recentImages = new Map();
  const pending = new Map();
  const ttl = 60 * 60 * 1000;
  const limitMisses = createRateLimit({ windowMs: 60_000, max: 180 });

  app.get("/api/media/youtube-thumbnail/:id", (req, res, next) => {
    const id = req.params.id;
    if (!youtubeThumbnailPath(id)) return res.sendStatus(404);
    if (recentImages.get(id)?.expiresAt > Date.now() || pending.has(id)) return next();
    return limitMisses(req, res, next);
  }, async (req, res) => {
    const id = req.params.id;
    let image = recentImages.get(id);
    if (!image || image.expiresAt <= Date.now()) {
      if (!pending.has(id)) {
        if (pending.size >= 32) return res.set("Cache-Control", "no-store").sendStatus(503);
        pending.set(id, fetchImage(youtubeThumbnailUrl(id), {
          timeoutMs: 5000,
          maxBytes: 256_000,
          maxRedirects: 0,
        }).then(({ body, mimeType }) => {
          const entry = { body, mimeType, expiresAt: Date.now() + ttl };
          recentImages.delete(id);
          recentImages.set(id, entry);
          if (recentImages.size > 128) recentImages.delete(recentImages.keys().next().value);
          return entry;
        }).finally(() => pending.delete(id)));
      }
      try {
        image = await pending.get(id);
      } catch {
        return res.set("Cache-Control", "no-store").sendStatus(502);
      }
    }
    return res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
      .type(image.mimeType).send(image.body);
  });
}
