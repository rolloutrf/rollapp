import { loadLockboxValue } from '../runtime/lockbox.js';

export async function loadNotificationWorkerToken(environment = process.env) {
  const secretId = environment.YC_EVE_NOTIFICATION_LOCKBOX_SECRET_ID;
  if (!environment.ROLLAPP_EVE_NOTIFICATION_TOKEN && secretId) {
    environment.ROLLAPP_EVE_NOTIFICATION_TOKEN = await loadLockboxValue(secretId, 'notification_token', environment);
  }
  const token = environment.ROLLAPP_EVE_NOTIFICATION_TOKEN;
  if (token && (token.length < 32 || /\s/.test(token))) throw new Error('Invalid Eve notification worker token');
  return token;
}
