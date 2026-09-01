import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createContactAvatarLoader,
  facebookAvatarUrlFromHtml,
  facebookProfileUrl,
} from "./contact-avatars.js";

const contact = {
  id: "contact-1",
  links: [{ label: "Facebook", url: "https://www.facebook.com/example.person" }],
};

test("Facebook contact links are validated before the server requests them", () => {
  assert.equal(facebookProfileUrl(contact), "https://www.facebook.com/example.person");
  assert.equal(facebookProfileUrl({ links: [{ label: "Facebook", url: "https://example.com/person" }] }), "");
  assert.equal(facebookProfileUrl({ links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/person" }] }), "");
});

test("Facebook avatar parser accepts only encoded HTTPS fbcdn images", () => {
  assert.equal(
    facebookAvatarUrlFromHtml('<meta content="https://scontent.example.fbcdn.net/avatar.jpg?a=1&amp;b=2" property="og:image">'),
    "https://scontent.example.fbcdn.net/avatar.jpg?a=1&b=2",
  );
  assert.equal(facebookAvatarUrlFromHtml('<meta property="og:image" content="https://example.com/avatar.jpg">'), "");
});

test("contact avatar loader downloads through the safe fetchers and caches the result", async () => {
  let htmlRequests = 0;
  let imageRequests = 0;
  const imageBody = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const load = createContactAvatarLoader({
    fetchHtml: async (url) => {
      htmlRequests += 1;
      assert.equal(url, "https://www.facebook.com/example.person");
      return { html: '<meta property="og:image" content="https://scontent.example.fbcdn.net/avatar.jpg?a=1&amp;b=2">' };
    },
    fetchImage: async (url) => {
      imageRequests += 1;
      assert.equal(url, "https://scontent.example.fbcdn.net/avatar.jpg?a=1&b=2");
      return { body: imageBody, mimeType: "image/jpeg" };
    },
  });

  const first = await load(contact);
  const second = await load(contact);
  assert.equal(first.body, imageBody);
  assert.equal(first.mimeType, "image/jpeg");
  assert.match(first.etag, /^"[A-Za-z0-9_-]{32}"$/u);
  assert.equal(second, first);
  assert.equal(htmlRequests, 1);
  assert.equal(imageRequests, 1);
});
