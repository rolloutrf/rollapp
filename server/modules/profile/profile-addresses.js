import { profileNameAddress } from "../../../shared/modules/profile/profile-name-address.js";
import { internalPageUrl } from "../../../shared/modules/shell/page-urls.js";
import { findProfileByUsername, preserveProfileUsername } from "./profile-aliases.js";

// Canonical addresses and redirects share the existing global alias namespace.
// The prefixed row is an internal pointer for a profile which has been saved.
export const profileAddressPrefix = "@profile:";
const profileAddressPattern = /^[а-яё0-9]+(?:-[а-яё0-9]+)*$/u;
export const isProfileAddress = address => address.length <= 80 && profileAddressPattern.test(address);
const cache = new WeakMap();

function availableAddress(base, owners, userId) {
  for (let number = 1; ; number++) {
    const address = number === 1 ? base : `${base}-${number}`;
    const owner = owners.get(address);
    if ((!owner || owner === userId) && address !== "поделиться" && internalPageUrl(`/${address}`) === `/${address}`) return address;
  }
}

async function readDirectory(query) {
  const result = await query(
    `SELECT u.id,u.username,u.name,u.account_type,a.username AS alias
     FROM users u LEFT JOIN profile_username_aliases a ON a.user_id=u.id
     ORDER BY u.created_at,u.id,a.username`,
  );
  const users = new Map();
  const owners = new Map();
  const current = new Map();
  for (const row of result.rows) {
    users.set(row.id, row);
    owners.set(row.username, row.id);
    if (row.alias?.startsWith(profileAddressPrefix)) {
      const address = row.alias.slice(profileAddressPrefix.length);
      current.set(row.id, address);
      owners.set(address, row.id);
    } else if (row.alias) owners.set(row.alias, row.id);
  }
  // Existing profiles acquire an address without a startup backfill. Earlier
  // accounts get the unsuffixed address when two converted names coincide.
  const addresses = new Map(current);
  for (const row of users.values()) {
    if (addresses.has(row.id)) continue;
    const address = availableAddress(profileNameAddress(row.name, row.account_type), owners, row.id);
    addresses.set(row.id, address);
    owners.set(address, row.id);
  }
  return { addresses, owners, current };
}

export function profileDirectory(query) {
  const cached = cache.get(query);
  if (cached && cached.until > Date.now()) return cached.value;
  const value = readDirectory(query);
  cache.set(query, { until: Date.now() + 5_000, value });
  value.catch(() => { if (cache.get(query)?.value === value) cache.delete(query); });
  return value;
}

export function invalidateProfileDirectory(query) {
  cache.delete(query);
}

export async function profileAddress(query, userId) {
  return (await profileDirectory(query)).addresses.get(userId);
}

export async function findProfileForAddress(query, address) {
  const key = String(address ?? "").normalize("NFC").toLowerCase();
  // Reserved storage pointers are never accepted as public names.
  if (!/^[a-zа-яё0-9-]{1,80}$/u.test(key)) return { rowCount: 0, rows: [] };
  const exact = await findProfileByUsername({ query }, key);
  if (exact.rowCount || !isProfileAddress(key)) return exact;
  const userId = (await profileDirectory(query)).owners.get(key);
  return userId ? query("SELECT * FROM users WHERE id=$1", [userId]) : exact;
}

// Call within the same transaction/lock as saving the account or its name.
export async function saveProfileAddress(client, { id, name, account_type: accountType }, previous) {
  const directory = await readDirectory((...args) => client.query(...args));
  const old = directory.addresses.get(id);
  const base = profileNameAddress(name, accountType);
  const unchanged = previous && profileNameAddress(previous.name, accountType) === base;
  const address = unchanged && old ? old : availableAddress(base, directory.owners, id);
  if (directory.current.get(id) === address) return address;
  if (old && old !== address) await preserveProfileUsername(client, id, old);
  await preserveProfileUsername(client, id, address);
  const previousPointer = directory.current.get(id);
  if (previousPointer) {
    await client.query("UPDATE profile_username_aliases SET username=$1 WHERE username=$2 AND user_id=$3",
      [profileAddressPrefix + address, profileAddressPrefix + previousPointer, id]);
  } else await preserveProfileUsername(client, id, profileAddressPrefix + address);
  return address;
}
