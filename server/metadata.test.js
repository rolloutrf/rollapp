import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeHtmlEntities,
  isYandexMapsUrl,
  normalizeCurrency,
  normalizePrice,
  parseProductMetadata,
  parseYandexMapsMetadata,
  resolveImageUrl,
} from "./metadata.js";

test("parses Open Graph metadata regardless of attribute order", () => {
  const html = `
    <html>
      <head>
        <meta content="Чай &amp; уют" property="og:title">
        <meta property="og:description" content="Подарочный&nbsp;набор &laquo;Лес&raquo;">
        <meta content="/images/tea.jpg?size=large&amp;v=2" property="og:image">
        <meta property="product:price:amount" content="12 490,50 ₽">
        <meta content="руб." property="product:price:currency">
      </head>
    </html>`;

  assert.deepEqual(parseProductMetadata(html, "https://shop.example/catalog/item"), {
    title: "Чай & уют",
    description: "Подарочный набор «Лес»",
    imageUrl: "https://shop.example/images/tea.jpg?size=large&v=2",
    price: 12_490.5,
    currency: "RUB",
  });
});

test("finds a Product and AggregateOffer inside a JSON-LD graph", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "BreadcrumbList", "name": "Catalog" },
          {
            "@type": ["Thing", "Product"],
            "name": "Studio headphones",
            "description": "Closed-back &amp; wireless",
            "image": [{ "url": "//cdn.example/products/headphones.webp" }],
            "offers": {
              "@type": "AggregateOffer",
              "lowPrice": "1,299.95",
              "priceCurrency": "usd"
            }
          }
        ]
      }
    </script>`;

  assert.deepEqual(parseProductMetadata(html, "https://store.example/item/42"), {
    title: "Studio headphones",
    description: "Closed-back & wireless",
    imageUrl: "https://cdn.example/products/headphones.webp",
    price: 1_299.95,
    currency: "USD",
  });
});

test("reads JSON-LD arrays and nested price specifications", () => {
  const html = `
    <script type="application/ld+json">
      [
        { "@type": "Organization", "name": "Store" },
        {
          "@type": "https://schema.org/Product",
          "name": "Linen throw",
          "image": "../assets/throw.jpg",
          "offers": [
            {
              "@type": "Offer",
              "priceSpecification": {
                "@type": "UnitPriceSpecification",
                "price": "89,90",
                "priceCurrency": "EUR"
              }
            }
          ]
        }
      ];
    </script>`;

  const result = parseProductMetadata(html, "https://home.example/products/linen/");
  assert.equal(result.title, "Linen throw");
  assert.equal(result.imageUrl, "https://home.example/products/assets/throw.jpg");
  assert.equal(result.price, 89.9);
  assert.equal(result.currency, "EUR");
});

test("uses schema.org microdata when meta and JSON-LD are absent", () => {
  const html = `
    <article itemscope itemtype="https://schema.org/Product">
      <h1 itemprop="name">Кофемолка&nbsp;&mdash;&nbsp;Mini</h1>
      <p itemprop="description">Для <b>свежего</b> кофе</p>
      <img alt="" src="../media/grinder.png" itemprop="image">
      <meta content="45.000" itemprop="price">
      <span itemprop="priceCurrency">KZT</span>
    </article>`;

  assert.deepEqual(parseProductMetadata(html, "https://market.example/product/coffee"), {
    title: "Кофемолка — Mini",
    description: "Для свежего кофе",
    imageUrl: "https://market.example/media/grinder.png",
    price: 45_000,
    currency: "KZT",
  });
});

test("supports Twitter cards with labeled prices", () => {
  const html = `
    <meta name="twitter:title" content="Плед из шерсти">
    <meta name="twitter:image" content="https://cdn.example/blanket.jpg">
    <meta name="twitter:label1" content="Цена">
    <meta name="twitter:data1" content="149,00 BYN">
  `;

  const result = parseProductMetadata(html, "https://shop.example/blanket");
  assert.equal(result.title, "Плед из шерсти");
  assert.equal(result.imageUrl, "https://cdn.example/blanket.jpg");
  assert.equal(result.price, 149);
  assert.equal(result.currency, "BYN");
});

test("detects Yandex Maps urls across domains and short links", () => {
  const valid = [
    "https://yandex.ru/maps/213/moscow/?ll=37.6%2C55.7&z=10",
    "https://yandex.ru/maps/-/CCQazZZZZZ",
    "https://www.yandex.ru/maps/org/kofeynya/123456789/",
    "https://yandex.com/maps/what/some-place",
    "https://yandex.kz/maps/-/abc",
    "https://yandex.by/maps/",
    "https://yandex.ua/maps?text=%D0%BA%D0%BE%D1%84%D0%B5%D0%B9%D0%BD%D1%8F",
    "https://ya.ru/maps/-/short",
    "http://yandex.ru/maps",
  ];
  for (const url of valid) {
    assert.equal(isYandexMapsUrl(url), true, url);
  }

  const invalid = [
    "https://yandex.ru/search/?text=test",
    "https://yandex.ru/",
    "https://yandex.com/images",
    "https://maps.yandex.ru/",
    "https://yandex.ru.evil.example/maps/",
    "https://fakeyandex.ru/maps/",
    "https://ya.ru/",
    "https://ya.ru/nearby",
    "ftp://yandex.ru/maps/",
    "not a url",
    "",
  ];
  for (const url of invalid) {
    assert.equal(isYandexMapsUrl(url), false, url);
  }
});

test("parses Yandex Maps place metadata from Open Graph tags", () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Кофейня &laquo;Зерно&raquo; &mdash; Яндекс&nbsp;Карты">
        <meta property="og:description" content="Москва, улица Примерная, 10 &#8226; 4,8 (256 оценок)">
        <meta property="og:image" content="https://avatars.mds.yandex.net/get-altay/123/2a000001/orig">
        <meta property="product:price:amount" content="500">
      </head>
    </html>`;

  assert.deepEqual(parseYandexMapsMetadata(html, "https://yandex.ru/maps/org/zerno/123/"), {
    title: "Кофейня «Зерно»",
    description: "Москва, улица Примерная, 10 • 4,8 (256 оценок)",
    imageUrl: "https://avatars.mds.yandex.net/get-altay/123/2a000001/orig",
    price: null,
    currency: "",
    kind: "place",
  });
});

