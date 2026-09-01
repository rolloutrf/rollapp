const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "m.youtube-nocookie.com",
  "music.youtube-nocookie.com",
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_ID_PATHS = new Set(["shorts", "embed", "live", "v"]);

const VK_VIDEO_HOSTS = new Set([
  "vk.com",
  "www.vk.com",
  "m.vk.com",
  "vkvideo.ru",
  "www.vkvideo.ru",
]);
const VK_VIDEO_ID_PATTERN = /^-?\d+_\d+$/;
const VK_VIDEO_PATH_PATTERN = /(?:^|\/)video(-?\d+_\d+)(?:\/|$)/i;

function parseHttpUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value));
    return HTTP_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function parseYouTubeVideoId(value) {
  const url = parseHttpUrl(value);
  if (!url) return "";

  const host = url.hostname.toLowerCase();
  let candidate = "";
  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    const section = (segments[0] || "").toLowerCase();
    if (section === "watch") {
      candidate = url.searchParams.get("v") || "";
    } else if (YOUTUBE_ID_PATHS.has(section)) {
      candidate = segments[1] || "";
    }
  }
  return YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
}

export function isYouTubeUrl(value) {
  return Boolean(parseYouTubeVideoId(value));
}

export function youtubeThumbnailUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function parseVkVideoId(value) {
  const url = parseHttpUrl(value);
  if (!url || !VK_VIDEO_HOSTS.has(url.hostname.toLowerCase())) return "";

  if (url.pathname.toLowerCase().endsWith("/video_ext.php")) {
    const ownerId = url.searchParams.get("oid") || "";
    const videoId = url.searchParams.get("id") || "";
    const candidate = `${ownerId}_${videoId}`;
    return VK_VIDEO_ID_PATTERN.test(candidate) ? candidate : "";
  }

  const pathCandidate = url.pathname.match(VK_VIDEO_PATH_PATTERN)?.[1] || "";
  if (VK_VIDEO_ID_PATTERN.test(pathCandidate)) return pathCandidate;

  const zCandidate = (url.searchParams.get("z") || "").match(/^video(-?\d+_\d+)(?:\/|$)/i)?.[1] || "";
  return VK_VIDEO_ID_PATTERN.test(zCandidate) ? zCandidate : "";
}

export function isVkVideoUrl(value) {
  return Boolean(parseVkVideoId(value));
}

export function isVideoUrl(value) {
  return isYouTubeUrl(value) || isVkVideoUrl(value);
}

export function vkVideoOembedUrl(value) {
  const videoId = parseVkVideoId(value);
  if (!videoId) return "";
  const canonicalUrl = `https://vk.com/video${videoId}`;
  return `https://api.vk.com/method/video.getOembed?url=${encodeURIComponent(canonicalUrl)}&v=5.199`;
}
