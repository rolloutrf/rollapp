import { productionRollsDatabase } from './rolls-database.mjs';
import { messengerSchema } from '../server/messenger-schema.js';

// Dry-run by default. This is never imported by application startup/deployment.
const db = await productionRollsDatabase();
try {
  console.log(JSON.stringify({ target: db.target, migration: 'messenger-v1', additiveTables: ['messenger_conversations', 'messenger_messages', 'messenger_reads'] }));
  if (process.argv.includes('--apply')) {
    const expected = process.argv.find(value => value.startsWith('--database='))?.slice('--database='.length);
    if (expected !== db.target.database) throw new Error('Передайте точное имя проверенной БД через --database=…');
    await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query(messengerSchema);
    });
    console.log('Messenger schema applied. Existing user data was not backfilled or changed.');
  } else {
    await db.transaction(async client => {
      await client.query('SET TRANSACTION READ ONLY');
      const result = await client.query(`SELECT to_regclass('messenger_conversations')::text AS conversations,
        to_regclass('messenger_messages')::text AS messages,to_regclass('messenger_reads')::text AS reads`);
      console.log(JSON.stringify({ existing: result.rows[0], applied: false }));
    });
    console.log('Read-only preflight. Applying requires explicit authorization and --apply --database=<verified database>.');
  }
} finally { await db.pool.end(); }
