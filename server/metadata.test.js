import assert from "node:assert/strict";
import test from "node:test";
import {
  bookmateApiUrl,
  decodeHtmlEntities,
  isBookmateUrl,
  isKinopoiskUrl,
  isYandexMapsUrl,
  isYouTubeUrl,
  parseVkVideoEmbedThumbnail,
  parseVkVideoEmbedUrl,
  parseVkVideoMetadata,
  normalizeCurrency,
  normalizePrice,
  parseBookmateMetadata,
  parseKinopoiskMetadata,
  parseProductMetadata,
  parseStructuredProductMetadata,
  parseYandexMapsMetadata,
  parseYouTubeMetadata,
  parseYouTubeVideoId,
  resolveImageUrl,
  youtubeThumbnailUrl,
} from "./metadata.js";

test("recognizes Kinopoisk film and series links without accepting lookalike hosts", () => {
  assert.equal(isKinopoiskUrl("https://www.kinopoisk.ru/film/435/"), true);
  assert.equal(isKinopoiskUrl("https://m.kinopoisk.ru/series/77044/"), true);
  assert.equal(isKinopoiskUrl("https://kinopoisk.ru.evil.example/film/435/"), false);
  assert.equal(isKinopoiskUrl("https://www.kinopoisk.ru/lists/movies/top250/"), false);
});

test("maps a Kinopoisk content link to its stable poster preview", () => {
  assert.deepEqual(parseKinopoiskMetadata("https://www.kinopoisk.ru/film/435/"), {
    title: "",
    description: "",
    imageUrl: "https://st.kp.yandex.net/images/film_iphone/iphone360_435.jpg",
    price: null,
    currency: "",
    kind: "media",
  });
});

test("recognizes Bookmate media links and builds public API urls", () => {
  const valid = [
    ["https://rus.bookmate.com/books/hPi0Nn9f", "https://api.bookmate.com/api/v5/books/hPi0Nn9f"],
    ["https://bookmate.com/audiobooks/yWv285RP/", "https://api.bookmate.com/api/v5/audiobooks/yWv285RP"],
    ["http://en.bookmate.com/comicbooks/U78uzcs7?from=library", "https://api.bookmate.com/api/v5/comicbooks/U78uzcs7"],
  ];
  for (const [url, apiUrl] of valid) {
    assert.equal(isBookmateUrl(url), true, url);
    assert.equal(bookmateApiUrl(url), apiUrl, url);
  }

  const invalid = [
    "https://bookmate.com.evil.example/books/hPi0Nn9f",
    "https://notbookmate.com/books/hPi0Nn9f",
    "https://rus.bookmate.com/authors/hPi0Nn9f",
    "https://rus.bookmate.com/books/",
    "ftp://rus.bookmate.com/books/hPi0Nn9f",
    "not a url",
  ];
  for (const url of invalid) {
    assert.equal(isBookmateUrl(url), false, url);
    assert.equal(bookmateApiUrl(url), "", url);
  }
});

test("maps Bookmate API metadata to a direct cover preview", () => {
  assert.deepEqual(
    parseBookmateMetadata(
      {
        book: {
          title: "Обмен разумов &amp; другие истории",
          annotation: "Фантастический <b>роман</b> Роберта Шекли",
          authors: "Роберт Шекли",
          cover: {
            large: "https://assets1.bmstatic.com/assets/books-covers/ee/18/uJlKhVV5-ipad.jpeg?image_hash=abc",
            small: "https://assets1.bmstatic.com/assets/books-covers/ee/18/uJlKhVV5-thumb.jpeg?image_hash=def",
          },
        },
      },
      "https://api.bookmate.com/api/v5/books/hPi0Nn9f",
    ),
    {
      title: "Обмен разумов & другие истории",
      description: "Фантастический роман Роберта Шекли",
      imageUrl: "https://assets1.bmstatic.com/assets/books-covers/ee/18/uJlKhVV5-ipad.jpeg?image_hash=abc",
      price: null,
      currency: "",
      kind: "media",
    },
  );
});

