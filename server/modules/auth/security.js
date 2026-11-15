import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, expectedHex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function slugify(value) {
  const transliterated = value
    .toLowerCase()
    .replace(/[а]/g, "a").replace(/[б]/g, "b").replace(/[в]/g, "v")
    .replace(/[г]/g, "g").replace(/[д]/g, "d").replace(/[её]/g, "e")
    .replace(/[ж]/g, "zh").replace(/[з]/g, "z").replace(/[ий]/g, "i")
    .replace(/[к]/g, "k").replace(/[л]/g, "l").replace(/[м]/g, "m")
    .replace(/[н]/g, "n").replace(/[о]/g, "o").replace(/[п]/g, "p")
    .replace(/[р]/g, "r").replace(/[с]/g, "s").replace(/[т]/g, "t")
    .replace(/[у]/g, "u").replace(/[ф]/g, "f").replace(/[х]/g, "h")
    .replace(/[ц]/g, "c").replace(/[ч]/g, "ch").replace(/[шщ]/g, "sh")
    .replace(/[ъь]/g, "").replace(/[ы]/g, "y").replace(/[э]/g, "e")
    .replace(/[ю]/g, "yu").replace(/[я]/g, "ya");
  return transliterated.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "friend";
}
