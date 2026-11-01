import test from 'node:test';
import assert from 'node:assert/strict';
import { registerStoryRoutes } from './stories.js';

function routes(query, normalizeVideo) {
  const handlers = new Map();
  const app = { get: (path, ...stack) => handlers.set(`GET ${path}`, stack.at(-1)), post: (path, ...stack) => handlers.set(`POST ${path}`, stack.at(-1)) };
  registerStoryRoutes(app, { query, normalizeVideo, requireAuth() {}, asyncRoute: fn => fn });
  return handlers;
}
function response() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, set(key, value) { Object.assign(this.headers, typeof key === 'string' ? { [key]: value } : key); return this; }, json(data) { this.data = data; return this; }, send(data) { this.data = data; return this; }, end() { return this; }, sendStatus(code) { return this.status(code); } };
}
test('story metadata only selects active records and never exposes video bytes', async () => {
  const handlers = routes(async (sql, args) => {
    assert.match(sql, /expires_at > CURRENT_TIMESTAMP/); assert.deepEqual(args, ['anna']);
    return { rows: [{ id: 'story', created_at: 'now', expires_at: 'later', duration_seconds: 60 }] };
  });
  const res = response();
  await handlers.get('GET /api/stories/users/:username')({ params: { username: 'anna' } }, res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.data.stories[0], { id: 'story', createdAt: 'now', expiresAt: 'later', duration: 60, videoUrl: '/api/stories/story/video' });
});
test('upload persists server normalized bytes with authenticated owner, ignoring client duration', async () => {
  const handlers = routes(async (sql, args) => {
    assert.match(sql, /INSERT INTO stories/); assert.equal(args[1], 'owner'); assert.deepEqual(args[2], Buffer.from('trimmed')); assert.equal(args[4], 60);
    return { rows: [{ created_at: 'now', expires_at: 'later' }] };
  }, async data => { assert.deepEqual(data, Buffer.from('original')); return { video: Buffer.from('trimmed'), duration: 60 }; });
  const res = response();
  await handlers.get('POST /api/stories')({ user: { id: 'owner' }, body: Buffer.from('original') }, res);
  assert.equal(res.statusCode, 201);
});
test('invalid media never writes a story', async () => {
  const handlers = routes(async () => assert.fail('must not write'), async () => { throw new Error('invalid'); });
  const res = response();
  await handlers.get('POST /api/stories')({ user: { id: 'owner' }, body: Buffer.from('bad') }, res);
  assert.equal(res.statusCode, 422);
});
test('video expiry is checked even for direct URLs and cached metadata', async () => {
  const handlers = routes(async sql => { assert.match(sql, /expires_at > CURRENT_TIMESTAMP/); return { rowCount: 0, rows: [] }; });
  const res = response();
  await handlers.get('GET /api/stories/:id/video')({ params: { id: '00000000-0000-4000-8000-000000000000' } }, res);
  assert.equal(res.statusCode, 404); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('video supports normal and suffix byte ranges for mobile playback', async () => {
  const handlers = routes(async () => ({ rowCount: 1, rows: [{ video_data: Buffer.from('0123456789'), size_bytes: 10 }] }));
  for (const [range, expected, code] of [['bytes=2-4', '234', 206], ['bytes=-3', '789', 206], ['bytes=8-', '89', 206], ['bytes=11-', '', 416], ['bytes=-', '', 416]]) {
    const res = response();
    await handlers.get('GET /api/stories/:id/video')({ params: { id: '00000000-0000-4000-8000-000000000000' }, get: () => range }, res);
    assert.equal(res.statusCode, code); if (code === 206) assert.equal(res.data.toString(), expected);
  }
});
