import assert from "node:assert/strict";
import { test } from "node:test";
import { contactAvatarPath, contactFromOverride, findContact, listContacts, mergeContactOverride } from "./contacts.js";

test("imported contacts expose the Obsidian directory as searchable, paged records", () => {
  const firstPage = listContacts();
  assert.equal(firstPage.total, 1659);
  assert.equal(firstPage.contacts.length, 48);
  assert.equal(firstPage.hasMore, true);
  assert.ok(firstPage.facets.companies.some(({ company, count }) => company === "СБЕР" && count === 123));
  assert.ok(firstPage.facets.categories.some(({ category, count }) => category === "Design" && count === 464));
  assert.ok(firstPage.contacts.every((contact) => !("notes" in contact)));
  assert.ok(firstPage.contacts.every((contact) => (
    !contact.links.some((link) => link.label === "Facebook")
    || contact.avatarUrl.endsWith("/avatar")
    || contact.avatarUrl.startsWith("/contact-avatars/")
  )));
});

test("confirmed contact avatars take priority over the Facebook metadata proxy", () => {
  const contact = findContact("78263f44640e0e30e5f1");
  assert.equal(contact.name, "Александр Князев");
  assert.equal(contactAvatarPath(contact), "/contact-avatars/78263f44640e0e30e5f1.png");

  const listed = listContacts({ search: "Александр Князев" });
  assert.equal(listed.total, 1);
  assert.equal(listed.contacts[0].avatarUrl, "/contact-avatars/78263f44640e0e30e5f1.png");
});

test("contact filters cover names, roles, companies, categories, and note text", () => {
  const named = listContacts({ search: "Алёна Каширкина" });
  assert.equal(named.total, 1);
  assert.equal(named.contacts[0].company, "Wildberries");
  assert.equal(named.contacts[0].category, "Design");

  const filtered = listContacts({ company: "Google", category: "Design" });
  assert.ok(filtered.total >= 1);
  assert.ok(filtered.contacts.every((contact) => contact.company === "Google" && contact.category === "Design"));

  const noteMatch = listContacts({ search: "нейронки" });
  assert.equal(noteMatch.total, 1);
  assert.equal(noteMatch.contacts[0].name, "Витя Лушин");
});

test("contact detail keeps private notes out of list results but available by id", () => {
  const result = listContacts({ search: "Витя Лушин" });
  const detail = findContact(result.contacts[0].id);
  assert.match(detail.notes, /В отпуск/u);
  assert.ok(Array.isArray(detail.links));
  assert.equal(findContact("missing"), null);
});

test("the importer repairs shifted rows and omits records that contain no person's name", () => {
  const repaired = listContacts({ search: "Николай Кучкаров" });
  assert.equal(repaired.total, 1);
  assert.equal(repaired.contacts[0].role, "Product Design Team Lead @ ВКонтакте, Юла");
  assert.equal(repaired.contacts[0].category, "Design");
  assert.equal(listContacts({ search: "Работал Product Designer в компании РБК" }).total, 0);
});

test("personal overrides update details, search results, and facets without changing imported contacts", () => {
  const source = findContact("83e0c2acf8a0e71d9526");
  const override = {
    contactId: source.id,
    name: "Аида Меирман — исправлено",
    company: "Новая компания",
    role: "Новая роль",
    category: "Strategy",
    status: "В работе",
    linksJson: JSON.stringify([{ label: "Facebook", url: "https://www.facebook.com/aida.meirman" }]),
    notes: "Обновлённая заметка",
  };
  const merged = mergeContactOverride(source, override);
  assert.equal(merged.company, "Новая компания");
  assert.equal(merged.links[0].label, "Facebook");

  const result = listContacts({ search: "обновлённая заметка" }, [override]);
  assert.equal(result.total, 1);
  assert.equal(result.contacts[0].name, "Аида Меирман — исправлено");
  assert.ok(result.facets.companies.some(({ company, count }) => company === "Новая компания" && count === 1));
  assert.equal(findContact(source.id).name, "Аида Меирман");
});

test("user-created contacts are listed before imported contacts and remain searchable", () => {
  const customOverride = {
    contactId: "64b37cb3-0ab5-44d7-af4f-09d14825da7d",
    name: "Новый контакт",
    company: "Rollapp",
    role: "Партнёр",
    category: "Founder",
    status: "Познакомились",
    linksJson: JSON.stringify([{ label: "Telegram", url: "https://t.me/new_contact" }]),
    notes: "Встретились на конференции",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
  const customContact = contactFromOverride(customOverride);
  assert.equal(customContact.id, customOverride.contactId);
  assert.equal(customContact.links[0].label, "Telegram");

  const result = listContacts({}, [customOverride]);
  assert.equal(result.allTotal, 1660);
  assert.equal(result.contacts[0].id, customOverride.contactId);
  assert.equal("notes" in result.contacts[0], false);
  assert.equal(result.contacts[0].hasNotes, true);

  const searched = listContacts({ search: "конференции" }, [customOverride]);
  assert.equal(searched.total, 1);
  assert.equal(searched.contacts[0].name, "Новый контакт");
});

test("favorite contacts are marked, shown first, and can be filtered", () => {
  const favorite = findContact("83e0c2acf8a0e71d9526");
  const result = listContacts({}, [], [favorite.id]);
  assert.equal(result.favoriteTotal, 1);
  assert.equal(result.contacts[0].id, favorite.id);
  assert.equal(result.contacts[0].favorite, true);

  const filtered = listContacts({ favoriteOnly: true }, [], [favorite.id]);
  assert.equal(filtered.total, 1);
  assert.equal(filtered.contacts[0].id, favorite.id);
  assert.equal(filtered.contacts[0].favorite, true);
});
