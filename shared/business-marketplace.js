export const BUSINESS_MARKETPLACE_SPHERES = ["identity", "career", "education", "health", "contacts"];

export const BUSINESS_MARKETPLACE_KINDS = ["catalog", "store"];

export const BUSINESS_MARKETPLACE_KIND_LABELS = {
  catalog: "Предложения",
  store: "За роллы",
};

export function isBusinessMarketplaceSphere(value) {
  return BUSINESS_MARKETPLACE_SPHERES.includes(value);
}

export function businessMarketplacePath(sphere, kind = "catalog") {
  const safeSphere = isBusinessMarketplaceSphere(sphere) ? sphere : "identity";
  const safeKind = BUSINESS_MARKETPLACE_KINDS.includes(kind) ? kind : "catalog";
  return `/app/spheres/${safeSphere}/business/${safeKind}`;
}
