import test from "node:test";
import assert from "node:assert/strict";
import { publicContactCard, contactCardVcard, contactCardDownload } from "./contact-card.js";

test("card exports only the explicit public identity, even from a full session", () => {
  const card = publicContactCard({ name: "Тестовый", username: "synthetic-user", email: "private@example.org", notes: "private", birthday: "2000-01-01", id: "private-id", favorite: true, bio: "private" }, "https://example.org/app?owner=other");
  assert.deepEqual(card, { format: "rollapp-contact-card", version: 1, name: "Тестовый", username: "synthetic-user", url: "https://example.org/synthetic-user" });
  const json = contactCardDownload(card, "json");
  assert.deepEqual(JSON.parse(json.content), card);
  assert.equal(json.filename, "synthetic-user.json");
  assert.doesNotMatch(json.content, /private|favorite|birthday|email|notes|bio/);
});

test("vCard escapes text and folds UTF-8 without splitting code points or injecting fields", () => {
  const name = "Имя, с; разделителями \\ и\r\nEMAIL:forged@example.org " + "Я😀".repeat(50);
  const card = publicContactCard({ name, username: "test" }, "https://example.org");
  const vcard = contactCardVcard(card);
  const physical = vcard.split("\r\n");
  for (const line of physical) assert(Buffer.byteLength(line, "utf8") <= 75);
  const unfolded = vcard.replace(/\r\n /g, "");
  assert(unfolded.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:"));
  assert(unfolded.includes("Имя\\, с\\; разделителями \\\\ и\\nEMAIL:"));
  assert(unfolded.includes("Я😀".repeat(50)));
  assert(!unfolded.includes("\r\nEMAIL:"));
  assert(unfolded.endsWith("URL:https://example.org/test\r\nEND:VCARD\r\n"));
  const file = contactCardDownload(card, "vcard");
  assert.equal(file.filename, "test.vcf");
  assert.equal(file.type, "text/vcard;charset=utf-8");
  assert.equal(file.content, vcard);
});

test("profile URL stays on the supplied HTTP origin and filenames cannot traverse paths", () => {
  const card = publicContactCard({ username: "../Иван?#\r\nX:" }, "https://user:password@example.org/private");
  assert.equal(new URL(card.url).origin, "https://example.org");
  assert(!card.url.includes("password"));
  assert(!/[\r\n]/.test(card.url));
  assert.match(contactCardDownload(card, "vcard").filename, /^[\w-]+\.vcf$/);
  assert.throws(() => publicContactCard({ username: "test" }, "javascript:alert(1)"));
  assert.throws(() => publicContactCard({}, "https://example.org"));
  assert.throws(() => contactCardDownload(card, "unknown"));
});
