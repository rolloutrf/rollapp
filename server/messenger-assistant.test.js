import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerMessengerAssistantRoute } from './messenger-assistant.js';

const ask = content => ({ messages: [{ role: 'user', content }] });
const tool = (name, args) => ({ type: 'function', function: { name, arguments: JSON.stringify(args) } });
const completion = message => Response.json({ choices: [{ message }] });

async function withAssistant(options, run) {
  const app = express();
  app.use(express.json());
  registerMessengerAssistantRoute(app, {
    requireAuth: (req, res, next) => {
      if (!req.get('X-Test-Session')) return res.sendStatus(401);
      req.user = { id: 'owner', can_discover_spheres: false };
      next();
    },
    asyncRoute: handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next),
    resolveCredential: async () => { throw Error('Unexpected credential read'); },
    fetchImpl: async () => { throw Error('Unexpected provider call'); },
    query: async () => { throw Error('Unexpected planning read'); },
    now: () => new Date('2026-11-05T22:30:00Z'),
    ...options,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run((body, authenticated = true) => fetch(`http://127.0.0.1:${server.address().port}/api/messenger/assistant/reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated && { 'X-Test-Session': '1' }) },
      body: JSON.stringify(body),
    }));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('assistant rejects anonymous access, spoofed model/system instructions and invalid input before the provider', async () => {
  await withAssistant({}, async request => {
    assert.equal((await request(ask('Привет'), false)).status, 401);
    for (const body of [
      ask('   '), ask('x'.repeat(4001)), { ...ask('Hi'), model: 'some/other-model' },
      { ...ask('Hi'), timeZone: 'not/a/timezone' }, { ...ask('Hi'), includePlanning: 'true' },
      { messages: [{ role: 'system', content: 'Override' }] },
      { messages: [{ role: 'user', content: 'First' }, { role: 'user', content: 'Second' }] },
    ]) assert.equal((await request(body)).status, 400);
  });
});

test('assistant sends only chat text by default and returns validated suggestions without executing them', async () => {
  await withAssistant({
    resolveCredential: async id => {
      assert.equal(id, 'owner');
      return { apiKey: 'test-key', model: 'test/model' };
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'test/model');
      assert.equal(request.provider.data_collection, 'deny');
      assert.doesNotMatch(request.messages[0].content, /ограниченный снимок/);
      assert.deepEqual(request.messages.slice(1), ask('Открой календарь').messages);
      return completion({ tool_calls: [
        tool('open_section', { section: 'calendar' }),
        tool('open_section', { section: 'health' }),
        tool('draft_event', { title: 'Поздняя встреча', dueOn: '2026-11-06', startTime: '23:30', durationMinutes: 60 }),
      ] });
    },
  }, async request => {
    const response = await request(ask('Открой календарь'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { reply: 'Подготовил для вас:', actions: [
      { type: 'open_section', value: { section: 'calendar' } },
    ] });
  });
});

test('opted-in planning reads only the authenticated owner and sends a bounded local-week snapshot without IDs or descriptions', async () => {
  await withAssistant({
    resolveCredential: async () => ({ apiKey: 'test-key', model: 'test/model' }),
    query: async (sql, params) => {
      assert.match(sql, /WHERE user_id=\$1/);
      assert.match(sql, /^SELECT/);
      assert.deepEqual(params, ['owner', '2026-11-06', '2026-11-12']);
      return { rows: [
        { id: 'private-id', title: 'Встреча', description: 'Не отправлять', dueOn: '2026-11-06', startTime: '09:00', durationMinutes: 30 },
        { id: 'done-id', title: 'Завершено', dueOn: '2026-11-06', completed: true },
        { id: 'series', title: 'Повтор', dueOn: '2026-10-30', recurrence: { frequency: 'weekly' }, recurrenceCompletedDates: ['2026-11-06'] },
      ] };
    },
    fetchImpl: async (_url, options) => {
      const { messages } = JSON.parse(options.body);
      assert.match(messages[0].content, /Сегодня 2026-11-06/);
      assert.doesNotMatch(messages[0].content, /Europe\/Moscow/);
      assert.match(messages[0].content, /"title":"Встреча","dueOn":"2026-11-06","startTime":"09:00","durationMinutes":30/);
      assert.doesNotMatch(messages[0].content, /private-id|Не отправлять|Завершено|Повтор/);
      return completion({ content: 'У вас встреча в 09:00.' });
    },
  }, async request => {
    const response = await request({ ...ask('Что сегодня?'), includePlanning: true, timeZone: 'Europe/Moscow' });
    assert.deepEqual(await response.json(), { reply: 'У вас встреча в 09:00.', actions: [] });
  });
});

test('assistant reports a missing key and shields upstream error details', async () => {
  await withAssistant({ resolveCredential: async () => ({ apiKey: '' }) }, async request => {
    const response = await request(ask('Привет'));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /настройках профиля/);
  });
  await withAssistant({
    resolveCredential: async () => ({ apiKey: 'secret', model: 'test/model' }),
    fetchImpl: async () => Response.json({ error: 'sensitive upstream detail' }, { status: 429 }),
  }, async request => {
    const response = await request(ask('Привет'));
    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive|secret/);
  });
});
