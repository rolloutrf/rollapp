import assert from "node:assert/strict";
import test from "node:test";
import {
  isKinopoiskHost,
  isKinopoiskUrl,
  KINOPOISK_CONTENT_URL_REQUIRED_MESSAGE,
  kinopoiskContentUrlError,
  kinopoiskContentId,
  kinopoiskPosterUrl,
  wishPreviewImageUrl,
} from "./kinopoisk.js";

test("extracts Kinopoisk ids from film and series links", () => {
  const valid = [
    ["https://www.kinopoisk.ru/film/435/", "435"],
    ["https://kinopoisk.ru/film/435?utm_source=share", "435"],
    ["https://m.kinopoisk.ru/series/77044/", "77044"],
    ["http://www.kinopoisk.ru/film/123456/reviews/", "123456"],
    ["https://www.kinopoisk.ru/film/zelenaya-milya-435/", "435"],
    ["https://www.kinopoisk.ru/level/1/film/435/", "435"],
  ];

  for (const [url, id] of valid) {
    assert.equal(kinopoiskContentId(url), id, url);
    assert.equal(isKinopoiskUrl(url), true, url);
  }
});

test("rejects lookalike hosts and non-content Kinopoisk links", () => {
  const invalid = [
    "https://kinopoisk.ru.evil.example/film/435/",
    "https://notkinopoisk.ru/film/435/",
    "https://www.kinopoisk.ru/name/435/",
    "https://www.kinopoisk.ru/film/not-a-number/",
    "ftp://www.kinopoisk.ru/film/435/",
    "not a url",
    "",
  ];

  for (const url of invalid) {
    assert.equal(kinopoiskContentId(url), "", url);
    assert.equal(isKinopoiskUrl(url), false, url);
    assert.equal(kinopoiskPosterUrl(url), "", url);
  }
});

test("distinguishes a Kinopoisk search page from a film or series card", () => {
  const searchUrl = "https://www.kinopoisk.ru/new-search/?text=Power";

  assert.equal(isKinopoiskHost(searchUrl), true);
  assert.equal(isKinopoiskUrl(searchUrl), false);
  assert.equal(kinopoiskContentId(searchUrl), "");
  assert.equal(kinopoiskPosterUrl(searchUrl), "");
  assert.equal(kinopoiskContentUrlError(searchUrl), KINOPOISK_CONTENT_URL_REQUIRED_MESSAGE);
  assert.equal(kinopoiskContentUrlError("https://www.kinopoisk.ru/film/435/"), "");
  assert.equal(kinopoiskContentUrlError("https://kinopoisk.ru.evil.example/film/435/"), "");
});

test("builds the deterministic Kinopoisk poster URL", () => {
  assert.equal(
    kinopoiskPosterUrl("https://www.kinopoisk.ru/film/435/"),
    "https://st.kp.yandex.net/images/film_iphone/iphone360_435.jpg",
  );
});

test("uses a Kinopoisk poster only when a wish has no image of its own", () => {
  const url = "https://www.kinopoisk.ru/film/435/";
  assert.equal(
    wishPreviewImageUrl({ imageUrl: "https://cdn.example/custom.jpg", url }),
    "https://cdn.example/custom.jpg",
  );
  assert.equal(
    wishPreviewImageUrl({ imageUrl: "", url }),
    "https://st.kp.yandex.net/images/film_iphone/iphone360_435.jpg",
  );
  assert.equal(wishPreviewImageUrl({ imageUrl: "", url: "https://example.com/item" }), "");
});

test("uses retailer link previews after explicit images and Kinopoisk posters", () => {
  const url = "https://lavka.yandex.ru/good/petrushka-50-gram";
  assert.equal(
    wishPreviewImageUrl({ imageUrl: "https://cdn.example/custom.jpg", url }),
    "https://cdn.example/custom.jpg",
  );
  assert.equal(
    wishPreviewImageUrl({ imageUrl: "", url }),
    "/retailer-previews/lavka.svg",
  );
});
