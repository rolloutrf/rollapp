import { retailerSupportsAutomaticMetadata as defaultRetailerSupportsAutomaticMetadata } from "../shared/retailer-previews.js";
import { isYandexMapsUrl as defaultIsYandexMapsUrl } from "./metadata.js";
import { isVkVideoUrl as defaultIsVkVideoUrl } from "../shared/video-links.js";

export const RETAILER_PREVIEW_BACKFILL_BUDGET = 24;
export const YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET = 64;
export const VK_VIDEO_PREVIEW_BACKFILL_BUDGET = 64;

export const PREVIEW_BACKFILL_KIND = Object.freeze({
  RETAILER: "retailer",
  YANDEX_MAPS: "yandex-maps",
  VK_VIDEO: "vk-video",
});

function hasMembership(row, camelCaseKey, snakeCaseKey) {
  return row?.[camelCaseKey] === true || row?.[snakeCaseKey] === true;
}

export function classifyPreviewBackfillCandidate(row, {
  retailerSupportsAutomaticMetadata = defaultRetailerSupportsAutomaticMetadata,
  isYandexMapsUrl = defaultIsYandexMapsUrl,
  isVkVideoUrl = defaultIsVkVideoUrl,
} = {}) {
  const url = row?.url;
  if (hasMembership(row, "isFood", "is_food") && retailerSupportsAutomaticMetadata(url)) {
    return PREVIEW_BACKFILL_KIND.RETAILER;
  }
  if (hasMembership(row, "isPlace", "is_place") && isYandexMapsUrl(url)) {
    return PREVIEW_BACKFILL_KIND.YANDEX_MAPS;
  }
  if (hasMembership(row, "isMedia", "is_media") && isVkVideoUrl(url)) {
    return PREVIEW_BACKFILL_KIND.VK_VIDEO;
  }
  return "";
}

export function selectPreviewBackfillCandidates(rows, dependencies = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Preview backfill rows must be an array");

  const selected = [];
  let retailerCount = 0;
  let yandexMapsCount = 0;
  let vkVideoCount = 0;

  for (const row of rows) {
    const previewBackfillKind = classifyPreviewBackfillCandidate(row, dependencies);
    if (previewBackfillKind === PREVIEW_BACKFILL_KIND.RETAILER) {
      if (retailerCount >= RETAILER_PREVIEW_BACKFILL_BUDGET) continue;
      retailerCount += 1;
    } else if (previewBackfillKind === PREVIEW_BACKFILL_KIND.YANDEX_MAPS) {
      if (yandexMapsCount >= YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET) continue;
      yandexMapsCount += 1;
    } else if (previewBackfillKind === PREVIEW_BACKFILL_KIND.VK_VIDEO) {
      if (vkVideoCount >= VK_VIDEO_PREVIEW_BACKFILL_BUDGET) continue;
      vkVideoCount += 1;
    } else {
      continue;
    }

    selected.push({ ...row, previewBackfillKind });
  }

  return selected;
}

function needsImageBackfill(imageUrl = "") {
  const value = String(imageUrl).trim();
  return !value || (/^https:\/\/.*\.okcdn\.ru\/getVideoPreview/i.test(value) && /[?&]fn=vid_s(?:&|$)/i.test(value));
}

export function previewBackfillPatch(candidate, metadata) {
  const currentImageUrl = String(candidate?.imageUrl ?? candidate?.image_url ?? "");
  const currentDescription = String(candidate?.description ?? "");
  if (!metadata || metadata.previewFallback === true) {
    return { imageUrl: currentImageUrl, description: currentDescription, changed: false };
  }

  const metadataImageUrl = String(metadata.imageUrl || "").trim();
  const imageUrl = needsImageBackfill(currentImageUrl) && /^https?:\/\//i.test(metadataImageUrl)
    ? metadataImageUrl
    : currentImageUrl;
  const metadataDescription = String(metadata.description || "").trim().slice(0, 1_000);
  const description = candidate?.previewBackfillKind === PREVIEW_BACKFILL_KIND.YANDEX_MAPS
    && !currentDescription.trim()
    && metadataDescription
    ? metadataDescription
    : currentDescription;

  return {
    imageUrl,
    description,
    changed: imageUrl !== currentImageUrl || description !== currentDescription,
  };
}

export async function resolvePreviewBackfillMetadata(candidate, {
  resolveRetailerMetadata,
  fetchPublicHtml,
  parseYandexMapsMetadata,
  resolveVkVideoMetadata,
}) {
  if (candidate?.previewBackfillKind === PREVIEW_BACKFILL_KIND.RETAILER) {
    if (typeof resolveRetailerMetadata !== "function") {
      throw new TypeError("resolveRetailerMetadata must be a function");
    }
    return resolveRetailerMetadata(candidate.url, { allowBrowser: false });
  }

  if (candidate?.previewBackfillKind === PREVIEW_BACKFILL_KIND.YANDEX_MAPS) {
    if (typeof fetchPublicHtml !== "function") throw new TypeError("fetchPublicHtml must be a function");
    if (typeof parseYandexMapsMetadata !== "function") {
      throw new TypeError("parseYandexMapsMetadata must be a function");
    }
    const { html, url } = await fetchPublicHtml(candidate.url);
    return parseYandexMapsMetadata(html, url);
  }

  if (candidate?.previewBackfillKind === PREVIEW_BACKFILL_KIND.VK_VIDEO) {
    if (typeof resolveVkVideoMetadata !== "function") {
      throw new TypeError("resolveVkVideoMetadata must be a function");
    }
    return resolveVkVideoMetadata(candidate.url);
  }

  throw new TypeError("Unknown preview backfill candidate kind");
}
