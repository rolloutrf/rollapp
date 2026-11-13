import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { registerPlanningRoutes } from './planning.js';

test('note-task batches retain owner, source and date, reject stale notes and replay without duplicates', async () => {
  const handlers = new Map();
  const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method,
    (path, _auth, handler) => handlers.set(`${method} ${path}`, handler),
  ]));
  const note = { title: 'Итоги встречи', content: 'Сверить смету.' };
  const inserted = [];
  const transaction = async run => run({ query: async (sql, params) => {
    if (sql.includes('FROM users')) { assert.deepEqual(params, ['owner']); return { rowCount: 1 }; }
    if (sql.includes('FROM planning_boards')) return { rowCount: 0 };
    if (sql.includes('FROM planning_notes')) {
      assert.equal(params[1], 'owner');
      assert.match(sql, /FOR SHARE/);
      return { rows: params[0] === 'source' ? [note] : [] };
    }
    if (sql.startsWith('SELECT id FROM planning_tasks')) {
      assert.equal(params[0], 'owner');
      return { rows: inserted.filter(([id]) => params[1].includes(id)).map(([id]) => ({ id })) };
    }
    assert.match(sql, /^INSERT INTO planning_tasks/);
    inserted.push(params);
    return { rows: [] };
  } });
  registerPlanningRoutes(app, { requireAuth() {}, query() {}, transaction, asyncRoute: handler => handler });
  const run = handlers.get('post /api/planning/tasks/from-note');
  const payload = {
    noteId: 'source', revision: createHash('sha256').update(JSON.stringify([note.title, note.content])).digest('hex'),
    batchId: 'd9322ed5-4d25-4356-86a0-258aac712332',
    tasks: [{ row: 2, title: 'Сверить смету', description: '', dueOn: '2026-11-20' }],
  };
  const submit = async body => {
    const result = {};
    await run({ method: 'POST', user: { id: 'owner' }, query: {}, body }, {
      status(code) { result.status = code; return this; },
      json(value) { result.body = value; },
    });
    return result;
  };

  assert.equal((await submit({ ...payload, tasks: [...payload.tasks, ...payload.tasks] })).status, 400);
  assert.equal((await submit({ ...payload, noteId: 'foreign' })).status, 404);
  assert.equal((await submit({ ...payload, revision: 'a'.repeat(64) })).status, 409);
  assert.equal(inserted.length, 0);
  assert.deepEqual(await submit(payload), { status: 201, body: { saved: 1 } });
  assert.equal(inserted[0][1], 'owner');
  assert.equal(inserted[0][5], '2026-11-20');
  assert.equal(inserted[0][10], 'main');
  assert.deepEqual(JSON.parse(inserted[0][12]), [{ kind: 'note', id: 'source', title: note.title }]);
  note.content = 'Обновлённый текст';
  assert.deepEqual(await submit(payload), { status: 201, body: { saved: 1 } });
  assert.equal(inserted.length, 1);
});
