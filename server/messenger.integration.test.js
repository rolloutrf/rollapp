// Explicit real-PostgreSQL verification; all temporary records share one
// transaction that is rolled back. Never initializes or migrates the schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { registerMessengerRoutes } from './messenger.js';

test('production messenger: pairs, two-way delivery, isolation, cursors, idempotency and rollback', {skip:process.env.ROLLAPP_TEST_MESSENGER !== '1'}, async () => {
  const { productionRollsDatabase } = await import('../scripts/rolls-database.mjs');
  const db=await productionRollsDatabase();
  const client=await db.pool.connect();
  const ids=Array.from({length:3},()=>`messenger-test-${randomUUID()}`);
  let server;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('SELECT id,user_a,user_b FROM messenger_conversations LIMIT 0');
    for(const [index,id] of ids.entries()) await client.query(`INSERT INTO users(id,email,username,name,password_hash) VALUES($1,$2,$3,$4,$5)`,[id,`${id}@example.invalid`,id,`Messenger QA ${index}`,'not-a-login-hash']);
    const app=express(); app.use(express.json());
    // Test-local principal injection; never part of the running application.
    app.use((req,_res,next)=>{req.user=ids.includes(req.headers['x-test-user'])?{id:req.headers['x-test-user']}:null;next();});
    registerMessengerRoutes(app,{
      requireAuth:(req,res,next)=>req.user?next():res.status(401).json({error:'Unauthorized'}),
      query:(sql,params)=>client.query(sql,params),transaction:fn=>fn(client),
      asyncRoute:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
    });
    app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const request=async(user,path,body)=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/messenger${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-test-user':user},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,...await response.json()};
    };
    const [a,b,c]=ids;
    assert.equal((await request('', '/conversations')).status,401);
    const created=await request(a,'/conversations',{participantId:b});assert.equal(created.status,200,JSON.stringify(created));
    const cid=created.conversation.id;
    const reverse=await request(b,'/conversations',{participantId:a});assert.equal(reverse.conversation.id,cid);
    const search=await request(a,`/participants?search=${encodeURIComponent(b)}`);assert.equal(search.users[0].id,b);assert(!('email' in search.users[0]));
    assert.equal((await request(a,'/conversations',{participantId:a})).status,400);
    const payload={body:'Сообщение\nс переносом <script>literal</script>',clientId:randomUUID()};
    const sent=await request(a,`/conversations/${cid}/messages`,payload);assert.equal(sent.status,200,JSON.stringify(sent));
    const retry=await request(a,`/conversations/${cid}/messages`,payload);assert.equal(retry.message.id,sent.message.id);
    assert.equal((await request(a,`/conversations/${cid}/messages`,{...payload,body:'Changed'})).status,409);
    assert.equal((await request(c,`/conversations/${cid}/messages`)).status,404);
    assert.equal((await request(c,`/conversations/${cid}/messages`,{body:'Forbidden',clientId:randomUUID()})).status,404);
    assert.equal((await request(c,`/conversations/${cid}/read`,{lastId:sent.message.id})).status,404);
    const unread=await request(b,'/conversations');assert.equal(unread.conversations[0].unread,1);
    const history=await request(b,`/conversations/${cid}/messages`);assert.equal(history.messages[0].body,payload.body);
    await request(b,`/conversations/${cid}/read`,{lastId:sent.message.id});assert.equal((await request(b,'/conversations')).conversations[0].unread,0);
    const reply=await request(b,`/conversations/${cid}/messages`,{body:'Ответ',clientId:randomUUID()});assert.equal(reply.status,200);
    const after=await request(a,`/conversations/${cid}/messages?after=${sent.message.id}`);assert.equal(after.messages.length,1);assert.equal(after.messages[0].id,reply.message.id);
    const before=await request(b,`/conversations/${cid}/messages?before=${reply.message.id}`);assert.equal(before.messages.length,1);assert.equal(before.messages[0].id,sent.message.id);
    assert.equal((await request(b,`/conversations/${cid}/messages?before=invalid`)).status,400);
    // Another conversation cannot be used to acknowledge the original one.
    const other=await request(a,'/conversations',{participantId:c});
    const foreign=await request(c,`/conversations/${other.conversation.id}/messages`,{body:'Other',clientId:randomUUID()});
    await request(a,`/conversations/${cid}/read`,{lastId:foreign.message.id});
    assert.equal((await request(a,'/conversations')).conversations.find(item=>item.id===cid).unread,1);
    // Real pagination, without consuming the HTTP send-rate limit.
    for(let i=0;i<53;i++)await client.query('INSERT INTO messenger_messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4)',[cid,a,randomUUID(),`Page ${i}`]);
    const page=await request(b,`/conversations/${cid}/messages`);assert.equal(page.messages.length,50);assert.equal(page.hasMore,true);
    const older=await request(b,`/conversations/${cid}/messages?before=${page.messages[0].id}`);assert.equal(older.messages.length,5);assert.equal(older.hasMore,false);
    const catchup=await request(b,`/conversations/${cid}/messages?after=${sent.message.id}`);assert.equal(catchup.messages.length,50);assert.equal(catchup.hasMore,true);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await client.query('ROLLBACK');client.release();
    try {
      const remaining=await db.query('SELECT count(*)::int AS count FROM users WHERE id=ANY($1::text[])',[ids]);
      assert.equal(remaining.rows[0].count,0,'Temporary users survived rollback');
    } finally {await db.pool.end();}
  }
});
