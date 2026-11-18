import { api } from "../runtime/api.js";
import { retailerPreviewImageUrl } from "../../../shared/modules/media-import/retailer-previews.js";

import { wishPreviewImageUrl } from "../../../shared/modules/media-import/kinopoisk.js";
import { parseYouTubeVideoId, youtubeThumbnailPath, youtubeThumbnailUrl, youtubeThumbnailVideoId } from "../../../shared/modules/media-import/video-links.js";

export function wishCardImageSources(wish) {
  const savedOrDerived = wishPreviewImageUrl(wish);
  const videoId = savedOrDerived ? youtubeThumbnailVideoId(savedOrDerived) : parseYouTubeVideoId(wish.url);
  if (videoId) return {
    src: youtubeThumbnailPath(videoId),
    fallbackSrc: savedOrDerived || youtubeThumbnailUrl(videoId),
  };
  return { src: savedOrDerived, fallbackSrc: retailerPreviewImageUrl(wish.url) };
}

const previewBackfillRequests = new Map();

export function requestPreviewBackfill(userId) {
  if (!userId) return null;
  if (!previewBackfillRequests.has(userId)) {
    const request = { refreshClaimed: false, promise: null };
    request.promise = api.post("/wishes/backfill-previews", {}).catch((error) => {
      if (previewBackfillRequests.get(userId) === request) previewBackfillRequests.delete(userId);
      throw error;
    });
    previewBackfillRequests.set(userId, request);
  }
  return previewBackfillRequests.get(userId);
}

export function applyRetailerPreviewFallback(event, url) {
  const fallback = retailerPreviewImageUrl(url);
  const image = event.currentTarget;
  if (!fallback || image.getAttribute("src") === fallback) return;
  image.src = fallback;
}
