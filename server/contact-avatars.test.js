import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createContactAvatarLoader,
  createContactSocialAvatarResolver,
  facebookAvatarUrlFromHtml,
  facebookProfileUrl,
  loadContactAvatar,
  socialAvatarUrlFromHtml,
  socialProfileUrl,
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

test("supported social profile links and their public preview images are validated", () => {
  assert.equal(socialProfileUrl({ url: "https://www.linkedin.com/in/example" }), "https://www.linkedin.com/in/example");
  assert.equal(socialProfileUrl({ url: "https://example.com/person" }), "");
  assert.equal(
    socialAvatarUrlFromHtml('<meta property="og:image" content="/profile/photo.webp">', "https://t.me/example"),
    "https://t.me/profile/photo.webp",
  );
});

test("social avatar resolver downloads the first available profile image", async () => {
  const imageBody = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const resolve = createContactSocialAvatarResolver({
    fetchHtml: async (url) => {
      assert.equal(url, "https://t.me/example");
      return { html: '<meta property="og:image" content="https://cdn.example.com/person.webp">', url };
    },
    fetchImage: async (url) => {
      assert.equal(url, "https://cdn.example.com/person.webp");
      return { body: imageBody, mimeType: "image/webp" };
    },
  });
  const image = await resolve([{ label: "Telegram", url: "https://t.me/example" }]);
  assert.equal(image.body, imageBody);
  assert.equal(image.mimeType, "image/webp");
  assert.equal(image.source, "Telegram");
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

test("imported contact avatars are served from the private server bundle", async () => {
  const image = await loadContactAvatar({ id: "f04b05e3f75a0c5f9860", links: [] });
  assert.equal(image.mimeType, "image/webp");
  assert.deepEqual([...image.body.subarray(0, 4)], [0x52, 0x49, 0x46, 0x46]);
  assert.match(image.etag, /^"[A-Za-z0-9_-]{32}"$/u);
});
