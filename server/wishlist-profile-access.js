import { PROFILE_SPACES } from "../shared/profile-links.js";

export function wishlistProfileGrant(rows) {
  const sections = new Set(rows.map(({ section }) => section));
  return { full: sections.has("wishlist"), spaces: PROFILE_SPACES.filter((space) => sections.has(space)) };
}

// An explicit category grant can reveal private wishes in that category.
// For old wishes without a category, membership in a granted list is required.
// A private list in an ungranted category still protects its member wishes.
export function wishlistWishVisibility({ includePrivate, grantedSpaces }) {
  if (includePrivate) return "";
  return `
    AND (
      (w.privacy <> 'private' AND w.id NOT IN (
        SELECT secret_ww.wish_id FROM wishlist_wishes secret_ww
        JOIN wishlists secret_list ON secret_list.id=secret_ww.wishlist_id
        WHERE secret_list.privacy='private'
      ))
      ${grantedSpaces.length ? `OR (
        (w.space=ANY($2::text[]) OR (w.space IS NULL AND EXISTS (
          SELECT 1 FROM wishlist_wishes ww JOIN wishlists l ON l.id=ww.wishlist_id
          WHERE ww.wish_id=w.id AND l.user_id=w.user_id AND l.space=ANY($2::text[])
        )))
        AND NOT EXISTS (
          SELECT 1 FROM wishlist_wishes ww JOIN wishlists l ON l.id=ww.wishlist_id
          WHERE ww.wish_id=w.id AND l.privacy='private' AND (l.space=ANY($2::text[])) IS NOT TRUE
        )
      )` : ""}
    )`;
}
