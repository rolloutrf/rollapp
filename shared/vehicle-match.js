import { productScore } from "./product-match.js";

export const VEHICLE_MARKETPLACE_IDS = Object.freeze(["auto-ru", "avito-auto", "drom"]);

const VEHICLE_MARKETPLACE_ID_SET = new Set(VEHICLE_MARKETPLACE_IDS);

export function normalizeVehicleLabel(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsLabel(text, label) {
  const normalizedText = normalizeVehicleLabel(text);
  const normalizedLabel = normalizeVehicleLabel(label);
  return Boolean(normalizedText && normalizedLabel && ` ${normalizedText} `.includes(` ${normalizedLabel} `));
}

export function isVehicleMarketplaceId(value) {
  return VEHICLE_MARKETPLACE_ID_SET.has(String(value || ""));
}

export function vehicleOfferMatchesWish(wish, offer) {
  if (offer?.source) return true;
  if (!isVehicleMarketplaceId(offer?.marketplaceId)) return false;
  const title = String(offer?.title || "");
  const make = String(wish?.vehicleMake || "").trim();
  const model = String(wish?.vehicleModel || "").trim();
  if (make && !containsLabel(title, make)) return false;
  if (model && !containsLabel(title, model)) return false;
  if (make || model) return true;
  return productScore(wish?.title, title) >= 70;
}
