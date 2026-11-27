import assert from "node:assert/strict";
import test from "node:test";
import { DataType, newDb } from "pg-mem";
import { registerFriendMapRoutes } from "./friend-map.js";
import { friendMapSchema } from "./friend-map-schema.js";

async function fixture() {
  let clock = new Date("2026-11-27T12:00:00Z");
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "statement_timestamp", returns: DataType.timestamptz, implementation: () => clock,
  });
  memory.public.registerFunction({
    name: "hashtextextended", args: [DataType.text, DataType.integer], returns: DataType.bigint,
    implementation: () => 1,
  });
  memory.public.registerFunction({
    name: "pg_advisory_xact_lock", args: [DataType.bigint], returns: DataType.integer,
    implementation: () => 1,
  });
  const adapter = memory.adapters.createPg();
  const client = new adapter.Client();
  await client.connect();
  await client.query(`CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT ''
  ); CREATE TABLE follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (follower_id,following_id)
  ); CREATE TABLE notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    time_zone TEXT NOT NULL DEFAULT 'UTC'
  ); CREATE TABLE user_notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    local_day DATE NOT NULL,
    local_time TIME NOT NULL,
    read_at TIMESTAMPTZ,
    UNIQUE (user_id,kind,source_id,local_day,local_time)
  );`);
  await client.query(friendMapSchema);
  await client.query(`INSERT INTO users (id,username,name) VALUES
    ('owner','owner','Владелец'),('friend','friend','Анна');
    INSERT INTO follows (follower_id,following_id) VALUES ('owner','friend'),('friend','owner');
    INSERT INTO friend_map_preferences (user_id,share_location,nearby_notifications)
      VALUES ('owner',true,true),('friend',true,true);
    INSERT INTO friend_map_locations (user_id,longitude,latitude,accuracy_meters,observed_at,expires_at)
      VALUES ('friend',30.3,59.905,10,statement_timestamp(),statement_timestamp()+interval '10 minutes');`);
  const routes = new Map();
  const app = Object.fromEntries(["get", "patch", "post"].map(method => [method, (path, ...handlers) => {
    routes.set(`${method} ${path}`, handlers);
  }]));
  const query = (sql, args) => {
    // pg-mem does not implement PostgreSQL's `timestamptz AT TIME ZONE text`.
    // Keep every map/proximity query real and replace only that projection with
    // its UTC equivalent; the production statement is covered by the route unit.
    if (sql.includes("INSERT INTO user_notifications")) {
      const iso = clock.toISOString();
      return client.query(`INSERT INTO user_notifications
        (user_id,kind,source_id,title,scheduled_at,local_day,local_time)
        VALUES($1,'custom',$2,$3,$4,$5,$6)
        ON CONFLICT (user_id,kind,source_id,local_day,local_time) DO NOTHING`,
      [args[0], args[1], args[2], clock, iso.slice(0, 10), iso.slice(11, 19)]);
    }
    if (sql.includes("FOR KEY SHARE OF p,outgoing,incoming")) {
      // pg-mem supports KEY SHARE but not PostgreSQL's table-specific OF list.
      return client.query(sql.replace("FOR KEY SHARE OF p,outgoing,incoming", "FOR KEY SHARE"), args);
    }
    return client.query(sql, args);
  };
  const routeClient = { query };
  const transaction = async callback => {
    await client.query("BEGIN");
    try {
      const result = await callback(routeClient);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  };
  registerFriendMapRoutes(app, {
    requireAuth(req, res, next) { return req.user ? next() : res.sendStatus(401); },
    asyncRoute: handler => handler,
    query,
    transaction,
    available: () => true,
    mapsApiKey: "browser-key",
    notificationsEnabled: () => true,
  });
  async function call(route, body) {
    const handlers = routes.get(route);
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    const result = { status: 200 };
    const req = { user: { id: "owner", name: "Владелец" }, body };
    const res = {
      set() { return this; },
      status(value) { result.status = value; return this; },
      sendStatus(value) { result.status = value; finish(); },
      json(value) { result.body = value; finish(); },
    };
    const visit = index => handlers[index](req, res, () => visit(index + 1));
    await visit(0);
    await completed;
    return result;
  }
  return {
    client,
    call,
    advance(milliseconds) { clock = new Date(clock.getTime() + milliseconds); },
  };
}

test("PostgreSQL-shaped queries notify once on entry, stay quiet outside and notify after re-entry", async t => {
  const context = await fixture();
  t.after(() => context.client.end());
  const near = { longitude: 30.3, latitude: 59.9, accuracyMeters: 12 };
  const first = await context.call("post /api/friend-map/location", near);
  assert.equal(first.status, 200);
  assert.equal(first.body.nearby[0].friendId, "friend");
  assert.deepEqual((await context.client.query(`SELECT user_id,title FROM user_notifications
    ORDER BY user_id`)).rows, [
    { user_id: "friend", title: "Владелец рядом — примерно в 600 м" },
    { user_id: "owner", title: "Анна рядом — примерно в 600 м" },
  ]);

  context.advance(70_000);
  const far = await context.call("post /api/friend-map/location", {
    longitude: 30.3, latitude: 59.88, accuracyMeters: 12,
  });
  assert.equal(far.status, 200);
  assert.deepEqual(far.body.nearby, []);
  assert.equal((await context.client.query("SELECT 1 FROM user_notifications")).rowCount, 2);

  context.advance(70_000);
  await context.call("post /api/friend-map/location", near);
  assert.equal((await context.client.query("SELECT 1 FROM user_notifications")).rowCount, 4);
  assert.deepEqual((await context.client.query(`SELECT user_id,friend_id,nearby,last_distance_meters
    FROM friend_map_proximity ORDER BY user_id`)).rows, [
    { user_id: "friend", friend_id: "owner", nearby: true, last_distance_meters: 556 },
    { user_id: "owner", friend_id: "friend", nearby: true, last_distance_meters: 556 },
  ]);
});