test("strips the latin Yandex Maps suffix and resolves relative images", () => {
  const html = `
    <meta property="og:title" content="Coffee Spot - Yandex Maps">
    <meta property="og:image" content="/static/preview.png">`;

  const result = parseYandexMapsMetadata(html, "https://yandex.com/maps/-/abcdef");
  assert.equal(result.title, "Coffee Spot");
  assert.equal(result.imageUrl, "https://yandex.com/static/preview.png");
  assert.equal(result.price, null);
  assert.equal(result.kind, "place");
});

test("falls back to the text query parameter when og:title is empty", () => {
  const html = `
    <meta property="og:description" content="Адрес и рейтинг места">`;

  const result = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/?text=%D0%9A%D0%BE%D1%84%D0%B5%D0%B9%D0%BD%D1%8F%20%D0%97%D0%B5%D1%80%D0%BD%D0%BE",
  );
  assert.equal(result.title, "Кофейня Зерно");
  assert.equal(result.description, "Адрес и рейтинг места");
  assert.equal(result.imageUrl, "");
  assert.equal(result.price, null);
  assert.equal(result.currency, "");
  assert.equal(result.kind, "place");
});

test("normalizes prices, currencies, entities, and safe image URLs", () => {
  assert.equal(normalizePrice("1.234.567,89 ₽"), 1_234_567.89);
  assert.equal(normalizePrice("$ 2,499.00"), 2_499);
  assert.equal(normalizePrice("по запросу"), null);
  assert.equal(normalizeCurrency("RUR"), "RUB");
  assert.equal(normalizeCurrency("", "19,90 €"), "EUR");
  assert.equal(normalizeCurrency("BYR"), "BYN");
  assert.equal(decodeHtmlEntities("&#1055;&#x440;&#1080;&#1074;&#1077;&#1090;"), "Привет");
  assert.equal(resolveImageUrl("/photo?a=1&amp;b=2", "https://example.com/item"), "https://example.com/photo?a=1&b=2");
  assert.equal(resolveImageUrl("data:image/png;base64,AAAA", "https://example.com/item"), "");
  assert.equal(resolveImageUrl(`https://example.com/${"x".repeat(2_000)}`, "https://example.com/item"), "");
});
