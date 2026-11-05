import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerMessengerRoutes, messageInput } from './messenger.js';

const id = '4a0effb1-352d-4bc4-9f1f-6ee126840d01';
async function withApi(options, run) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = options.user === null ? null : { id: 'alice' }; next(); });
  registerMessengerRoutes(app, {
    requireAuth: (req,res,next) => req.user ? next() : res.status(401).json({error:'Unauthorized'}),
    asyncRoute: handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next),
    query: options.query || (async () => ({ rows: [] })),
    transaction: options.transaction || (async () => { throw Error('Unexpected write'); }),
  });
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (path, body) => fetch(`http://127.0.0.1:${server.address().port}/api/messenger${path}`, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  try { await run(request); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('messages validate text, UUID, whitespace and length', () => {
  assert.equal(messageInput.parse({ clientId:id, body:'  Привет\nмир  ' }).body, 'Привет\nмир');
  for (const body of ['', '   ', 'x'.repeat(4001), null]) assert.equal(messageInput.safeParse({clientId:id,body}).success, false);
  assert.equal(messageInput.safeParse({clientId:'bad',body:'Hello'}).success,false);
});
test('anonymous users cannot probe messenger or schema', async () => {
  await withApi({ user:null, query:() => { throw Error('Must not access database'); } }, async request => {
    for (const path of ['/participants?search=alice','/subscriptions','/conversations',`/conversations/${id}/messages`]) assert.equal((await request(path)).status,401);
  });
});
test('missing schema returns actionable 503 without initializing anything', async () => {
  await withApi({ query:async () => { throw Object.assign(Error('missing'),{code:'42P01'}); } }, async request => {
    const response = await request('/conversations'); assert.equal(response.status,503);
    assert.equal((await response.json()).code,'MESSENGER_SCHEMA_REQUIRED');
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
});
test('nonmembers cannot read, send or acknowledge and malformed IDs never reach membership queries', async () => {
  const calls = [];
  await withApi({query:async (sql,params) => { calls.push([sql,params]); return {rows:[]}; }}, async request => {
    for (const [path,body] of [[`/conversations/${id}/messages`,undefined],[`/conversations/${id}/messages`,{clientId:id,body:'secret'}],[`/conversations/${id}/read`,{lastId:'1'}]]) assert.equal((await request(path,body)).status,404);
    const before = calls.filter(([sql]) => sql.includes('WHERE id=$1')).length;
    assert.equal((await request('/conversations/invalid/messages')).status,404);
    assert.equal(calls.filter(([sql]) => sql.includes('WHERE id=$1')).length,before);
  });
  assert(calls.filter(([sql]) => sql.includes('WHERE id=$1')).every(([sql,params]) => sql.includes('(user_a=$2 OR user_b=$2)') && params[1] === 'alice'));
  assert(calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql)));
});
test('participant search returns only public fields and escapes wildcard input', async () => {
  let searchParams;
  await withApi({ query:async (sql,params) => {
    if (sql.includes('ILIKE')) { searchParams=params; return {rows:[{id:'bob',name:'Боб',username:'bob',avatar_url:'',email:'private',password_hash:'secret'}]}; }
    return {rows:[]};
  }}, async request => {
    assert.deepEqual(await (await request('/participants?search=a')).json(),{users:[]});
    const payload = await (await request('/participants?search=%25_')).json();
    assert.deepEqual(payload.users,[{id:'bob',name:'Боб',username:'bob',avatarUrl:''}]);
    assert.deepEqual(searchParams,['alice','%\\%\\_%']);
  });
});
test('subscriptions are scoped to the signed-in follower and return all public contacts', async () => {
  const rows = Array.from({length: 53}, (_, index) => ({
    id: `person-${index}`, name: `Контакт ${index}`, username: `contact${index}`, avatar_url: '', email: 'private',
  }));
  await withApi({ query: async (sql, params) => {
    if (!sql.includes('FROM follows')) return { rows: [] };
    assert.match(sql, /ON u.id=f.following_id/);
    assert.match(sql, /WHERE f.follower_id=\$1/);
    assert.doesNotMatch(sql, /LIMIT/i);
    assert.deepEqual(params, ['alice']);
    return { rows };
  } }, async request => {
    const response = await request('/subscriptions?userId=bob');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).users, rows.map(({ id, name, username }) => ({ id, name, username, avatarUrl: '' })));
  });
});
test('retrying an ambiguous send returns the stored message without another insert', async () => {
  const calls=[];
  const existing={seq:'12',conversation_id:id,sender_id:'alice',client_id:id,body:'Hello',created_at:'2026-11-01T12:00:00Z'};
  await withApi({query:async sql => ({rows:sql.includes('SELECT * FROM messenger_conversations') ? [{id,user_a:'alice',user_b:'bob'}] : []}),transaction:async fn => fn({query:async sql => { calls.push(sql); return {rows:sql.includes('client_id=$2') ? [existing] : []}; }})},async request => {
    const response=await request(`/conversations/${id}/messages`,{clientId:id,body:'Hello'});
    assert.equal(response.status,200); assert.equal((await response.json()).message.id,'12');
    assert.equal((await request(`/conversations/${id}/messages`,{clientId:id,body:'Changed'})).status,409);
  });
  assert(calls.some(sql => sql.includes('FOR UPDATE'))); assert(calls.every(sql => !sql.includes('INSERT')));
});
test('read acknowledgements are membership guarded and cannot skip to a future or foreign message', async () => {
  let write;
  await withApi({ query:async (sql,params) => {
    if (sql.includes('SELECT * FROM messenger_conversations')) return {rows:[{id,user_a:'alice',user_b:'bob'}]};
    if (sql.includes('INSERT')) write=[sql,params];
    return {rows:[]};
  }},async request => {
    assert.equal((await request(`/conversations/${id}/read`,{lastId:'9223372036854775808'})).status,400);
    assert.equal((await request(`/conversations/${id}/read`,{lastId:'12'})).status,200);
  });
  assert.match(write[0],/WHERE conversation_id=\$1 AND seq=\$3/);assert.match(write[0],/GREATEST/);assert.deepEqual(write[1],[id,'alice','12']);
});
test('history validates mutually exclusive cursors and pages new arrivals in ascending order', async () => {
  const calls=[];
  await withApi({query:async (sql,params)=>{
    calls.push([sql,params]);
    if(sql.includes('SELECT * FROM messenger_conversations'))return {rows:[{id,user_a:'alice',user_b:'bob'}]};
    if(sql.includes('SELECT * FROM messenger_messages'))return {rows:Array.from({length:51},(_,i)=>({seq:String(i+10),sender_id:'bob',body:'hello',created_at:'2026-11-01T12:00:00Z'}))};
    if(sql.includes('FROM users'))return {rows:[{id:'bob',name:'Боб',username:'bob',avatar_url:''}]};
    return {rows:[]};
  }},async request=>{
    for(const suffix of ['?before=0','?after=invalid','?before=1&after=2'])assert.equal((await request(`/conversations/${id}/messages${suffix}`)).status,400);
    const data=await(await request(`/conversations/${id}/messages?after=9`)).json();
    assert.equal(data.hasMore,true);assert.equal(data.messages.length,50);assert.equal(data.messages[0].id,'10');assert.equal(data.messages.at(-1).id,'59');
  });
  assert(calls.some(([sql,params])=>sql.includes('ORDER BY seq ASC LIMIT 51') && params[2]==='9'));
});
