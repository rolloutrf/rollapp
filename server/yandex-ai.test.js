import assert from 'node:assert/strict';
import test from 'node:test';
import { createYandexAiTokenLoader, fetchYandexAi, YandexAiError } from './yandex-ai.js';
import { resolveAiCredential, sharedAiConfigured, hasAiCredential } from './ai-provider.js';
import { encryptUserCredential } from './user-credentials.js';
import { fetchYandexMarketplaceOffers } from './yandex-marketplace-offers.js';

const env = { YC_FOLDER_ID: 'folder', YANDEX_AI_MODEL: 'aliceai-llm-flash', USER_CREDENTIALS_SECRET: 'stable-test-secret-with-at-least-32-characters' };

test('personal OpenRouter wins; absent/deleted credentials use Yandex ahead of the legacy server key', () => {
  const configured = { ...env, OPENROUTER_API_KEY: 'shared-key' };
  const personal = { model: 'personal/model', encrypted_secret: encryptUserCredential('personal-key', { userId: 'owner', provider: 'openrouter', env }) };
  const result = resolveAiCredential(personal, { userId: 'owner', env: configured });
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.apiKey, 'personal-key');
  assert.equal(result.model, 'personal/model');
  const fallback = resolveAiCredential(null, { userId: 'owner', env: configured });
  assert.equal(fallback.provider, 'yandex');
  assert.equal(fallback.model, 'gpt://folder/aliceai-llm-flash');
  assert.equal(fallback.apiKey, undefined);
  assert.equal(hasAiCredential(fallback), true);
  assert.equal(sharedAiConfigured(env), true);
  assert.equal(sharedAiConfigured({ YANDEX_AI_MODEL: 'aliceai-llm-flash' }), false);
  assert.equal(resolveAiCredential(null, { env: { OPENROUTER_API_KEY: 'legacy' } }).apiKey, 'legacy');
  assert.equal(hasAiCredential(resolveAiCredential(null, { env: {} })), false);
  const wrongOwner = resolveAiCredential(personal, { userId: 'other', env });
  assert.equal(wrongOwner.provider, 'yandex');
  assert.ok(wrongOwner.warning);
  assert.doesNotMatch(JSON.stringify(wrongOwner), /personal-key/);
});

test('IAM token refresh is single-flight, bounded by expiry, and metadata never receives app secrets', async () => {
  let clock = 0;
  let count = 0;
  const loader = createYandexAiTokenLoader({ now: () => clock, fetchImpl: async (url, options) => {
    count++;
    assert.equal(new URL(url).hostname, '169.254.169.254');
    assert.deepEqual(options.headers, { 'Metadata-Flavor': 'Google' });
    assert.equal(options.redirect, 'error');
    return Response.json({ access_token: `token-${count}`, expires_in: 120 });
  } });
  assert.deepEqual(await Promise.all([loader({}), loader({})]), ['token-1', 'token-1']);
  assert.equal(count, 1);
  clock = 61_000;
  assert.equal(await loader({}), 'token-2');
  assert.equal(await loader({ YC_IAM_TOKEN: 'explicit' }), 'explicit');
  const broken = createYandexAiTokenLoader({ fetchImpl: async () => { throw Error('secret transport error'); } });
  await assert.rejects(broken({}), error => error instanceof YandexAiError && !error.message.includes('secret'));
});

test('Yandex request pins host/model, disables logging, propagates cancellation, and hides upstream bodies', async () => {
  const controller = new AbortController();
  controller.abort();
  await fetchYandexAi('chat/completions', { model: 'untrusted', messages: [] }, {
    env, signal: controller.signal, tokenLoader: async () => 'test-token', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://ai.api.cloud.yandex.net/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.headers['x-data-logging-enabled'], 'false');
      assert.equal(JSON.parse(options.body).model, 'gpt://folder/aliceai-llm-flash');
      assert.equal(options.signal.aborted, true);
      assert.equal(options.redirect, 'error');
      return Response.json({ choices: [] });
    },
  });
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(fetchYandexAi('responses', {}, {
      env, tokenLoader: async () => 'test-token', fetchImpl: async () => new Response('private upstream data', { status }),
    }), error => error instanceof YandexAiError && error.status === (status === 429 ? 429 : 503) && !error.message.includes('private'));
  }
  await assert.rejects(fetchYandexAi('responses', {}, {
    env, tokenLoader: async () => 'test-token', fetchImpl: async () => Response.json({ status: 'incomplete', output: [] }),
  }), { code: 'yandex_ai_invalid_response' });
});

test('marketplace accepts only direct cited cards after a completed search and rejects incomplete JSON', async () => {
  const url = 'https://market.yandex.ru/card/headphones/123';
  const offer = { marketplace: 'Яндекс Маркет', title: 'Headphones', price: null, currency: 'RUB', url, seller: '', delivery: '', available: false, score: 95, reason: 'Точная модель' };
  const makeRequest = ({ cited = true, searched = true, text = JSON.stringify({ offers: [offer], summary: 'Найдена карточка' }) } = {}) => async (path, body) => {
    assert.equal(path, 'responses');
    assert.equal(body.store, false);
    assert.equal(body.max_tool_calls, 3);
    assert.equal(body.text, undefined);
    assert.equal(body.tools[0].search_context_size, 'low');
    assert.ok(body.tools[0].filters.allowed_domains.length <= 5);
    return { model: 'yandex/model', output: [
      ...(searched ? [{ type: 'web_search_call', status: 'completed' }] : []),
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: cited ? [{ type: 'url_citation', url }] : [] }] },
    ] };
  };
  const options = { marketplaceIds: ['yandex-market'], request: makeRequest() };
  const result = await fetchYandexMarketplaceOffers({ title: 'Headphones' }, options);
  assert.equal(result.offers[0].url, url);
  assert.equal(result.offers[0].price, null);
  for (const variant of [{ cited: false }, { searched: false }]) {
    assert.deepEqual((await fetchYandexMarketplaceOffers({}, { ...options, request: makeRequest(variant) })).offers, []);
  }
  await assert.rejects(fetchYandexMarketplaceOffers({}, { ...options, request: makeRequest({ text: 'broken' }) }), { code: 'yandex_ai_invalid_response' });
});
