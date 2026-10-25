import { readFile } from "node:fs/promises";
import { verifySignedContactCard } from "../server/ton-contact-signatures.js";

const [file, flag, domain] = process.argv.slice(2);
if (!file || (flag && (flag !== "--domain" || !domain))) {
  console.error("Usage: node scripts/verify-contact-card.mjs card.signed.json [--domain example.org]"); process.exitCode = 2;
} else {
  try {
    const bytes = await readFile(file);
    if (bytes.length > 65536) throw Error("Файл визитки слишком большой");
    const result = verifySignedContactCard(JSON.parse(bytes.toString("utf8")), { expectedDomain: domain });
    console.log(JSON.stringify({ valid: true, network: result.network, address: result.address, domain: result.domain, hash: result.hash,
      revision: result.revision, card: result.card, signedAt: result.signedAt, identityVerified: false, registryVerified: false }, null, 2));
  } catch {
    console.error("Подпись или формат визитки недействительны."); process.exitCode = 1;
  }
}
