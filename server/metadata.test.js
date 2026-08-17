import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeHtmlEntities,
  isYandexMapsUrl,
  isYouTubeUrl,
  normalizeCurrency,
  normalizePrice,
  parseProductMetadata,
  parseYandexMapsMetadata,
  parseYouTubeMetadata,
  parseYouTubeVideoId,
  resolveImageUrl,
  youtubeThumbnailUrl,
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

test("derives the place title from the org slug when og:title is the generic maps shell", () => {
  const html = `
    <meta property="og:title" content="Яндекс&nbsp;Карты &mdash; транспорт, навигация, поиск мест">
    <meta property="og:description" content="Карты помогут найти нужное место и построить маршрут">
    <meta property="og:image" content="https://static-maps.yandex.ru/1.x/?ll=30.3,59.9">`;

  assert.deepEqual(
    parseYandexMapsMetadata(html, "https://yandex.ru/maps/org/peterburg_bagel_company/153670098251/"),
    {
      title: "Peterburg Bagel Company",
      description: "",
      imageUrl: "https://static-maps.yandex.ru/1.x/?ll=30.3,59.9",
      price: null,
      currency: "",
      kind: "place",
    },
  );
});

test("uses the text query parameter when og:title is the generic maps shell", () => {
  const html = `
    <meta property="og:title" content="Yandex Maps &mdash; transport, navigation, places search">
    <meta name="twitter:description" content="Yandex Maps will help you find the place you need">`;

  const result = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/?text=%D0%9A%D0%BE%D1%84%D0%B5%D0%B9%D0%BD%D1%8F%20%D0%97%D0%B5%D1%80%D0%BD%D0%BE",
  );
  assert.equal(result.title, "Кофейня Зерно");
  assert.equal(result.description, "");
  assert.equal(result.kind, "place");
});

test("a bare Яндекс Карты title is treated as generic and falls back to the slug", () => {
  const html = `<meta property="og:title" content="Яндекс Карты">`;

  const result = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/org/kofeynya-zerno/987654321",
  );
  assert.equal(result.title, "Kofeynya Zerno");
});

test("capitalizes org slugs with hyphens and plus signs", () => {
  const html = `<meta property="og:title" content="Яндекс Карты — транспорт, навигация, поиск мест">`;

  const hyphenated = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/org/grand-cafe-mu-mu/123456789/",
  );
  assert.equal(hyphenated.title, "Grand Cafe Mu Mu");

  const pluses = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/org/coffee+house+central/123456789/",
  );
  assert.equal(pluses.title, "Coffee House Central");
});

test("prefers the text query parameter over the org slug", () => {
  const html = `<meta property="og:title" content="Yandex Maps">`;

  const result = parseYandexMapsMetadata(
    html,
    "https://yandex.ru/maps/org/peterburg_bagel_company/153670098251/?text=%D0%91%D0%B5%D0%B9%D0%B6%D0%BB%D1%8B",
  );
  assert.equal(result.title, "Бейжлы");
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

test("extracts YouTube video ids from all supported url forms", () => {
  const id = "dQw4w9WgXcQ";
  const valid = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?t=42`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/shorts/${id}?feature=share`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube.com/v/${id}`,
    `http://www.youtube.com/watch?v=${id}`,
  ];
  for (const url of valid) {
    assert.equal(parseYouTubeVideoId(url), id, url);
    assert.equal(isYouTubeUrl(url), true, url);
  }
  assert.equal(parseYouTubeVideoId(new URL(`https://youtu.be/${id}`)), id);
});

test("rejects non-YouTube urls and malformed video ids", () => {
  const invalid = [
    "https://vimeo.com/12345678901",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=",
    "https://www.youtube.com/",
    "https://www.youtube.com/feed/subscriptions",
    "https://www.youtube.com/watch?v=dQw4w9WgXc",
    "https://youtu.be/dQw4w9WgXc",
    "https://youtu.be/dQw4w9WgXcQ!",
    "https://youtu.be/dQw4w9WgXcQextra",
    "https://www.youtube.com/embed/dQw4w9WgXc",
    "ftp://youtu.be/dQw4w9WgXcQ",
    "not a url",
    "",
  ];
  for (const url of invalid) {
    assert.equal(parseYouTubeVideoId(url), "", url);
    assert.equal(isYouTubeUrl(url), false, url);
  }
});

test("builds the deterministic YouTube thumbnail url", () => {
  assert.equal(youtubeThumbnailUrl("dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
});

test("maps a complete oEmbed response to video metadata", () => {
  const oembed = {
    title: "Rick Astley - Never Gonna Give You Up (Official Video)",
    author_name: "Rick Astley",
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  };

  assert.deepEqual(parseYouTubeMetadata(oembed, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
    title: "Rick Astley - Never Gonna Give You Up (Official Video)",
    description: "Rick Astley",
    imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    price: null,
    currency: "",
    kind: "video",
  });
});

test("falls back to the i.ytimg.com thumbnail when oEmbed has no usable thumbnail_url", () => {
  for (const oembed of [
    { title: "Video", author_name: "Author" },
    { title: "Video", author_name: "Author", thumbnail_url: "" },
    { title: "Video", author_name: "Author", thumbnail_url: "data:image/png;base64,AAAA" },
  ]) {
    const result = parseYouTubeMetadata(oembed, "https://youtu.be/dQw4w9WgXcQ");
    assert.equal(result.imageUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    assert.equal(result.kind, "video");
  }
});

test("cleans entities and markup from the oEmbed title and limits it to 160 chars", () => {
  const result = parseYouTubeMetadata(
    {
      title: `Котики &amp; <b>уют</b>&nbsp;—&nbsp;${"очень ".repeat(60)}длинное видео`,
      author_name: "Канал &laquo;Уют&raquo;",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    },
    "https://youtu.be/dQw4w9WgXcQ",
  );
  assert.ok(result.title.startsWith("Котики & уют — "));
  assert.ok(!/[<&]/.test(result.title.replace("Котики & уют", "")));
  assert.ok(!/&[a-z]+;/.test(result.title));
  assert.ok(result.title.length <= 160);
  assert.equal(result.description, "Канал «Уют»");
});

test("tolerates a missing or non-object oEmbed payload", () => {
  const result = parseYouTubeMetadata(null, "https://youtu.be/dQw4w9WgXcQ");
  assert.deepEqual(result, {
    title: "",
    description: "",
    imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    price: null,
    currency: "",
    kind: "video",
  });
});
