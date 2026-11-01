import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createRateLimit } from './rate-limit.js';

export const messageInput = z.object({ clientId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });
const uuid = z.string().uuid();
const cursor = z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n);
const publicUser = row => ({ id: row.id, name: row.name, username: row.username, avatarUrl: row.avatar_url });
const message = row => ({ id: String(row.seq), senderId: row.sender_id, clientId: row.client_id, body: row.body, createdAt: row.created_at });

export function registerMessengerRoutes(app, { requireAuth, query, transaction, asyncRoute }) {
  const base = '/api/messenger';
  app.use(base, requireAuth, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Missing schema is visible; reconnecting never initializes the production DB.
  app.use(base, asyncRoute(async (_req, res, next) => {
    try { await query(`SELECT c.id,c.user_a,c.user_b,c.updated_at,m.seq,m.sender_id,m.client_id,m.body,m.created_at,r.conversation_id,r.user_id,r.last_seq FROM messenger_conversations c LEFT JOIN messenger_messages m ON m.conversation_id=c.id LEFT JOIN messenger_reads r ON r.conversation_id=c.id LIMIT 0`); next(); }
    catch (error) {
      if (error.code !== '42P01' && error.code !== '42703') throw error;
      res.status(503).json({ error: 'Мессенджер ещё не подключён. Требуется отдельная миграция базы данных.', code: 'MESSENGER_SCHEMA_REQUIRED' });
    }
  }));
  const sendLimit = createRateLimit({ windowMs: 60_000, max: 40, key: req => req.user.id });
  const searchLimit = createRateLimit({ windowMs: 60_000, max: 90, key: req => req.user.id });
  async function member(req, res) {
    if (!uuid.safeParse(req.params.id).success) { res.status(404).json({ error: 'Диалог не найден' }); return null; }
    const result = await query('SELECT * FROM messenger_conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)', [req.params.id, req.user.id]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Диалог не найден' }); return null; }
    return result.rows[0];
  }
  app.get(`${base}/participants`, searchLimit, asyncRoute(async (req, res) => {
    const search = String(req.query.search || '').trim().slice(0, 100);
    if (search.length < 2) return res.json({ users: [] });
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    const result = await query(`SELECT id,name,username,avatar_url FROM users
      WHERE id<>$1 AND (name ILIKE $2 OR username ILIKE $2)
      ORDER BY lower(username) LIMIT 30`, [req.user.id, `%${escaped}%`]);
    res.json({ users: result.rows.map(publicUser) });
  }));
  app.get(`${base}/conversations`, asyncRoute(async (req, res) => {
    const result = await query(`SELECT c.id,c.updated_at,u.id AS peer_id,u.name,u.username,u.avatar_url,
      m.body,m.created_at,m.sender_id,m.seq,
      (SELECT count(*)::int FROM messenger_messages n WHERE n.conversation_id=c.id AND n.sender_id<>$1
        AND n.seq>COALESCE(r.last_seq,0)) AS unread
      FROM messenger_conversations c JOIN users u ON u.id=CASE WHEN c.user_a=$1 THEN c.user_b ELSE c.user_a END
      LEFT JOIN messenger_reads r ON r.conversation_id=c.id AND r.user_id=$1
      LEFT JOIN LATERAL (SELECT * FROM messenger_messages WHERE conversation_id=c.id ORDER BY seq DESC LIMIT 1) m ON true
      WHERE c.user_a=$1 OR c.user_b=$1 ORDER BY c.updated_at DESC,c.id`, [req.user.id]);
    res.json({ conversations: result.rows.map(row => ({ id: row.id, peer: publicUser({ ...row, id: row.peer_id }), unread: row.unread,
      lastMessage: row.seq ? message(row) : null })) });
  }));
  app.post(`${base}/conversations`, sendLimit, asyncRoute(async (req, res) => {
    const peerId = typeof req.body?.participantId === 'string' ? req.body.participantId : '';
    if (!peerId || peerId === req.user.id) return res.status(400).json({ error: 'Выберите другого участника' });
    const peer = await query('SELECT id,name,username,avatar_url FROM users WHERE id=$1', [peerId]);
    if (!peer.rows[0]) return res.status(404).json({ error: 'Участник не найден' });
    const [a,b] = [req.user.id, peerId].sort();
    const result = await query(`INSERT INTO messenger_conversations(id,user_a,user_b) VALUES($1,$2,$3)
      ON CONFLICT(user_a,user_b) DO UPDATE SET user_a=EXCLUDED.user_a RETURNING id`, [randomUUID(), a, b]);
    res.json({ conversation: { id: result.rows[0].id, peer: publicUser(peer.rows[0]), unread: 0, lastMessage: null } });
  }));
  app.get(`${base}/conversations/:id/messages`, asyncRoute(async (req, res) => {
    const conversation = await member(req, res); if (!conversation) return;
    const before = req.query.before, after = req.query.after;
    if ((before !== undefined && !cursor.safeParse(before).success) || (after !== undefined && !cursor.safeParse(after).success) || (before && after)) return res.status(400).json({ error: 'Некорректная страница' });
    const result = await query(`SELECT * FROM messenger_messages WHERE conversation_id=$1
      AND ($2::bigint IS NULL OR seq<$2) AND ($3::bigint IS NULL OR seq>$3)
      ORDER BY ${after ? "seq ASC" : "seq DESC"} LIMIT 51`, [conversation.id, before || null, after || null]);
    const rows = result.rows.slice(0, 50);
    const peerId = conversation.user_a === req.user.id ? conversation.user_b : conversation.user_a;
    const peer = await query('SELECT id,name,username,avatar_url FROM users WHERE id=$1', [peerId]);
    res.json({ messages: (after ? rows : rows.reverse()).map(message), hasMore: result.rows.length > 50, peer: publicUser(peer.rows[0]) });
  }));
  app.post(`${base}/conversations/:id/messages`, sendLimit, asyncRoute(async (req, res) => {
    const conversation = await member(req, res); if (!conversation) return;
    const parsed = messageInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Введите сообщение от 1 до 4000 символов' });
    const result = await transaction(async client => {
      // Serialize sends per conversation so sequence/read cursors follow commit order.
      await client.query('SELECT id FROM messenger_conversations WHERE id=$1 FOR UPDATE', [conversation.id]);
      const existing = await client.query('SELECT * FROM messenger_messages WHERE sender_id=$1 AND client_id=$2', [req.user.id, parsed.data.clientId]);
      if (existing.rows[0]) {
        if (existing.rows[0].conversation_id !== conversation.id || existing.rows[0].body !== parsed.data.body) return null;
        return existing.rows[0];
      }
      const inserted = await client.query(`INSERT INTO messenger_messages(conversation_id,sender_id,client_id,body)
        VALUES($1,$2,$3,$4) RETURNING *`, [conversation.id, req.user.id, parsed.data.clientId, parsed.data.body]);
      await client.query('UPDATE messenger_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=$1', [conversation.id]);
      return inserted.rows[0];
    });
    if (!result) return res.status(409).json({ error: 'Идентификатор отправки уже использован' });
    res.json({ message: message(result) });
  }));
  app.post(`${base}/conversations/:id/read`, asyncRoute(async (req, res) => {
    const conversation = await member(req, res); if (!conversation) return;
    if (!cursor.safeParse(req.body?.lastId).success) return res.status(400).json({ error: 'Некорректное сообщение' });
    // Only acknowledge a message actually returned to this participant, never future IDs.
    await query(`INSERT INTO messenger_reads(conversation_id,user_id,last_seq)
      SELECT $1,$2,seq FROM messenger_messages WHERE conversation_id=$1 AND seq=$3
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_seq=GREATEST(messenger_reads.last_seq,EXCLUDED.last_seq)`,
    [conversation.id, req.user.id, req.body.lastId]);
    res.json({ ok: true });
  }));
}
