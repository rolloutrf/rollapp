import { buildOpenRouterMarketplaceRequest, normalizeOpenRouterOffers } from './openrouter-marketplace-offers.js';
import { fetchYandexAi, YandexAiError } from './yandex-ai.js';

export async function fetchYandexMarketplaceOffers(wish, { marketplaceIds, signal, request = fetchYandexAi, now = () => new Date() } = {}) {
  const { body } = buildOpenRouterMarketplaceRequest(wish, { marketplaceIds });
  const domains = [...new Set(body.tools[0].parameters.allowed_domains)].slice(0, 5);
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
    result = normalizeOpenRouterOffers({ choices: [{ message: { content: parts.map(part => part.text).join('\n') } }] }, checkedAt, { marketplaceIds });
    // Normalize each citation individually: the shared parser returns only one
    // offer per marketplace, while the model may select a different cited card.
    const citedUrls = new Set(annotations.flatMap(item => normalizeOpenRouterOffers({ choices: [{ message: {
      content: '{"offers":[]}', annotations: [{ type: 'url_citation', url_citation: { ...item, title: item.title || 'Источник' } }],
    } }] }, checkedAt, { marketplaceIds }).offers.map(offer => offer.url)));
    result.offers = result.offers.filter(offer => citedUrls.has(offer.url));
  } catch {
    throw new YandexAiError('Базовая модель вернула неполный список предложений.', { code: 'yandex_ai_invalid_response' });
  }
  if (!output.some(item => item.type === 'web_search_call' && item.status === 'completed')) result.offers = [];
  return { ...result, model: payload.model, usage: payload.usage || null };
}
