import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerNotificationRoutes } from './notifications.js';

const token = 'notification-unit-test-token-32-characters';

function fixture(secret = token, overrides = {}) {
  const routes = new Map();
  const queries = [];
  const query = async (sql, args) => { queries.push({ sql, args }); return { rows: [], rowCount: 0 }; };
  const app = Object.fromEntries(['get', 'patch', 'post', 'delete'].map(method =>
    [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  const workerHealthy = registerNotificationRoutes(app, {
    requireAuth(req, res, next) { return req.user ? next() : res.sendStatus(401); },
    asyncRoute: handler => handler,
    secret,
    query,
    transaction: callback => callback({ query }),
    ...overrides,
  });
  async function call(route, { user, authorization, body, params } = {}) {
    const handlers = routes.get(route);
    const result = { status: 200, headers: {} };
    const res = {
      status(value) { result.status = value; return this; },
      sendStatus(value) { result.status = value; },
      set(name, value) { result.headers[name] = value; },
      json(body) { result.body = body; },
      end() {},
    };
    const req = { user, body, params, query: {}, get: name => name === 'authorization' ? authorization : undefined };
    const visit = index => handlers[index](req, res, () => visit(index + 1));
    await visit(0);
    return result;
  }
  return { call, queries, workerHealthy };
}

test('the eve route only accepts the configured worker credential and returns no private data', async () => {
  const { call, queries, workerHealthy } = fixture();
  const route = 'post /api/internal/eve/notifications';
  assert.equal((await call(route)).status, 404);
  assert.equal((await call(route, { authorization: `Bearer x${token}` })).status, 404);
  assert.equal(queries.length, 0);
  assert.equal(workerHealthy(), false);
  const result = await call(route, { authorization: `Bearer ${token}`, body: { userId: 'untrusted-value' } });
  assert.equal(result.status, 204);
  assert.equal(result.body, undefined);
  assert.equal(workerHealthy(), true);
  assert.equal(queries[0].args, undefined);
  assert.match(queries[0].sql, /ON CONFLICT \(user_id, kind, source_id, local_day, local_time\) DO NOTHING/);
  assert.match(queries[1].sql, /FOR UPDATE SKIP LOCKED/);
});

test('notification reads and read markers use the authenticated account', async () => {
  const { call, queries } = fixture();
  const user = { id: 'reader', can_discover_spheres: true };
  assert.equal((await call('get /api/notifications')).status, 401);
  assert.deepEqual((await call('get /api/notifications', { user })).body, {
    notifications: [], preferences: null, reminders: [],
    delivery: { emailEnabled: false, pushEnabled: false, pushPublicKey: '', hasPushSubscription: false },
  });
  assert.deepEqual(queries.map(query => query.args), [['reader', true], ['reader'], ['reader']]);
  assert.equal((await call('post /api/notifications/read', { user, body: { ids: ['invalid'] } })).status, 400);
  assert.equal((await call('post /api/notifications/read', { user, body: { ids: ['9223372036854775808'] } })).status, 400);
  assert.equal(queries.length, 3);
  assert.equal((await call('post /api/notifications/read', { user, body: { ids: ['10'] } })).status, 204);
  assert.deepEqual(queries[3].args, ['reader', ['10']]);
});

test('editing or deleting custom reminders always uses the current account and validates the schedule', async () => {
  const { call, queries } = fixture();
  const user = { id: 'reminder-owner' };
  const params = { id: '52dd75ba-c6f1-4f13-81d0-ebaaab67f7e9' };
  const body = { title: 'Полить цветы', startOn: '2026-11-20', remindAt: '08:00', repeatsDaily: true };
  const update = 'patch /api/notifications/reminders/:id';
  assert.equal((await call(update, { user, params, body: { ...body, remindAt: '25:00' } })).status, 400);
  assert.equal(queries.length, 0);
  await call(update, { user, params, body });
  assert.deepEqual(queries[0].args, [params.id, user.id, body.title, body.startOn, body.remindAt, true]);
  assert.match(queries[0].sql, /r\.user_id=\$2/);
  assert.equal((await call('delete /api/notifications/reminders/:id', { user, params })).status, 204);
  assert.deepEqual(queries[1].args, [params.id, user.id]);
});

test('medication reminders require private sphere access and a configured worker', async () => {
  const { call, queries } = fixture();
  const user = { id: 'reader' };
  const body = { medicationReminders: true, dailyOverview: false, timeZone: 'Europe/Moscow' };
  assert.equal((await call('patch /api/notifications/preferences', { user, body })).status, 403);
  assert.equal(queries.length, 0);
  const disabled = fixture('');
  assert.equal((await disabled.call('get /api/notifications', { user })).status, 503);
  assert.equal(disabled.queries.length, 0);
});

test('push subscriptions are scoped to the authenticated account and never expose the private key', async () => {
  const deliveryConfig = {
    origin: 'https://rollapp.example', emailEnabled: true, pushEnabled: true,
    pushPublicKey: 'public-vapid-key', pushPrivateKey: 'private-vapid-key', pushSubject: 'mailto:push@rollapp.example',
  };
  const { call, queries } = fixture(token, { deliveryConfig });
  const user = { id: 'push-owner' };
  const inbox = await call('get /api/notifications', { user });
  assert.equal(inbox.body.delivery.pushPublicKey, 'public-vapid-key');
  assert.doesNotMatch(JSON.stringify(inbox.body), /private-vapid-key/);
  const body = {
    endpoint: 'https://push.example/subscription',
    keys: { p256dh: 'A'.repeat(64), auth: 'B'.repeat(16) },
  };
  assert.equal((await call('post /api/notifications/push-subscriptions', { body })).status, 401);
  assert.equal((await call('post /api/notifications/push-subscriptions', { user, body })).status, 201);
  assert(queries.some(({ sql, args }) => sql.includes('INSERT INTO notification_push_subscriptions')
    && args[1] === user.id && args[0] === body.endpoint));
  assert.equal((await call('delete /api/notifications/push-subscriptions', { user, body: { endpoint: body.endpoint } })).status, 204);
  assert(queries.some(({ sql, args }) => sql.startsWith('DELETE FROM notification_push_subscriptions WHERE endpoint')
    && args[1] === user.id));
});
