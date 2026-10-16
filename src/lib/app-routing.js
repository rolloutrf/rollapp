export const APP_WISH_CATALOG_PATH = "/app/wishes/catalog";
export const APP_CATALOG_ITEM_ROUTE_PATH = `${APP_WISH_CATALOG_PATH}/item/:itemId`;
export const APP_STORE_PATH = "/app/store";
export const APP_ORDERS_PATH = "/app/orders";
export const APP_SHELL_ROUTE_PATH = "/app/*";
export const PUBLIC_WISH_ROUTE_PATH = "/:username/wishes/:wishId";

export { businessMarketplacePath } from "../../shared/business-marketplace.js";

export function isPublicWishDetailPath(pathname) {
  return (!pathname.startsWith("/app/") && /^\/[^/]+\/wishes\/[^/]+\/?$/.test(pathname))
    || /^\/s\/[^/]+\/wishes\/[^/]+\/?$/.test(pathname);
}
