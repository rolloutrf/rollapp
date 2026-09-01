import assert from "node:assert/strict";
import test from "node:test";
import {
  isVideoUrl,
  isVkVideoUrl,
  parseVkVideoId,
  vkVideoOembedUrl,
} from "./video-links.js";

test("recognizes VK Video links from VK, VK Video and exported players", () => {
  const expectedId = "-4829_456240230";
  const links = [
    "https://vk.com/video-4829_456240230",
    "https://m.vk.com/video-4829_456240230?list=abc",
    "https://vkvideo.ru/video-4829_456240230",
    "https://vkvideo.ru/@channel/video-4829_456240230",
    "https://vk.com/video?z=video-4829_456240230%2Fpl_cat_updates",
    "https://vk.com/video_ext.php?oid=-4829&id=456240230&hash=abc",
  ];

  for (const link of links) {
    assert.equal(parseVkVideoId(link), expectedId, link);
    assert.equal(isVkVideoUrl(link), true, link);
    assert.equal(isVideoUrl(link), true, link);
  }
});

test("rejects VK profile pages, lookalike hosts and malformed video ids", () => {
  const links = [
    "https://vkvideo.ru/@channel",
    "https://vkvideo.ru/@channel/all",
    "https://vk.com/feed",
    "https://vk.com/video",
    "https://vk.com/video-4829",
    "https://vk.com/video-4829_bad",
    "https://vk.com.evil.example/video-4829_456240230",
    "https://notvkvideo.ru/video-4829_456240230",
    "ftp://vk.com/video-4829_456240230",
    "not a url",
    "",
  ];

  for (const link of links) {
    assert.equal(parseVkVideoId(link), "", link);
    assert.equal(isVkVideoUrl(link), false, link);
  }
});

test("builds a canonical public VK oEmbed API URL", () => {
  assert.equal(
    vkVideoOembedUrl("https://vkvideo.ru/@channel/video-4829_456240230"),
    "https://api.vk.com/method/video.getOembed?url=https%3A%2F%2Fvk.com%2Fvideo-4829_456240230&v=5.199",
  );
  assert.equal(vkVideoOembedUrl("https://vkvideo.ru/@channel"), "");
});
