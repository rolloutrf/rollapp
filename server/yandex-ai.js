import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const METADATA_URL = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';

export class YandexAiError extends Error {
  constructor(message, { status = 502, code = 'yandex_ai_unavailable', cause } = {}) {
    super(message, { cause });
    this.status = status;
    this.code = code;
  }
}

export function yandexAiConfig(env = process.env) {
  const model = String(env.YANDEX_AI_MODEL || '').trim();
  const folderId = String(env.YC_FOLDER_ID || '').trim();
  return { enabled: Boolean(model && folderId), model: `gpt://${folderId}/${model}`, folderId };
}

// Cache only short-lived runtime credentials, never write them to disk or clients.
export function createYandexAiTokenLoader({ fetchImpl = fetch, exec = execFileAsync, now = Date.now } = {}) {
  let cached;
  let pending;
  return async (env = process.env) => {
    if (env.YC_IAM_TOKEN) return env.YC_IAM_TOKEN;
    const source = env.YANDEX_AI_AUTH || 'metadata';
    if (!['metadata', 'cli'].includes(source)) throw new YandexAiError('Неверная настройка доступа к базовой модели.');
    if (cached?.source === source && cached.expiresAt > now() + 60_000) return cached.token;
    if (pending?.source === source) return pending.promise;
    const promise = (async () => {
      let token;
      let lifetime = 300;
      if (source === 'cli') {
        token = (await exec('yc', ['iam', 'create-token'], { timeout: 10_000, maxBuffer: 16_384 })).stdout.trim();
      } else {
        const response = await fetchImpl(METADATA_URL, {
          headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error('Metadata token unavailable');
        const payload = await response.json();
        token = payload.access_token;
        lifetime = Math.min(3600, Number(payload.expires_in));
      }
      if (typeof token !== 'string' || !token || /[\r\n]/.test(token) || !Number.isFinite(lifetime) || lifetime <= 60) {
        throw new Error('Invalid IAM token');
      }
      cached = { source, token, expiresAt: now() + lifetime * 1000 };
      return token;
    })();
    pending = { source, promise };
    try { return await promise; }
    catch { throw new YandexAiError('Не удалось подключить базовую модель.', { status: 503, code: 'yandex_ai_auth_failed' }); }
    finally { if (pending?.promise === promise) pending = null; }
  };
}

export const loadYandexAiToken = createYandexAiTokenLoader();

export async function fetchYandexAi(path, body, {
  env = process.env, fetchImpl = fetch, tokenLoader = loadYandexAiToken, signal,
} = {}) {
  if (!['chat/completions', 'responses'].includes(path)) throw new Error('Unsupported Yandex AI endpoint');
  const config = yandexAiConfig(env);
  if (!config.enabled) throw new YandexAiError('Базовая модель не настроена.', { status: 503 });
  const token = await tokenLoader(env);
  let response;
  try {
    response = await fetchImpl(`https://ai.api.cloud.yandex.net/v1/${path}`, {
      method: 'POST', redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        'x-folder-id': config.folderId, 'x-data-logging-enabled': 'false',
      },
      body: JSON.stringify({ ...body, model: config.model }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
    });
  } catch {
    throw new YandexAiError('Не удалось получить ответ базовой модели.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new YandexAiError('Базовая модель временно недоступна. Попробуйте позже.', {
      status: response.status === 429 ? 429 : 503,
      code: response.status === 429 ? 'yandex_ai_rate_limited' : 'yandex_ai_unavailable',
    });
  }
  const payload = await response.json().catch(() => null);
  if (!payload || payload.error || (path === 'responses' && payload.status !== 'completed')) {
    throw new YandexAiError('Базовая модель не вернула полный ответ.', { code: 'yandex_ai_invalid_response' });
  }
  return payload;
}