test("supports Bookmate audiobook and comic-book response shapes", () => {
  const audiobook = parseBookmateMetadata({
    audiobook: {
      title: "Грозовой перевал",
      authors: [{ name: "Эмили Бронте" }],
      cover: { small: "/assets/audiobooks-covers/cover.jpeg" },
    },
  }, "https://api.bookmate.com/api/v5/audiobooks/yWv285RP");
  assert.equal(audiobook.description, "Эмили Бронте");
  assert.equal(audiobook.imageUrl, "https://api.bookmate.com/assets/audiobooks-covers/cover.jpeg");

  const comicbook = parseBookmateMetadata({
    comicbook: {
      title: "Комикс",
      annotation: "Описание",
      cover: { large: "data:image/png;base64,AAAA" },
    },
  }, "https://api.bookmate.com/api/v5/comicbooks/U78uzcs7");
  assert.equal(comicbook.imageUrl, "");
});

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

test("keeps an Alpina cover with spaces in its Open Graph URL", () => {
  const html = `
    <meta property="og:title" content="Немного нежности к себе">
    <meta property="og:image" content="https://alpinabook.ru/upload/iblock/c88/book cover 04 2026.jpg">
  `;

  const result = parseProductMetadata(html, "https://alpinabook.ru/catalog/book-nemnogo-nezhnosti-k-sebe/");
  assert.equal(result.imageUrl, "https://alpinabook.ru/upload/iblock/c88/book%20cover%2004%202026.jpg");
});

test("prefers the full JSON-LD offer cover on MIF product pages", () => {
  const html = `
    <meta property="og:title" content="Неизбежно">
    <meta property="og:image" content="assets/images/books-new/neizbezhno/neizbezhno-s.png">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Неизбежно",
        "image": "/assets/images/covers/53/17953/0.50x-thumb.png",
        "offers": {
          "@type": "Offer",
          "image": "/assets/images/covers/53/17953/1.00x-thumb.png",
          "price": 897,
          "priceCurrency": "RUB"
        }
      }
    </script>
  `;

  const result = parseProductMetadata(
    html,
    "https://www.mann-ivanov-ferber.ru/catalog/product/neizbezhno/",
  );
  assert.equal(result.imageUrl, "https://www.mann-ivanov-ferber.ru/assets/images/covers/53/17953/1.00x-thumb.png");
});

test("resolves a MIF asset from the origin when structured data has no image", () => {
  const html = `<meta property="og:image" content="assets/media/book-cover.png">`;
  const result = parseProductMetadata(
    html,
    "https://www.mann-ivanov-ferber.ru/catalog/product/example/",
  );
  assert.equal(result.imageUrl, "https://www.mann-ivanov-ferber.ru/assets/media/book-cover.png");
});

test("does not apply MIF image rules to lookalike hosts", () => {
  const html = `
    <meta property="og:image" content="assets/social-card.png">
    <script type="application/ld+json">
      {"@type":"Product","name":"Book","image":"/assets/cover.png"}
    </script>
  `;
  const result = parseProductMetadata(
    html,
    "https://mann-ivanov-ferber.ru.evil.example/catalog/product/example/",
  );
  assert.equal(
    result.imageUrl,
    "https://mann-ivanov-ferber.ru.evil.example/catalog/product/example/assets/social-card.png",
  );
});

