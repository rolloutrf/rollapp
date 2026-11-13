import { domainToASCII } from 'node:url';
import { z } from 'zod';
import { marketplaceProductScore } from '../shared/product-match.js';
import { assistantWishCurrency } from '../shared/messenger-assistant.js';
import { fetchMarketplaceResolvedOffers } from './marketplace-resolvers.js';
import { fetchPublicHtml, parsePublicHttpUrl, resolvePublicHost } from './metadata-fetch.js';
import { parseStructuredProductMetadata } from './metadata.js';
import { directProductUrl } from './openrouter-marketplace-offers.js';
import { fetchMarketplaceIndex } from './yandex-marketplace-index.js';
import { fetchMarketplaceAiOffers } from './yandex-marketplace-offers.js';

export const productSearchInput = z.object({
  query: z.string().trim().min(1).max(160).describe('Название товара в именительном падеже, включая явно указанную модель, марку и основные характеристики'),
  requirements: z.string().trim().max(400).default('').describe('Дополнительные критерии выбора только из запроса'),
  site: z.string().trim().min(1).max(253).describe('ozon, wildberries, yandex-market, megamarket, dns или точный домен из сообщения пользователя'),
  maxPrice: z.number().positive().max(999999999).nullable().default(null).describe('Максимальная цена, если пользователь её указал'),
  currency: assistantWishCurrency.default('RUB'),
  listName: z.string().trim().min(1).max(160).nullable().default(null),
}).strict();

const marketplaces = [
  { id: 'ozon', domain: 'ozon.ru', label: 'Ozon', names: /(?:ozon|озон(?:а|е|у|ом)?)/iu },
  { id: 'wildberries', domain: 'wildberries.ru', label: 'Wildberries', names: /(?:wildberries|вайлдберриз|вайлдберрис|вб|wb)/iu },
  { id: 'yandex-market', domain: 'market.yandex.ru', label: 'Яндекс Маркет', names: /(?:яндекс(?:а|е|у|ом)?(?:[.\s-]+маркет(?:а|е|у|ом)?)?|yandex[\s-]*market)/iu },
  { id: 'megamarket', domain: 'megamarket.ru', label: 'Мегамаркет', names: /(?:мегамаркет[аеу]?|megamarket)/iu },
  { id: 'dns', domain: 'dns-shop.ru', label: 'DNS', names: /(?:dns|днс)/iu },
];

function storeDomain(value) {
  if (!/^[\p{L}\p{N}.-]+$/u.test(value)) return '';
  const domain = domainToASCII(value.toLowerCase().replace(/^www\./u, ''));
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/u.test(domain) ? domain : '';
}

