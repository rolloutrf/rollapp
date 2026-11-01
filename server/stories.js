import express from 'express';
import { randomUUID } from 'node:crypto';
import { createRateLimit } from './rate-limit.js';
import { normalizeStoryVideo, STORY_MAX_BYTES } from './story-video.js';

export function registerStoryRoutes(app, { requireAuth, query, asyncRoute, normalizeVideo = normalizeStoryVideo }) {
  const limit = createRateLimit({ windowMs: 15 * 60_000, max: 10, key: req => req.user.id });
  let processing = false;
  app.get('/api/stories/users/:username', asyncRoute(async (req, res) => {
    const result = await query(`SELECT s.id,s.created_at,s.expires_at,s.duration_seconds FROM stories s
      JOIN users u ON u.id=s.user_id WHERE lower(u.username)=lower($1) AND s.expires_at > CURRENT_TIMESTAMP
      ORDER BY s.created_at,s.id`, [req.params.username]);
    res.set('Cache-Control', 'no-store').json({ stories: result.rows.map(row => ({
      id: row.id, createdAt: row.created_at, expiresAt: row.expires_at,
      duration: row.duration_seconds, videoUrl: `/api/stories/${row.id}/video`,
    })) });
  }));
  app.post('/api/stories', requireAuth, limit,
    express.raw({ type: ['video/webm', 'video/mp4', 'video/quicktime'], limit: STORY_MAX_BYTES }),
    asyncRoute(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Выберите видео до 25 МБ' });
      if (processing) return res.status(503).json({ error: 'Обработка видео занята. Повторите публикацию чуть позже.' });
      processing = true;
      try {
        let normalized;
        try { normalized = await normalizeVideo(req.body); }
        catch { return res.status(422).json({ error: 'Не удалось обработать видео. Попробуйте другую запись.' }); }
        const id = randomUUID();
        const result = await query(`INSERT INTO stories (id,user_id,video_data,size_bytes,duration_seconds)
          VALUES ($1,$2,$3,$4,$5) RETURNING created_at,expires_at`,
        [id, req.user.id, normalized.video, normalized.video.length, normalized.duration]);
        res.status(201).json({ id, ...result.rows[0] });
      } finally { processing = false; }
    }));
  app.get('/api/stories/:id/video', asyncRoute(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.sendStatus(404);
    const result = await query('SELECT video_data,size_bytes FROM stories WHERE id=$1 AND expires_at > CURRENT_TIMESTAMP', [req.params.id]);
    res.set('Cache-Control', 'no-store');
    if (!result.rowCount) return res.status(404).json({ error: 'Сторис больше недоступна' });
    const { video_data: data, size_bytes: size } = result.rows[0];
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' });
    const range = req.get('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : size - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
      if (!match || (!match[1] && !match[2]) || start > end || start >= size) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      end = Math.min(end, size - 1);
      return res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }).send(data.subarray(start, end + 1));
    }
    res.set('Content-Length', String(size)).send(data);
  }));
}