test("keeps an offer image as a fallback for non-MIF product pages", () => {
  const html = `
    <script type="application/ld+json">
      [
        {
          "@type": "Product",
          "name": "Первый товар",
          "offers": { "@type": "Offer", "image": "/assets/offer-cover.jpg" }
        },
        {
          "@type": "Product",
          "name": "Второй товар",
          "image": "/assets/product-cover.jpg"
        }
      ]
    </script>
  `;
  const result = parseProductMetadata(html, "https://example.com/catalog/book/");
  assert.equal(result.imageUrl, "https://example.com/assets/offer-cover.jpg");
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

test("returns only structured Product data and appends a separate weight", () => {
  const html = `
    <meta property="og:title" content="Generic grocery shell">
    <meta property="og:image" content="https://cdn.example/logo.png">
    <script type="application/ld+json">
      {
        "@type": "Product",
        "name": "Петрушка",
        "weight": { "@type": "QuantitativeValue", "value": "50 г" },
        "image": "https://cdn.example/parsley.jpg",
        "offers": { "@type": "Offer", "price": 62, "priceCurrency": "RUB" }
      }
    </script>`;

  assert.deepEqual(parseStructuredProductMetadata(html, "https://shop.example/product/parsley"), {
    productFound: true,
    title: "Петрушка, 50 г",
    description: "",
    imageUrl: "https://cdn.example/parsley.jpg",
    productUrl: "",
    price: 62,
    currency: "RUB",
  });
  assert.equal(
    parseStructuredProductMetadata('<meta property="og:image" content="https://cdn.example/logo.png">', "https://shop.example").productFound,
    false,
  );
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

test("prefers a structured place address over generic map copy", () => {
  const html = `
    <meta property="og:title" content="Яндекс Карты">
    <meta property="og:description" content="Карты помогут найти нужное место и построить маршрут">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "CafeOrCoffeeShop",
        "name": "Кофейня Зерно",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "улица Примерная, 10",
          "addressLocality": "Москва",
          "addressCountry": "Россия"
        }
      }
    </script>`;

  const result = parseYandexMapsMetadata(html, "https://yandex.ru/maps/org/zerno/123/");
  assert.equal(result.description, "улица Примерная, 10, Москва, Россия");
});

test("combines place address metadata with its locality", () => {
  const html = `
    <meta property="og:title" content="Coffee Spot — Яндекс Карты">
    <meta property="business:contact_data:street_address" content="Невский проспект, 28">
    <meta property="business:contact_data:locality" content="Санкт-Петербург">`;

  const result = parseYandexMapsMetadata(html, "https://yandex.ru/maps/org/coffee_spot/456/");
  assert.equal(result.description, "Санкт-Петербург, Невский проспект, 28");
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

test("maps a VK Video oEmbed response to video metadata", () => {
  assert.deepEqual(
    parseVkVideoMetadata(
      {
        response: {
          title: "Сказка &amp; реальность",
          author_name: "Правила жизни",
          thumbnail_url: "https://iv.okcdn.ru/getVideoPreview?id=7578107644437",
        },
      },
      "https://vk.com/video-4829_456240230",
    ),
    {
      title: "Сказка & реальность",
      description: "Правила жизни",
      imageUrl: "https://iv.okcdn.ru/getVideoPreview?id=7578107644437",
      price: null,
      currency: "",
      kind: "video",
    },
  );
});

test("extracts the signed VK player URL from an oEmbed response", () => {
  assert.equal(
    parseVkVideoEmbedUrl({
      response: {
        html: '<iframe src="https://vk.com/video_ext.php?oid=-4829&amp;id=456240230&amp;hash=secret"></iframe>',
      },
    }),
    "https://vk.com/video_ext.php?oid=-4829&id=456240230&hash=secret",
  );
  assert.equal(
    parseVkVideoEmbedUrl({ html: '<iframe src="https://vk.com.evil.example/video_ext.php?oid=-4829&amp;id=456240230"></iframe>' }),
    "",
  );
});

test("selects the largest available VK Video thumbnail from player HTML", () => {
  const base = "https:\\/\\/iv.okcdn.ru\\/getVideoPreview?id=7578107644437";
  const html = `window.player={"small":"${base}\\u0026fn=vid_s","large":"${base}\\u0026fn=vid_w","medium":"${base}\\u0026fn=vid_x"}`;
  assert.equal(
    parseVkVideoEmbedThumbnail(html),
    "https://iv.okcdn.ru/getVideoPreview?id=7578107644437&fn=vid_w",
  );
  assert.equal(
    parseVkVideoEmbedThumbnail('https://iv.okcdn.ru.evil.example/getVideoPreview?id=1&fn=vid_w'),
    "",
  );
});