function requestedStore(site, messages) {
  const domain = storeDomain(site);
  const known = marketplaces.find(store => store.id === site.toLowerCase() || store.domain === domain);
  if (!known && !domain) return null;
  for (const { content } of messages.filter(message => message.role === 'user').reverse()) {
    const domains = [...content.matchAll(/(?:^|[^\p{L}\p{N}@.\-])((?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63})(?![\p{L}\p{N}-])/gu)]
      .map(([, host]) => storeDomain(host)).filter(Boolean);
    const named = marketplaces.filter(store => domains.includes(store.domain) ||
      new RegExp(`(?:^|[^\\p{L}\\p{N}])${store.names.source}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(content));
    if (known && named.includes(known)) return known;
    if (!known && domains.includes(domain)) return { domain, label: domain };
    if (named.length || domains.length) return null;
  }
  return null;
}

function productPage(value, store) {
  try {
    const url = parsePublicHttpUrl(value);
    if (url.protocol !== 'https:' || url.href.length > 2000) return null;
    if (store.id) return directProductUrl(url, [store.id])?.url || null;
    if (storeDomain(url.hostname) !== store.domain || url.pathname === '/') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export async function searchAssistantProduct(input, messages, credential, {
  signal, env,
  directSearch = fetchMarketplaceResolvedOffers, indexSearch = fetchMarketplaceIndex,
  aiSearch = fetchMarketplaceAiOffers, readPage = fetchPublicHtml, resolveImageHost = resolvePublicHost,
} = {}) {
  const store = requestedStore(input.site, messages);
  if (!store) return { reply: 'Укажите площадку или домен магазина, где искать товар.' };

  const { query, requirements, maxPrice, currency, listName } = input;
  const wish = { title: query, space: 'products', currency };
  const marketplaceIds = store.id ? [store.id] : [];
  const priceMatches = offer => offer.price > 0 && offer.currency === currency && (maxPrice === null || offer.price <= maxPrice);
  const rank = offer => marketplaceProductScore(wish, offer.title);
  const bestPriced = offers => offers.filter(offer => productPage(offer.url, store) && rank(offer) >= 70 && priceMatches(offer))
    .sort((a, b) => rank(b) - rank(a) || Number(b.available) - Number(a.available) || (b.score || 0) - (a.score || 0) || a.price - b.price);

  async function enrich(offer) {
    const url = productPage(offer.url, store);
    if (!url) return null;
    try {
      const page = await readPage(url, { signal, timeoutMs: 3500, allowRedirect: target => Boolean(productPage(target, store)) });
      const finalUrl = productPage(page.url, store);
      if (!finalUrl) return null;
      const metadata = parseStructuredProductMetadata(page.html, finalUrl);
      if (metadata.productFound) {
        if (rank(metadata) < 70) return null;
        return { ...offer, ...metadata, imageUrl: metadata.imageUrl || offer.imageUrl, url: finalUrl, price: metadata.price ?? offer.price,
          currency: metadata.price === null ? offer.currency : metadata.currency || offer.currency };
      }
    } catch {
      signal?.throwIfAborted();
    }
    return store.id ? { ...offer, url } : null;
  }

  const direct = await directSearch(wish, { marketplaceIds, distinctMarketplaces: false, providerTimeoutMs: 5000, signal });
  signal?.throwIfAborted();
  const listed = bestPriced(direct).slice(0, 3);
  const checkedListings = await Promise.all(listed.map(enrich));
  let product = bestPriced(checkedListings.filter(Boolean))[0];
  let unpriced;
  let sourceError = false;

  if (!product) {
    const [index, researched] = await Promise.allSettled([
      indexSearch(query, { domains: [store.domain], signal, env }).then(async documents => {
        const candidates = documents.flatMap(doc => {
          const url = productPage(doc.url, store);
          const title = typeof doc.title === 'string' ? doc.title.split(/\s+(?:[—–]\s+)?купить(?=\s|$)/iu, 1)[0].slice(0, 160) : '';
          return url && rank({ title }) >= 70 ? [{ url, title, price: null, currency }] : [];
        });
        const unique = [...new Map(candidates.map(offer => [offer.url, offer])).values()].slice(0, 5);
        return (await Promise.all(unique.map(enrich))).filter(Boolean);
      }),
      store.id ? aiSearch({ ...wish, description: [requirements, maxPrice && `Бюджет до ${maxPrice} ${currency}`].filter(Boolean).join('. ') }, credential, {
        marketplaceIds, requireCitations: true, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(18_000)]) : AbortSignal.timeout(18_000), env,
      }) : Promise.resolve({ offers: [] }),
    ]);
    signal?.throwIfAborted();
    const indexed = index.status === 'fulfilled' ? index.value : [];
    const verified = bestPriced(indexed)[0];
    const seenUrls = new Set(indexed.map(offer => offer.url));
    const aiOffers = researched.status === 'fulfilled' ? researched.value.offers : [];
    const unchecked = aiOffers.filter(offer => {
      const url = productPage(offer.url, store);
      return url && !seenUrls.has(url) && rank(offer) >= 70;
    }).slice(0, 3);
    const checkedAi = verified ? [] : (await Promise.all(unchecked.map(offer => enrich({ ...offer, price: null })))).filter(Boolean);
    product = verified || bestPriced(checkedAi)[0];
    unpriced = [...indexed, ...checkedAi].find(offer => offer.price === null);
    sourceError = index.status === 'rejected' || researched.status === 'rejected';
  }

  const chosen = product || unpriced;
  if (!chosen) {
    return { reply: sourceError ? `Поиск на ${store.label} не дал подходящей карточки. Попробуйте ещё раз или пришлите прямую ссылку.` :
      `На ${store.label} не удалось найти подходящую карточку${maxPrice === null ? '' : ' в указанном бюджете'}. Можно уточнить запрос или прислать ссылку.` };
  }
  const url = productPage(chosen.url, store);
  let imageUrl = '';
  if (chosen.imageUrl) {
    try {
      const image = parsePublicHttpUrl(chosen.imageUrl);
      if (image.protocol === 'https:' && image.href.length <= 2000 && !signal?.aborted) {
        await resolveImageHost(image);
        imageUrl = image.href;
      }
    } catch { /* The product can be reviewed without an image. */ }
  }
  return {
    reply: product ? `Подобрал товар в магазине «${store.label}». Карточка готова к проверке.` :
      `Нашёл карточку в магазине «${store.label}». Цену подтвердить не удалось${maxPrice === null ? '' : ', поэтому соответствие бюджету пока неизвестно'}.`,
    wish: {
      title: chosen.title.slice(0, 160), description: chosen.description || '', url,
      imageUrl, price: chosen.price, currency, listName,
    },
  };
}
