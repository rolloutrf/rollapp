import { publicProfilePath } from "./profile-links.js";

// Deliberate allowlist: never serialize a session/profile object directly.
export function publicContactCard(profile, origin) {
  const username = String(profile?.username || "").trim();
  const name = String(profile?.name || "").trim() || username;
  if (!username || !name) throw new Error("Профиль ещё не загружен");
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("Недопустимый адрес профиля");
  return { format: "rollapp-contact-card", version: 1, name, username, url: new URL(publicProfilePath(username), base.origin).href };
}

const escapeText = (value) => String(value).replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");

// RFC 6350: CRLF and <=75 UTF-8 octets per physical line, including
// the continuation space. Iterate code points so multibyte text stays intact.
function foldLine(value) {
  const encoder = new TextEncoder();
  let line = "", bytes = 0;
  const lines = [];
  for (const point of value) {
    const size = encoder.encode(point).length;
    if (bytes + size > 75) { lines.push(line); line = " "; bytes = 1; }
    line += point;
    bytes += size;
  }
  return [...lines, line].join("\r\n");
}

export function contactCardVcard(card) {
  return ["BEGIN:VCARD", "VERSION:4.0", `FN:${escapeText(card.name)}`, `NICKNAME:${escapeText(card.username)}`, `URL:${card.url}`, "END:VCARD"]
    .map(foldLine).join("\r\n") + "\r\n";
}

export function contactCardDownload(card, format) {
  const filename = card.username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "contact";
  if (format === "vcard") return { filename: `${filename}.vcf`, type: "text/vcard;charset=utf-8", content: contactCardVcard(card) };
  if (format === "json") return { filename: `${filename}.json`, type: "application/json;charset=utf-8", content: JSON.stringify(card, null, 2) + "\n" };
  throw new Error("Неизвестный формат визитки");
}
