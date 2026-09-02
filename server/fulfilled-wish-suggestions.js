import { catalogIdentityKey, canonicalCatalogUrl } from "./wish-catalog.js";

const participantFromRow = (row) => ({
  id: row.owner_id,
  username: row.owner_username,
  name: row.owner_name,
  avatarUrl: row.owner_avatar_url || "",
  wishId: row.id,
});

const directIdentityKeys = (row) => {
  const keys = new Set([catalogIdentityKey(row)]);
  const url = canonicalCatalogUrl(row.url);
  if (url) keys.add(`${row.space || "products"}:url:${url}`);
  if (row.source_wish_id) keys.add(`source:${row.source_wish_id}`);
  if (row.id) keys.add(`source:${row.id}`);
  return keys;
};

export function buildFulfilledWishSuggestions(
  fulfilledWishes = [],
  publicActiveWishes = [],
  { maxWishes = 48, maxParticipants = 8 } = {},
) {
  const candidatesByKey = new Map();
  for (const candidate of publicActiveWishes) {
    if (!candidate.owner_id) continue;
    for (const key of directIdentityKeys(candidate)) {
      if (!candidatesByKey.has(key)) candidatesByKey.set(key, []);
      candidatesByKey.get(key).push(candidate);
    }
  }

  const suggestions = [];
  const seenWishKeys = new Set();
  for (const wish of fulfilledWishes) {
    const primaryKey = catalogIdentityKey(wish);
    if (seenWishKeys.has(primaryKey)) continue;
    seenWishKeys.add(primaryKey);

    const matchingRows = [];
    const seenCandidateWishes = new Set();
    for (const key of directIdentityKeys(wish)) {
      for (const candidate of candidatesByKey.get(key) || []) {
        if (seenCandidateWishes.has(candidate.id)) continue;
        seenCandidateWishes.add(candidate.id);
        matchingRows.push(candidate);
      }
    }

    const participants = [];
    const seenParticipants = new Set();
    for (const candidate of matchingRows) {
      if (seenParticipants.has(candidate.owner_id)) continue;
      seenParticipants.add(candidate.owner_id);
      participants.push(participantFromRow(candidate));
    }
    if (!participants.length) continue;

    suggestions.push({
      wishId: wish.id,
      title: wish.title,
      imageUrl: wish.image_url || "",
      space: wish.space || "products",
      participantCount: participants.length,
      participants: participants.slice(0, maxParticipants),
    });
    if (suggestions.length >= maxWishes) break;
  }

  return suggestions;
}
