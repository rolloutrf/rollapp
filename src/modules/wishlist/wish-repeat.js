export function buildRepeatWishPayload(wish, resolvedSpace) {
  return {
    title: wish.title,
    description: wish.description || "",
    url: wish.url || "",
    fundraisingUrl: wish.fundraisingUrl || "",
    vehicleMake: wish.vehicleMake || "",
    vehicleModel: wish.vehicleModel || "",
    imageUrl: wish.imageUrl || "",
    price: wish.price,
    currency: wish.currency,
    priority: wish.priority,
    privacy: wish.privacy,
    allowMultiple: wish.allowMultiple,
    eventDate: wish.eventDate || null,
    space: resolvedSpace,
    listIds: [...(wish.listIds || [])],
  };
}
