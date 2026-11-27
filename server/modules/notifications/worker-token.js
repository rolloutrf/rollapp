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

export async function loadNotificationDeliverySecrets(environment = process.env) {
  if (environment.ROLLAPP_WEB_PUSH_ENABLED !== 'true') return false;
  const secretId = environment.YC_EVE_NOTIFICATION_LOCKBOX_SECRET_ID;
  if (!secretId && (!environment.WEB_PUSH_VAPID_PUBLIC_KEY || !environment.WEB_PUSH_VAPID_PRIVATE_KEY)) {
    throw new Error('Web push requires VAPID keys or the notification Lockbox');
  }
  if (secretId) {
    environment.WEB_PUSH_VAPID_PUBLIC_KEY ||= await loadLockboxValue(secretId, 'web_push_public_key', environment);
    environment.WEB_PUSH_VAPID_PRIVATE_KEY ||= await loadLockboxValue(secretId, 'web_push_private_key', environment);
    environment.WEB_PUSH_VAPID_SUBJECT ||= await loadLockboxValue(secretId, 'web_push_subject', environment);
  }
  if (!environment.WEB_PUSH_VAPID_PUBLIC_KEY || !environment.WEB_PUSH_VAPID_PRIVATE_KEY
    || !/^(?:mailto:|https:)/.test(environment.WEB_PUSH_VAPID_SUBJECT || '')) {
    throw new Error('Invalid web push VAPID configuration');
  }
  return true;
}
