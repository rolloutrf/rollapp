import assert from "node:assert/strict";
import test from "node:test";
import { profileNameAddress } from "../../../shared/modules/profile/profile-name-address.js";
import { profileDirectory, saveProfileAddress } from "./profile-addresses.js";

test("profile addresses use a Cyrillic family name before the given name", () => {
  for (const [name, expected] of [
    ["Михаил Колосков", "колосков-михаил"],
    ["Mikhail Koloskov", "колосков-михаил"],
    ["Иван Иванович Иванов", "иванов-иван"],
    ["Анна-Мария Петрова", "петрова-анна-мария"],
    ["Michael Smith", "смит-майкл"],
    ["Илья Соловьёв", "соловьёв-илья"],
  ]) assert.equal(profileNameAddress(name), expected);
  assert.equal(profileNameAddress("Белый Дом", "business"), "белый-дом");
});

test("virtual addresses respect current names, reserved paths and historical aliases", async () => {
  const rows = [
    { id: "a", username: "old-a", name: "Михаил Колосков", alias: null },
    { id: "b", username: "old-b", name: "Mikhail Koloskov", alias: null },
    { id: "c", username: "old-c", name: "Вход", alias: null },
    { id: "d", username: "old-d", name: "Дарья Петрова", alias: "колосков-михаил" },
    { id: "d", username: "old-d", name: "Дарья Петрова", alias: "@profile:петрова-дарья" },
  ];
  const { addresses, owners } = await profileDirectory(async () => ({ rows }));
  assert.equal(addresses.get("a"), "колосков-михаил-2");
  assert.equal(addresses.get("b"), "колосков-михаил-3");
  assert.equal(addresses.get("c"), "вход-2");
  assert.equal(addresses.get("d"), "петрова-дарья");
  assert.equal(owners.get("колосков-михаил"), "d");
});

test("rename reserves the former virtual address and allocates around existing users", async () => {
  const a = { id: "a", username: "old-a", name: "Анна Петрова" };
  const b = { id: "b", username: "old-b", name: "Мария Сидорова" };
  const rows = [a, b];
  const aliases = new Map();
  const client = { query: async (sql, params) => {
    if (sql.includes("LEFT JOIN")) return { rows };
    if (sql.startsWith("SELECT user_id")) {
      const owner = aliases.get(params[0]);
      return { rowCount: owner ? 1 : 0, rows: owner ? [{ user_id: owner }] : [] };
    }
    if (sql.startsWith("INSERT")) aliases.set(...params);
    return { rowCount: 1 };
  } };
  assert.equal(await saveProfileAddress(client, { ...a, name: b.name }, a), "сидорова-мария-2");
  assert.equal(aliases.get("петрова-анна"), a.id);
  assert.equal(aliases.get("сидорова-мария-2"), a.id);
  assert.equal(aliases.has("сидорова-мария"), false);
});
