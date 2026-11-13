import { buildOpenRouterMarketplaceRequest, directProductUrl, fetchOpenRouterMarketplaceOffers, normalizeOpenRouterOffers } from './openrouter-marketplace-offers.js';
import { fetchYandexAi, yandexAiConfig, YandexAiError } from './yandex-ai.js';

export async function fetchYandexMarketplaceOffers(wish, { marketplaceIds, signal, request = fetchYandexAi, now = () => new Date() } = {}) {
  const { body } = buildOpenRouterMarketplaceRequest(wish, { marketplaceIds });
  const requestedDomains = [...new Set(body.tools[0].parameters.allowed_domains)];
  // A parent domain already covers its subdomains. Keep all marketplaces
  // instead of letting Wildberries' extra hostname displace DNS at the limit.
  const domains = requestedDomains.filter(domain => !requestedDomains.some(parent => domain.endsWith(`.${parent}`)));
  if (domains.length > 5) throw new YandexAiError('Для одного поиска выбрано слишком много площадок.', { status: 400, code: 'yandex_ai_search_scope_invalid' });
  const input = body.messages.map(message => ({ ...message }));
  // Structured output suppressed web search in live trials. Ask for JSON in the
  // prompt, validate locally, and retain only URLs grounded in search citations.
  input[0].content += ` Обязательно используй web_search. Верни JSON без Markdown по схеме: ${JSON.stringify(body.response_format.json_schema.schema)}`;
  const payload = await request('responses', {
    input, store: false, max_output_tokens: 2000, max_tool_calls: 3,
    tools: [{ type: 'web_search', search_context_size: 'low', filters: { allowed_domains: domains } }],
  }, { signal });
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts = output.filter(item => item.type === 'message' && item.role === 'assistant')
    .flatMap(item => item.content || []).filter(item => item.type === 'output_text');
  const annotations = parts.flatMap(part => part.annotations || []).filter(item => item.type === 'url_citation');
  const checkedAt = now().toISOString();
  let result;
  try {
    const citedUrls = new Set(annotations.map(item => directProductUrl(item.url, marketplaceIds)?.url).filter(Boolean));
    result = normalizeOpenRouterOffers({ choices: [{ message: { content: parts.map(part => part.text).join('\n') } }] }, checkedAt, {
      marketplaceIds,
      distinctMarketplaces: false,
      acceptOffer: url => citedUrls.has(url),
    });
  } catch {
    throw new YandexAiError('Базовая модель вернула неполный список предложений.', { code: 'yandex_ai_invalid_response' });
  }
  if (!output.some(item => item.type === 'web_search_call' && item.status === 'completed')) result.offers = [];
  return { ...result, model: payload.model, usage: payload.usage || null };
}

export async function fetchMarketplaceAiOffers(wish, credential, {
  marketplaceIds, signal, env = process.env,
  fetchOpenRouter = fetchOpenRouterMarketplaceOffers, fetchYandex = fetchYandexMarketplaceOffers,
} = {}) {
  const search = { marketplaceIds, signal };
  if (credential.provider === 'yandex') return fetchYandex(wish, search);
  try {
    return await fetchOpenRouter(wish, {
      ...search, apiKey: credential.apiKey, model: credential.model, allowEmpty: true,
    });
  } catch (error) {
    if (error?.code !== 'openrouter_credits_missing' || signal?.aborted || !yandexAiConfig(env).enabled) throw error;
    return fetchYandex(wish, search);
  }
}
