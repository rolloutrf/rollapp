import { z } from "zod";
import { FRIEND_LOCATION_TTL_MINUTES } from "./friend-map-schema.js";

export const PROXIMITY_ENTER_METERS = 1000;
export const PROXIMITY_EXIT_METERS = 1200;
const LOCATION_UPDATE_MIN_SECONDS = 10;

export const friendMapPreferencesInput = z.object({
  shareLocation: z.boolean(),
  nearbyNotifications: z.boolean(),
}).strict().refine(value => value.shareLocation || !value.nearbyNotifications, {
  message: "Оповещения рядом требуют включённой геопозиции",
});

export const friendMapLocationInput = z.object({
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
  accuracyMeters: z.number().finite().min(0).max(5000),
}).strict();

function finiteCoordinate(value, minimum, maximum) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

export function normalizeCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = finiteCoordinate(value[0], -180, 180);
  const latitude = finiteCoordinate(value[1], -90, 90);
  return longitude === null || latitude === null ? null : [longitude, latitude];
}

export function coordinatesFromYandexMapsUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["yandex.ru", "yandex.com", "yandex.kz", "yandex.by", "yandex.ua", "ya.ru"].includes(host)) return null;
  for (const key of ["ll", "pt", "whatshere[point]"]) {
    const raw = url.searchParams.get(key)?.split(/[~,]/, 2);
    const coordinates = normalizeCoordinates(raw || []);
    if (coordinates) return coordinates;
  }
  return null;
}

export function yandexOrganizationId(value) {
  try { return /\/org\/[^/]+\/(\d+)(?:\/|$)/i.exec(new URL(String(value)).pathname)?.[1] || ""; }
  catch { return ""; }
}

function allowedUrl(value, hosts, path = () => true) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase()) && path(url.pathname)
      ? url.href
      : "";
  } catch { return ""; }
}

const yandexMapHosts = new Set(["yandex.ru", "www.yandex.ru", "yandex.com", "www.yandex.com",
  "yandex.kz", "www.yandex.kz", "yandex.by", "www.yandex.by", "yandex.ua", "www.yandex.ua"]);
const scoutPageHosts = new Set(["thescouts.ru", "www.thescouts.ru"]);
const scoutImageHosts = new Set(["scouts.storage.yandexcloud.net", "cdn.thescouts.ru", "33a50f66-scouts.s3.twcstorage.ru"]);

function projectMapListing(row) {
  const links = Array.isArray(row?.links) ? row.links : [];
  const yandex = links.find(link => link?.type === "yandex-maps"
    && allowedUrl(link.url, yandexMapHosts)) || null;
  const scout = links.find(link => link?.type === "the-scouts"
    && allowedUrl(link.url, scoutPageHosts, pathname => /^\/place\/[^/]+\/?$/u.test(pathname))) || null;
  const yandexImage = allowedUrl(
    (Array.isArray(yandex?.photoUrls) ? yandex.photoUrls : []).find(Boolean) || yandex?.imageUrl,
    new Set(["avatars.mds.yandex.net"]),
  );
  const scoutImage = allowedUrl(
    (Array.isArray(scout?.photoUrls) ? scout.photoUrls : []).find(Boolean) || scout?.imageUrl,
    scoutImageHosts,
    pathname => !pathname.toLowerCase().endsWith(".heic"),
  );
  return {
    ...row,
    addresses: Array.isArray(row?.addresses) ? row.addresses : [],
    imageUrl: yandexImage || scoutImage,
    yandex: yandex ? {
      id: typeof yandex.id === "string" ? yandex.id : "",
      url: allowedUrl(yandex.url, yandexMapHosts),
      address: typeof yandex.address === "string" ? yandex.address : "",
      coordinates: normalizeCoordinates(yandex.coordinates),
    } : null,
    scout: scout ? {
      url: allowedUrl(scout.url, scoutPageHosts, pathname => /^\/place\/[^/]+\/?$/u.test(pathname)),
      address: typeof scout.address === "string" ? scout.address : "",
      coordinates: normalizeCoordinates(scout.coordinates),
    } : null,
  };
}

