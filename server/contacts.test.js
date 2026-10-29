import assert from "node:assert/strict";
import test from "node:test";
import { contactAvatarPath, contactFromOverride, listContacts } from "./contacts.js";

const rows = Array.from({ length: 150 }, (_, index) => ({
  contact_id: `synthetic-${index}`, name: `Контакт ${index}`, company: index % 2 ? "Компания A" : "Компания B",
  role: "Тестовая роль", category: index % 3 ? "Design" : "Product", status: "",
  links_json: "[]", notes: index === 70 ? "Уникальная тестовая заметка" : "",
}));

test("an empty owner never receives a shared contact directory", () => {
  const result = listContacts();
  assert.equal(result.total, 0);
  assert.deepEqual(result.contacts, []);
  assert.deepEqual(result.facets, { companies: [], categories: [] });
});

test("owner records paginate, search notes privately and calculate owner-only facets", () => {
  const first = listContacts({}, rows);
  assert.equal(first.total, 150);
  assert.equal(first.contacts.length, 48);
  assert(first.hasMore);
  assert(first.contacts.every(contact => !("notes" in contact)));
  assert.equal(first.facets.companies.reduce((sum, item) => sum + item.count, 0), 150);
  const found = listContacts({ search: "уникальная тестовая" }, rows);
  assert.equal(found.total, 1);
  assert.equal(found.contacts[0].id, "synthetic-70");
  assert(found.contacts[0].hasNotes);
  const filtered = listContacts({ company: "Компания A", category: "Design" }, rows);
  assert(filtered.contacts.every(contact => contact.company === "Компания A" && contact.category === "Design"));
  assert.equal(listContacts({}, [rows[0]]).total, 1);
  assert.equal(listContacts({}, [rows[1]]).contacts[0].id, rows[1].contact_id);
});

test("source pagination remains stable when favorites change", () => {
  const options = { order: "source" };
  const favorites = ["synthetic-61", "synthetic-102"];
  const before = [1, 2, 3].flatMap(page => listContacts({ ...options, page }, rows).contacts.map(contact => contact.id));
  const after = [1, 2, 3].flatMap(page => listContacts({ ...options, page }, rows, favorites).contacts.map(contact => contact.id));
  assert.deepEqual(after, before);
  assert.deepEqual(listContacts({ favoriteOnly: true, ...options }, rows, favorites).contacts.map(contact => contact.id), favorites);
  assert.equal(listContacts({}, rows, favorites).contacts[0].id, favorites[0]);
});

test("tombstones hide records and cannot be revived by favorites", () => {
  const result = listContacts({}, [{ ...rows[0], deleted_at: "2030-01-01" }, rows[1]], [rows[0].contact_id]);
  assert.equal(result.total, 1);
  assert.equal(result.favoriteTotal, 0);
  assert.equal(result.contacts[0].id, rows[1].contact_id);
  assert.equal(contactFromOverride(null), null);
  assert.equal(contactFromOverride({}), null);
});

test("avatars retain authenticated owner routes and no file fallback", () => {
  const contact = contactFromOverride({ ...rows[0], avatar_url: "/api/media/11111111-1111-4111-8111-111111111111", updated_at: "2030-01-01T12:00:00Z" });
  assert.match(contactAvatarPath(contact), /^\/api\/contacts\/synthetic-0\/avatar\?v=/);
  assert.equal(contactAvatarPath(contactFromOverride(rows[1])), "");
  assert.equal(contactAvatarPath({ id: "social", links: [{ label: "Facebook" }] }), "/api/contacts/social/avatar");
  assert.deepEqual(contactFromOverride({ ...rows[0], links_json: "broken" }).links, []);
});
