export function canAccessPrivateSpheres(user) {
  return user?.canDiscoverSpheres === true;
}

export function serviceSwitcherItemsForUser(items, user) {
  if (canAccessPrivateSpheres(user)) return items;
  return items.filter((item) => item.id === "wishlist");
}
