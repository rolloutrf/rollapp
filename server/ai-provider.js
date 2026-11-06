import { resolveOpenRouterCredential } from './openrouter-credential.js';
import { resolveOpenRouterModel } from './openrouter-settings.js';
import { DEFAULT_MODEL } from './openrouter-marketplace-offers.js';
import { yandexAiConfig } from './yandex-ai.js';

export function resolveAiCredential(credential, { userId, env = process.env } = {}) {
  const resolved = resolveOpenRouterCredential(credential, { userId, env, serverApiKey: env.OPENROUTER_API_KEY || '' });
  const yandex = yandexAiConfig(env);
  if (resolved.source !== 'user' && yandex.enabled) {
    return { provider: 'yandex', source: 'server', model: yandex.model, warning: resolved.warning };
  }
  return {
    ...resolved, provider: 'openrouter',
    model: resolveOpenRouterModel(credential, { source: resolved.source, defaultModel: env.OPENROUTER_MODEL || DEFAULT_MODEL }),
  };
}

export function hasAiCredential(credential) {
  return credential?.provider === 'yandex' || Boolean(credential?.apiKey);
}

export function sharedAiConfigured(env = process.env) {
  return yandexAiConfig(env).enabled || Boolean(env.OPENROUTER_API_KEY);
}
