import { defineSchedule } from 'eve/schedules';

export default defineSchedule({
  cron: '* * * * *',
  timezone: 'UTC',
  async run() {
    const origin = process.env.ROLLAPP_EVE_APP_ORIGIN;
    const token = process.env.ROLLAPP_EVE_NOTIFICATION_TOKEN;
    if (!origin || !token || token.length < 32) throw new Error('Rollapp notification delivery is not configured');

    const url = new URL('/api/internal/eve/notifications', origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', 'rollapp'].includes(url.hostname))) {
      throw new Error('Rollapp delivery requires HTTPS or a private Rollapp service');
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Rollapp notification delivery failed (${response.status})`);
  },
});
