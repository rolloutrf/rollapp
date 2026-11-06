import { z } from "zod";
import { EXTERNAL_WISHLIST_PROVIDERS, externalWishlistLinks, externalWishlistUrl } from "../shared/external-wishlists.js";

export const profileWishlistLinksColumn = "ALTER TABLE users ADD COLUMN IF NOT EXISTS wishlist_links JSONB NOT NULL DEFAULT '{}'";

export const profileWishlistLinksPatchSchema = z.object(Object.fromEntries(
  EXTERNAL_WISHLIST_PROVIDERS.map((provider) => [
    provider.id,
    z.string().transform((value, context) => {
      const url = externalWishlistUrl(provider, value);
      if (url) return url;
      context.addIssue({ code: "custom", message: `Некорректная ссылка на вишлист ${provider.label}` });
      return z.NEVER;
    }).nullable().optional(),
  ]),
)).strict();

export function mergeProfileWishlistLinks(previous, patch) {
  return externalWishlistLinks({ ...previous, ...patch });
}
