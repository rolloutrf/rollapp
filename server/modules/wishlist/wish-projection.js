export function formatEventDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // node-pg парсит DATE как полночь в локальной таймзоне, pg-mem — как полночь в UTC.
    // Выбираем компоненты даты без сдвига: UTC-полночь → UTC-компоненты, иначе локальные.
    const isUtcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    const year = isUtcMidnight ? value.getUTCFullYear() : value.getFullYear();
    const month = (isUtcMidnight ? value.getUTCMonth() : value.getMonth()) + 1;
    const day = isUtcMidnight ? value.getUTCDate() : value.getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

export function mapWish(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.image_url,
    fundraisingUrl: row.fundraising_url ?? "",
    vehicleMake: row.vehicle_make ?? "",
    vehicleModel: row.vehicle_model ?? "",
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    priority: Number(row.priority),
    privacy: row.privacy,
    allowMultiple: row.allow_multiple,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    eventDate: formatEventDate(row.event_date),
    space: row.space ?? null,
    createdAt: row.created_at,
    reservationCount: Number(row.reservation_count || 0),
    reservedByMe: Boolean(row.reserved_by_me),
    likedByMe: Boolean(row.liked_by_me),
    listIds: row.list_ids || [],
  };
}
