export const WISHLIST_SPACES = [
  { id: "products", label: "Товары" }, { id: "places", label: "Места" },
  { id: "events", label: "События" }, { id: "media", label: "Медиа" },
  { id: "food", label: "Еда" }, { id: "transport", label: "Транспорт" },
];
export const WISHLIST_SPACE_IDS = WISHLIST_SPACES.map(({ id }) => id);
export function canManageWishlistSpace(account, space) {
  return (account?.accountType ?? account?.account_type) === "business"
    && (account?.businessCategory ?? account?.business_category) === "seller"
    && WISHLIST_SPACE_IDS.includes(space)
    && (!(account?.sellerSpace ?? account?.seller_space) || (account.sellerSpace ?? account.seller_space) === space);
}