export function distanceMeters(first, second) {
  const a = normalizeCoordinates(first);
  const b = normalizeCoordinates(second);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function nextProximityState({ distance, wasNearby = false, stale = false }) {
  const nearby = distance <= PROXIMITY_ENTER_METERS
    || (wasNearby && !stale && distance < PROXIMITY_EXIT_METERS);
  return { nearby, entered: nearby && (!wasNearby || stale) };
}

function mapPlace(row, source) {
  const projected = projectMapListing(row);
  const coordinates = normalizeCoordinates(projected.yandex?.coordinates || projected.scout?.coordinates);
  if (!coordinates) return null;
  return {
    id: `${source}:${projected.id}`,
    title: projected.name,
    subtitle: projected.yandex?.address || projected.scout?.address || projected.addresses?.[0] || projected.categoryLabel || "",
    url: projected.yandex?.url || projected.scout?.url || "",
    imageUrl: projected.imageUrl || "",
    coordinates,
    source,
  };
}

export function favoriteMapPlaces({ waitlistRows = [], wishRows = [], listingRows = [] }) {
  const places = [];
  const identities = new Set();
  const listingsByOrganization = new Map();
  for (const row of listingRows) {
    const projected = projectMapListing(row);
    const organizationId = projected.yandex?.id || yandexOrganizationId(projected.yandex?.url);
    if (organizationId) listingsByOrganization.set(organizationId, row);
  }
  const append = (place, identity) => {
    if (!place || identities.has(identity)) return;
    identities.add(identity);
    places.push(place);
  };
  for (const row of waitlistRows) {
    const organizationId = row.yandex?.id || yandexOrganizationId(row.yandex?.url)
      || yandexOrganizationId((row.links || []).find(link => link?.type === "yandex-maps")?.url);
    append(mapPlace(row, "catalog"), organizationId ? `org:${organizationId}` : `catalog:${row.id}`);
  }
  let unmappedCount = 0;
  for (const wish of wishRows) {
    const organizationId = yandexOrganizationId(wish.url);
    const listing = organizationId ? listingsByOrganization.get(organizationId) : null;
    const coordinates = coordinatesFromYandexMapsUrl(wish.url)
      || normalizeCoordinates(listing && projectMapListing(listing).yandex?.coordinates);
    if (!coordinates) { unmappedCount += 1; continue; }
    const projected = listing ? projectMapListing(listing) : null;
    const identity = organizationId ? `org:${organizationId}` : `wish:${wish.id}`;
    append({
      id: `wish:${wish.id}`,
      title: wish.title,
      subtitle: projected?.yandex?.address || projected?.addresses?.[0] || "Из списка «Места»",
      url: wish.url,
      imageUrl: wish.image_url || projected?.imageUrl || "",
      coordinates,
      source: "wishlist",
    }, identity);
  }
  return { places, unmappedCount };
}

const mapPreferences = row => ({
  shareLocation: row?.share_location === true,
  nearbyNotifications: row?.nearby_notifications === true,
});
const mapLocation = row => row ? {
  coordinates: [Number(row.longitude), Number(row.latitude)],
  accuracyMeters: Number(row.accuracy_meters),
  observedAt: row.observed_at,
  expiresAt: row.expires_at,
} : null;

async function saveDirectedProximity(client, {
  recipient, friend, distance, notificationsEnabled, forceStale = false,
}) {
  const { rows: [prior] } = await client.query(
    `SELECT nearby,updated_at < statement_timestamp()-interval '${FRIEND_LOCATION_TTL_MINUTES} minutes' AS stale
     FROM friend_map_proximity WHERE user_id=$1 AND friend_id=$2 FOR UPDATE`,
    [recipient.id, friend.id],
  );
  const state = nextProximityState({
    distance, wasNearby: prior?.nearby === true, stale: forceStale || prior?.stale === true,
  });
  let notified = false;
  if (state.entered && recipient.nearbyNotifications && notificationsEnabled) {
    const roundedDistance = distance < 100 ? "совсем рядом" : `примерно в ${Math.max(100, Math.round(distance / 100) * 100)} м`;
    const sourceId = `friend-map:${friend.id}`;
    const notification = await client.query(
      `INSERT INTO user_notifications (user_id,kind,source_id,title,scheduled_at,local_day,local_time)
       SELECT $1,'custom',$2,$3,statement_timestamp(),
         (statement_timestamp() AT TIME ZONE recipient.time_zone)::date,
         date_trunc('minute',statement_timestamp() AT TIME ZONE recipient.time_zone)::time
       FROM (SELECT COALESCE((SELECT time_zone FROM notification_preferences WHERE user_id=$1),'UTC') AS time_zone) recipient
       ON CONFLICT (user_id,kind,source_id,local_day,local_time) DO NOTHING`,
      [recipient.id, sourceId, `${friend.name} рядом — ${roundedDistance}`],
    );
    notified = notification.rowCount > 0;
  }
  await client.query(
    `INSERT INTO friend_map_proximity AS p
       (user_id,friend_id,nearby,last_distance_meters,last_entered_at,last_notified_at,updated_at)
     VALUES($1,$2,$3,$4,CASE WHEN $5 THEN statement_timestamp() END,
       CASE WHEN $6 THEN statement_timestamp() END,statement_timestamp())
     ON CONFLICT (user_id,friend_id) DO UPDATE SET nearby=EXCLUDED.nearby,
       last_distance_meters=EXCLUDED.last_distance_meters,
       last_entered_at=CASE WHEN $5 THEN statement_timestamp() ELSE p.last_entered_at END,
       last_notified_at=CASE WHEN $6 THEN statement_timestamp() ELSE p.last_notified_at END,
       updated_at=statement_timestamp()`,
    [recipient.id, friend.id, state.nearby, Math.max(0, Math.round(distance)), state.entered, notified],
  );
  return state.nearby;
}

export function registerFriendMapRoutes(app, {
  requireAuth, asyncRoute, query, transaction,
  available = () => true,
  mapsApiKey = "",
  notificationsEnabled = () => true,
}) {
  const base = "/api/friend-map";
  const privateMap = (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!available()) return res.status(503).json({ error: "Карта друзей ещё не подключена" });
    return next();
  };

  app.get(`${base}/status`, requireAuth, privateMap, asyncRoute(async (req, res) => {
    const { rows: [preferences] } = await query(
      "SELECT share_location,nearby_notifications FROM friend_map_preferences WHERE user_id=$1",
      [req.user.id],
    );
    res.json({
      preferences: mapPreferences(preferences),
      notificationsConfigured: notificationsEnabled(),
      locationTtlMinutes: FRIEND_LOCATION_TTL_MINUTES,
    });
  }));

  app.get(base, requireAuth, privateMap, asyncRoute(async (req, res) => {
    const [preferencesResult, locationResult, friendsResult, waitlistResult, wishesResult, listingsResult] = await Promise.all([
      query(`SELECT share_location,nearby_notifications FROM friend_map_preferences WHERE user_id=$1`, [req.user.id]),
      query(`SELECT longitude,latitude,accuracy_meters,observed_at,expires_at FROM friend_map_locations
        WHERE user_id=$1 AND expires_at>statement_timestamp()`, [req.user.id]),
      query(`SELECT u.id,u.username,u.name,u.avatar_url,l.longitude,l.latitude,l.accuracy_meters,l.observed_at,l.expires_at
        FROM friend_map_locations l
        JOIN friend_map_preferences p ON p.user_id=l.user_id AND p.share_location
        JOIN friend_map_preferences own ON own.user_id=$1 AND own.share_location
        JOIN follows outgoing ON outgoing.follower_id=$1 AND outgoing.following_id=l.user_id
        JOIN follows incoming ON incoming.follower_id=l.user_id AND incoming.following_id=$1
        JOIN users u ON u.id=l.user_id
        WHERE l.user_id<>$1 AND l.expires_at>statement_timestamp()
        ORDER BY lower(u.name),u.id`, [req.user.id]),
      query(`SELECT p.id,p.slug,p.name,p.category,p.category_label AS "categoryLabel",p.subcategory,
          p.description,p.addresses,p.links
        FROM place_waitlist w JOIN place_listings p ON p.id=w.place_id
        WHERE w.user_id=$1 ORDER BY lower(p.name),p.id`, [req.user.id]),
      query(`SELECT DISTINCT w.id,w.title,w.url,w.image_url
        FROM wishes w LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
        LEFT JOIN wishlists l ON l.id=ww.wishlist_id
        WHERE w.user_id=$1 AND w.status='active' AND (w.space='places' OR l.space='places')
        ORDER BY w.title,w.id`, [req.user.id]),
      query(`SELECT p.id,p.slug,p.name,p.category,p.category_label AS "categoryLabel",p.subcategory,
          p.description,p.addresses,p.links FROM place_listings p
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(p.links) link
          WHERE link->>'type'='yandex-maps' AND COALESCE(link->>'url','')<>'')`, []),
    ]);
    const preferences = mapPreferences(preferencesResult.rows[0]);
    const favorites = favoriteMapPlaces({
      waitlistRows: waitlistResult.rows,
      wishRows: wishesResult.rows,
      listingRows: listingsResult.rows,
    });
    const friends = preferences.shareLocation ? friendsResult.rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.name,
      avatarUrl: row.avatar_url,
      ...mapLocation(row),
    })) : [];
    res.json({
      configured: Boolean(mapsApiKey),
      mapsApiKey: mapsApiKey || "",
      notificationsConfigured: notificationsEnabled(),
      preferences,
      selfLocation: preferences.shareLocation ? mapLocation(locationResult.rows[0]) : null,
      friends,
      favoritePlaces: favorites.places,
      unmappedFavoriteCount: favorites.unmappedCount,
      locationTtlMinutes: FRIEND_LOCATION_TTL_MINUTES,
    });
  }));

  app.patch(`${base}/preferences`, requireAuth, privateMap, asyncRoute(async (req, res) => {
    const parsed = friendMapPreferencesInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Проверьте настройки геопозиции" });
    if (parsed.data.nearbyNotifications && !notificationsEnabled()) {
      return res.status(503).json({ error: "Сначала подключите оповещения Rollapp" });
    }
    const preferences = await transaction(async client => {
      const { rows: [saved] } = await client.query(
        `INSERT INTO friend_map_preferences AS p (user_id,share_location,nearby_notifications)
         VALUES($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET
           share_location=EXCLUDED.share_location,nearby_notifications=EXCLUDED.nearby_notifications,
           updated_at=CASE WHEN (p.share_location,p.nearby_notifications) IS DISTINCT FROM
             (EXCLUDED.share_location,EXCLUDED.nearby_notifications) THEN statement_timestamp() ELSE p.updated_at END
         RETURNING share_location,nearby_notifications`,
        [req.user.id, parsed.data.shareLocation, parsed.data.nearbyNotifications],
      );
      if (!saved.share_location) {
        await client.query("DELETE FROM friend_map_locations WHERE user_id=$1", [req.user.id]);
        await client.query("DELETE FROM friend_map_proximity WHERE user_id=$1 OR friend_id=$1", [req.user.id]);
      }
      return mapPreferences(saved);
    });
    res.json({ preferences });
  }));

  app.post(`${base}/location`, requireAuth, privateMap, asyncRoute(async (req, res) => {
    const parsed = friendMapLocationInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Не удалось проверить координаты" });
    const outcome = await transaction(async client => {
      const { rows: [preferences] } = await client.query(
        `SELECT share_location,nearby_notifications FROM friend_map_preferences WHERE user_id=$1 FOR KEY SHARE`,
        [req.user.id],
      );
      if (!preferences?.share_location) return { status: 403, error: "Сначала разрешите показывать геопозицию друзьям" };
      const { rows: [previous] } = await client.query(
        `SELECT longitude,latitude,
           observed_at>statement_timestamp()-interval '${LOCATION_UPDATE_MIN_SECONDS} seconds' AS too_recent,
           expires_at<=statement_timestamp() AS expired
         FROM friend_map_locations WHERE user_id=$1 FOR UPDATE`, [req.user.id],
      );
      if (previous?.too_recent === true) {
        return { status: 429, error: "Координаты обновляются слишком часто" };
      }
      const { longitude, latitude, accuracyMeters } = parsed.data;
      const { rows: [location] } = await client.query(
        `INSERT INTO friend_map_locations AS l
           (user_id,longitude,latitude,accuracy_meters,observed_at,expires_at)
         VALUES($1,$2,$3,$4,statement_timestamp(),statement_timestamp()+interval '${FRIEND_LOCATION_TTL_MINUTES} minutes')
         ON CONFLICT (user_id) DO UPDATE SET longitude=EXCLUDED.longitude,latitude=EXCLUDED.latitude,
           accuracy_meters=EXCLUDED.accuracy_meters,observed_at=EXCLUDED.observed_at,expires_at=EXCLUDED.expires_at
         RETURNING longitude,latitude,accuracy_meters,observed_at,expires_at`,
        [req.user.id, longitude, latitude, accuracyMeters],
      );
      const { rows: friends } = await client.query(
        `SELECT u.id,u.name,p.nearby_notifications,l.longitude,l.latitude
         FROM friend_map_locations l
         JOIN friend_map_preferences p ON p.user_id=l.user_id AND p.share_location
         JOIN follows outgoing ON outgoing.follower_id=$1 AND outgoing.following_id=l.user_id
         JOIN follows incoming ON incoming.follower_id=l.user_id AND incoming.following_id=$1
         JOIN users u ON u.id=l.user_id
         WHERE l.user_id<>$1 AND l.expires_at>statement_timestamp()
         ORDER BY u.id`, [req.user.id],
      );
      const nearby = [];
      for (const friend of friends) {
        const pairKey = [req.user.id, friend.id].sort().join(":");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`friend-map:${pairKey}`]);
        // Recheck every privacy input after the pair lock. KEY SHARE makes a
        // concurrent opt-out/unfollow wait, or observes it before any alert.
        const { rows: [currentFriend] } = await client.query(
          `SELECT p.nearby_notifications,l.longitude,l.latitude
           FROM friend_map_preferences p
           JOIN friend_map_locations l ON l.user_id=p.user_id AND l.expires_at>statement_timestamp()
           JOIN follows outgoing ON outgoing.follower_id=$1 AND outgoing.following_id=p.user_id
           JOIN follows incoming ON incoming.follower_id=p.user_id AND incoming.following_id=$1
           WHERE p.user_id=$2 AND p.share_location
           FOR KEY SHARE OF p,outgoing,incoming`,
          [req.user.id, friend.id],
        );
        if (!currentFriend) continue;
        const distance = distanceMeters([longitude, latitude], [currentFriend.longitude, currentFriend.latitude]);
        const selfNear = await saveDirectedProximity(client, {
          recipient: { id: req.user.id, nearbyNotifications: preferences.nearby_notifications },
          friend: { id: friend.id, name: friend.name }, distance,
          notificationsEnabled: notificationsEnabled(),
          forceStale: previous?.expired === true,
        });
        await saveDirectedProximity(client, {
          recipient: { id: friend.id, nearbyNotifications: currentFriend.nearby_notifications },
          friend: { id: req.user.id, name: req.user.name }, distance,
          notificationsEnabled: notificationsEnabled(),
          forceStale: previous?.expired === true,
        });
        if (selfNear) nearby.push({ friendId: friend.id, distanceMeters: Math.round(distance) });
      }
      return { location: mapLocation(location), nearby };
    });
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    res.json(outcome);
  }));
}
