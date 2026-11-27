import assert from "node:assert/strict";
import test from "node:test";
import {
  coordinatesFromYandexMapsUrl,
  distanceMeters,
  favoriteMapPlaces,
  friendMapLocationInput,
  friendMapPreferencesInput,
  nextProximityState,
  registerFriendMapRoutes,
  yandexOrganizationId,
} from "./friend-map.js";
import { friendMapSchema } from "./friend-map-schema.js";

const yandexLink = (id, coordinates) => ({
  type: "yandex-maps",
  id,
  url: `https://yandex.ru/maps/org/place/${id}/`,
  address: "Санкт-Петербург, Невский проспект, 1",
  coordinates,
});

test("friend map schema keeps consent, expiring coordinates and directed proximity separate", () => {
  assert.match(friendMapSchema, /CREATE TABLE IF NOT EXISTS friend_map_preferences/);
  assert.match(friendMapSchema, /CHECK \(share_location OR NOT nearby_notifications\)/);
  assert.match(friendMapSchema, /CREATE TABLE IF NOT EXISTS friend_map_locations/);
  assert.match(friendMapSchema, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(friendMapSchema, /CREATE TABLE IF NOT EXISTS friend_map_proximity/);
  assert.match(friendMapSchema, /PRIMARY KEY \(user_id, friend_id\)/);
});

test("location and consent payloads are strict and bounded", () => {
  assert.deepEqual(friendMapPreferencesInput.parse({ shareLocation: true, nearbyNotifications: true }), {
    shareLocation: true, nearbyNotifications: true,
  });
  assert.equal(friendMapPreferencesInput.safeParse({ shareLocation: false, nearbyNotifications: true }).success, false);
  assert.equal(friendMapPreferencesInput.safeParse({ shareLocation: true, nearbyNotifications: false, extra: true }).success, false);
  assert.equal(friendMapLocationInput.safeParse({ longitude: 30.3, latitude: 59.9, accuracyMeters: 12 }).success, true);
  assert.equal(friendMapLocationInput.safeParse({ longitude: 181, latitude: 59.9, accuracyMeters: 12 }).success, false);
  assert.equal(friendMapLocationInput.safeParse({ longitude: 30.3, latitude: 59.9, accuracyMeters: 5001 }).success, false);
});

test("Yandex coordinates and organization identity are parsed without accepting foreign hosts", () => {
  assert.deepEqual(coordinatesFromYandexMapsUrl("https://yandex.ru/maps/?ll=30.315%2C59.939"), [30.315, 59.939]);
  assert.deepEqual(coordinatesFromYandexMapsUrl("https://yandex.ru/maps/?whatshere%5Bpoint%5D=37.61%2C55.75"), [37.61, 55.75]);
  assert.equal(coordinatesFromYandexMapsUrl("https://example.test/maps/?ll=30,59"), null);
  assert.equal(yandexOrganizationId("https://yandex.ru/maps/org/avrora/1089479202/"), "1089479202");
});

test("distance and hysteresis create one entry transition around one kilometre", () => {
  const roughlyKilometre = distanceMeters([30.3, 59.9], [30.3, 59.909]);
  assert(roughlyKilometre > 990 && roughlyKilometre < 1010);
  assert.deepEqual(nextProximityState({ distance: 900 }), { nearby: true, entered: true });
  assert.deepEqual(nextProximityState({ distance: 1100, wasNearby: true }), { nearby: true, entered: false });
  assert.deepEqual(nextProximityState({ distance: 1250, wasNearby: true }), { nearby: false, entered: false });
  assert.deepEqual(nextProximityState({ distance: 900, wasNearby: true, stale: true }), { nearby: true, entered: true });
});

test("favorite places combine the catalog waitlist and Wishlist without duplicating one Yandex organization", () => {
  const listing = {
    id: "place-1", name: "Аврора", categoryLabel: "Кинотеатр", addresses: ["Невский, 60"],
    links: [yandexLink("1089479202", [30.335, 59.934])],
  };
  const result = favoriteMapPlaces({
    waitlistRows: [listing],
    listingRows: [listing],
    wishRows: [
      { id: "wish-1", title: "Аврора", url: "https://yandex.ru/maps/org/avrora/1089479202/", image_url: "" },
      { id: "wish-2", title: "Точка", url: "https://yandex.ru/maps/?ll=30.2%2C59.8", image_url: "" },
      { id: "wish-3", title: "Без координат", url: "https://yandex.ru/maps/", image_url: "" },
    ],
  });
  assert.deepEqual(result.places.map(place => place.title), ["Аврора", "Точка"]);
  assert.equal(result.unmappedCount, 1);
});

test("favorite places use The Scouts coordinates when Yandex metadata is absent", () => {
  const listing = {
    id: "scout-place", name: "Кофейня", categoryLabel: "Кофейня", addresses: ["Невский, 1"],
    links: [{
      type: "the-scouts", id: "42", url: "https://thescouts.ru/place/coffee/",
      address: "Невский, 1", coordinates: [30.32, 59.93],
      photoUrls: ["https://scouts.storage.yandexcloud.net/production/coffee.jpg"],
    }],
  };
  const result = favoriteMapPlaces({ waitlistRows: [listing] });
  assert.equal(result.places.length, 1);
  assert.deepEqual(result.places[0].coordinates, [30.32, 59.93]);
  assert.equal(result.places[0].url, "https://thescouts.ru/place/coffee/");
});

function routeFixture({ available = true, notifications = true, onQuery } = {}) {
  const routes = new Map();
  const calls = [];
  const app = Object.fromEntries(["get", "patch", "post"].map(method => [method, (path, ...handlers) => {
    routes.set(`${method} ${path}`, handlers);
  }]));
  const query = async (sql, args) => {
    calls.push({ sql, args });
    const override = await onQuery?.(sql, args);
    if (override !== undefined) return override;
    if (sql.includes("INSERT INTO friend_map_preferences")) {
      return { rows: [{ share_location: args[1], nearby_notifications: args[2] }] };
    }
    if (sql.includes("FROM friend_map_preferences WHERE")) return { rows: [{ share_location: true, nearby_notifications: true }] };
    if (sql.includes("FROM friend_map_locations") && sql.includes("user_id=$1 AND")) return { rows: [] };
    return { rows: [] };
  };
  const client = { query };
  registerFriendMapRoutes(app, {
    requireAuth(req, res, next) { return req.user ? next() : res.sendStatus(401); },
    asyncRoute: handler => handler,
    query,
    transaction: callback => callback(client),
    available: () => available,
    mapsApiKey: "browser-key",
    notificationsEnabled: () => notifications,
  });
  async function call(route, { user, body } = {}) {
    const handlers = routes.get(route);
    const result = { status: 200, headers: {} };
    const req = { user, body };
    const res = {
      set(name, value) { result.headers[name] = value; return this; },
      status(value) { result.status = value; return this; },
      sendStatus(value) { result.status = value; },
      json(value) { result.body = value; },
    };
    const visit = index => handlers[index](req, res, () => visit(index + 1));
    await visit(0);
    return result;
  }
  return { call, calls };
}

test("friend map endpoints require a session and an installed schema", async () => {
  const ready = routeFixture();
  assert.equal((await ready.call("get /api/friend-map")).status, 401);
  const unavailable = routeFixture({ available: false });
  const result = await unavailable.call("get /api/friend-map", { user: { id: "owner" } });
  assert.equal(result.status, 503);
  assert.equal(unavailable.calls.length, 0);
});

test("friend locations require both follow directions and the viewer's own active consent", async () => {
  const fixture = routeFixture();
  const result = await fixture.call("get /api/friend-map", { user: { id: "owner" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.configured, true);
  const friends = fixture.calls.find(({ sql }) => sql.includes("JOIN users u ON u.id=l.user_id"));
  assert.match(friends.sql, /own\.user_id=\$1 AND own\.share_location/);
  assert.match(friends.sql, /outgoing\.follower_id=\$1 AND outgoing\.following_id=l\.user_id/);
  assert.match(friends.sql, /incoming\.follower_id=l\.user_id AND incoming\.following_id=\$1/);
});

test("disabling sharing removes the exact location and both directions of proximity state", async () => {
  const fixture = routeFixture();
  const result = await fixture.call("patch /api/friend-map/preferences", {
    user: { id: "owner" }, body: { shareLocation: false, nearbyNotifications: false },
  });
  assert.equal(result.status, 200);
  assert(fixture.calls.some(({ sql, args }) => sql.includes("DELETE FROM friend_map_locations") && args[0] === "owner"));
  assert(fixture.calls.some(({ sql }) => sql.includes("DELETE FROM friend_map_proximity WHERE user_id=$1 OR friend_id=$1")));
});

test("nearby alerts cannot be enabled when the Rollapp notification channel is unavailable", async () => {
  const fixture = routeFixture({ notifications: false });
  const result = await fixture.call("patch /api/friend-map/preferences", {
    user: { id: "owner" }, body: { shareLocation: true, nearbyNotifications: true },
  });
  assert.equal(result.status, 503);
  assert.equal(fixture.calls.length, 0);
});

test("a fresh location creates one directed nearby transition and notification for each consenting friend", async () => {
  const fixture = routeFixture({
    onQuery(sql) {
      if (sql.includes("FROM friend_map_preferences WHERE user_id=$1 FOR KEY SHARE")) {
        return { rows: [{ share_location: true, nearby_notifications: true }] };
      }
      if (sql.includes("AS too_recent")) return { rows: [] };
      if (sql.includes("INSERT INTO friend_map_locations")) return { rows: [{
        longitude: 30.3, latitude: 59.9, accuracy_meters: 12,
        observed_at: "2026-11-26T12:00:00Z", expires_at: "2026-11-26T12:10:00Z",
      }] };
      if (sql.includes("SELECT u.id,u.name,p.nearby_notifications")) return { rows: [{
        id: "friend", name: "Друг", nearby_notifications: true, longitude: 30.3, latitude: 59.905,
      }] };
      if (sql.includes("FOR KEY SHARE OF p,outgoing,incoming")) return { rows: [{
        nearby_notifications: true, longitude: 30.3, latitude: 59.905,
      }] };
      if (sql.includes("SELECT nearby,updated_at")) return { rows: [] };
      if (sql.includes("INSERT INTO user_notifications")) return { rowCount: 1, rows: [] };
      return undefined;
    },
  });
  const result = await fixture.call("post /api/friend-map/location", {
    user: { id: "owner", name: "Владелец" },
    body: { longitude: 30.3, latitude: 59.9, accuracyMeters: 12 },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.location.accuracyMeters, 12);
  assert.deepEqual(result.body.nearby.map(({ friendId }) => friendId), ["friend"]);
  assert(result.body.nearby[0].distanceMeters < 1000);
  const notifications = fixture.calls.filter(({ sql }) => sql.includes("INSERT INTO user_notifications"));
  assert.deepEqual(notifications.map(({ args }) => args.slice(0, 2)), [
    ["owner", "friend-map:friend"],
    ["friend", "friend-map:owner"],
  ]);
  assert.match(notifications[0].args[2], /^Друг рядом/);
  assert.match(notifications[1].args[2], /^Владелец рядом/);
  assert.equal(fixture.calls.filter(({ sql }) => sql.includes("INSERT INTO friend_map_proximity AS p")).length, 2);
});

test("a location that expired before returning nearby opens a new transition for both recipients", async () => {
  const fixture = routeFixture({
    onQuery(sql) {
      if (sql.includes("FROM friend_map_preferences WHERE user_id=$1 FOR KEY SHARE")) {
        return { rows: [{ share_location: true, nearby_notifications: true }] };
      }
      if (sql.includes("AS too_recent")) return { rows: [{ too_recent: false, expired: true }] };
      if (sql.includes("INSERT INTO friend_map_locations")) return { rows: [{
        longitude: 30.3, latitude: 59.9, accuracy_meters: 12,
        observed_at: "2026-11-27T12:00:00Z", expires_at: "2026-11-27T12:10:00Z",
      }] };
      if (sql.includes("SELECT u.id,u.name,p.nearby_notifications")) return { rows: [{
        id: "friend", name: "Друг", nearby_notifications: true, longitude: 30.3, latitude: 59.905,
      }] };
      if (sql.includes("FOR KEY SHARE OF p,outgoing,incoming")) return { rows: [{
        nearby_notifications: true, longitude: 30.3, latitude: 59.905,
      }] };
      if (sql.includes("SELECT nearby,updated_at")) return { rows: [{ nearby: true, stale: false }] };
      if (sql.includes("INSERT INTO user_notifications")) return { rowCount: 1, rows: [] };
      return undefined;
    },
  });
  const result = await fixture.call("post /api/friend-map/location", {
    user: { id: "owner", name: "Владелец" },
    body: { longitude: 30.3, latitude: 59.9, accuracyMeters: 12 },
  });
  assert.equal(result.status, 200);
  assert.equal(fixture.calls.filter(({ sql }) => sql.includes("INSERT INTO user_notifications")).length, 2);
});

test("a friend who revokes sharing during an update is rechecked before proximity state or alerts", async () => {
  const fixture = routeFixture({
    onQuery(sql) {
      if (sql.includes("FROM friend_map_preferences WHERE user_id=$1 FOR KEY SHARE")) {
        return { rows: [{ share_location: true, nearby_notifications: true }] };
      }
      if (sql.includes("AS too_recent")) return { rows: [] };
      if (sql.includes("INSERT INTO friend_map_locations")) return { rows: [{
        longitude: 30.3, latitude: 59.9, accuracy_meters: 12,
        observed_at: "2026-11-27T12:00:00Z", expires_at: "2026-11-27T12:10:00Z",
      }] };
      if (sql.includes("SELECT u.id,u.name,p.nearby_notifications")) return { rows: [{
        id: "friend", name: "Друг", nearby_notifications: true, longitude: 30.3, latitude: 59.905,
      }] };
      if (sql.includes("FOR KEY SHARE OF p,outgoing,incoming")) return { rows: [] };
      return undefined;
    },
  });
  const result = await fixture.call("post /api/friend-map/location", {
    user: { id: "owner", name: "Владелец" },
    body: { longitude: 30.3, latitude: 59.9, accuracyMeters: 12 },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.nearby, []);
  assert.equal(fixture.calls.some(({ sql }) => sql.includes("INSERT INTO user_notifications")), false);
  assert.equal(fixture.calls.some(({ sql }) => sql.includes("INSERT INTO friend_map_proximity AS p")), false);
});
