import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAssistantWishlistSort, prepareAssistantWishlistSort } from './assistant-wishlist-sort.js';
import { assistantWishSortApply, parseAssistantAction } from '../shared/messenger-assistant.js';

test('wishlist sort reads ten owner wishes and only sends numbered names to the ranking model', async () => {
  const queries = [];
  const wishes = Array.from({ length: 11 }, (_, index) => ({ id: `wish-${index}`, title: `Товар ${index}` }));
  const lists = [{ id: 'list-id', title: 'Кухня', privacy: 'private' }];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    return { rows: sql.includes('FROM wishes w') ? wishes : lists };
  };
  const complete = async (messages, tools) => {
    const input = JSON.parse(messages[1].content);
    assert.equal(input.wishes.length, 10);
    assert.deepEqual(input.lists, [{ number: 1, title: 'Кухня' }]);
    assert.deepEqual(input.wishes[0], { number: 1, title: 'Товар 0' });
    assert.doesNotMatch(JSON.stringify(messages), /wish-0|list-id|private/);
    assert.deepEqual(tools.map(({ function: fn }) => fn.name), ['suggest_wish_lists']);
    return { choices: [{ message: { tool_calls: [{
      type: 'function', function: {
        name: 'suggest_wish_lists', arguments: JSON.stringify({ choices: [
          { wish: 1, list: 1 }, { wish: 2, list: 7 }, { wish: 11, list: 1 },
        ] }),
      },
    }] } }] };
  };
  const result = await prepareAssistantWishlistSort(query, 'owner', 'Разбери товары', complete, new AbortController().signal);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(({ params }) => params), [['owner', 11], ['owner']]);
  assert.match(queries[0].sql, /w\.status='active'[\s\S]+NOT EXISTS/);
  assert.match(queries[1].sql, /l\.user_id=\$1/);
  const [action] = result.actions;
  assert.equal(action.type, 'review_wish_sort');
  assert.equal(action.value.hasMore, true);
  assert.equal(action.value.items.length, 10);
  assert.deepEqual(action.value.items[0], { ...wishes[0], listId: 'list-id' });
  assert(action.value.items.slice(1).every(item => item.listId === null));
  assert.equal(parseAssistantAction(action.type, {
    ...action.value, items: [{ ...wishes[0], listId: 'foreign' }],
  }), null);
});

test('wishlist sort apply rejects duplicate wishes and does not insert any move if one is stale', async () => {
  const moves = [{ wishId: 'one', listId: 'list' }, { wishId: 'two', listId: 'list' }];
  assert.equal(assistantWishSortApply.safeParse({ moves: [moves[0], { wishId: 'one', listId: 'other' }] }).success, false);

  for (const scenario of [
    { lists: 0, wishes: 2, memberships: [], accepted: false },
    { lists: 1, wishes: 1, memberships: [], accepted: false },
    { lists: 1, wishes: 2, memberships: [{ wish_id: 'two', wishlist_id: 'other' }], accepted: false },
    { lists: 1, wishes: 2, memberships: [{ wish_id: 'one', wishlist_id: 'list' }], accepted: true },
  ]) {
    const calls = [];
    const transaction = run => run({ query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FOR SHARE')) return { rowCount: scenario.lists };
      if (sql.includes('FOR UPDATE')) return { rowCount: scenario.wishes };
      if (sql.startsWith('SELECT')) return { rows: scenario.memberships };
      assert.match(sql, /^INSERT INTO wishlist_wishes/);
      assert.deepEqual(params, [['one', 'two'], ['list', 'list']]);
    } });
    assert.equal(await applyAssistantWishlistSort(transaction, 'owner', moves), scenario.accepted);
    assert.equal(calls.filter(({ sql }) => sql.startsWith('INSERT')).length, Number(scenario.accepted));
    assert(calls.filter(({ sql }) => sql.startsWith('SELECT')).every(({ params }) => params[0] === 'owner'));
  }
});
