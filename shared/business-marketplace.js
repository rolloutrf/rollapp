export const BUSINESS_MARKETPLACE_SPHERES = ["identity", "career", "education", "health", "contacts"];

export const BUSINESS_MARKETPLACE_KINDS = ["store"];

export const BUSINESS_MARKETPLACE_KIND_LABELS = {
  store: "За роллы",
};

export function isBusinessMarketplaceSphere(value) {
  return BUSINESS_MARKETPLACE_SPHERES.includes(value);
}

export function businessMarketplacePath(sphere, kind = "store") {
  if (!isBusinessMarketplaceSphere(sphere) || kind !== "store") return null;
  return `/app/spheres/${sphere}/business/store`;
}
