// Временный диагностический скрипт: что отдают сайты жилья штатному fetchPublicHtml.
import { fetchPublicHtml } from "../server/metadata-fetch.js";

const seeds = [
  "https://sutochno.ru/metro-143",
  "https://travel.yandex.ru/hotels/",
  "https://www.booking.com/hotel/ru/cosmos.ru.html",
  "https://www.airbnb.ru/rooms/20669363",
];

const og = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));
  return m ? m[1].slice(0, 160) : null;
};

for (const url of seeds) {
  console.log("\n=== " + url);
  try {
    const { html, url: finalUrl } = await fetchPublicHtml(url);
    console.log("OK bytes=" + html.length + " final=" + finalUrl.href);
    console.log("og:title:", og(html, "og:title"));
    console.log("og:image:", og(html, "og:image"));
    const ldTypes = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => { try { const d = JSON.parse(m[1]); return d["@type"] || (Array.isArray(d) ? "array" : "?"); } catch { return "unparsed"; } });
    console.log("json-ld types:", JSON.stringify(ldTypes));
    // candidate detail links
    const links = [...new Set([...html.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]))]
      .filter((h) => /occasion|\/flat|hotels\/.+\d|hotel\/ru\/|rooms\/\d/i.test(h)).slice(0, 8);
    console.log("detail links:", JSON.stringify(links, null, 0));
  } catch (error) {
    console.log("FAIL:", error.message, error.code || "");
  }
}
