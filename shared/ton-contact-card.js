export const CONTACT_CARD_NETWORK = "-3";
export const CONTACT_CARD_PURPOSE = "rollapp.contact-card";

// This exact text is displayed by the wallet and signed. No locale, whitespace
// normalization, object insertion order or mutable profile fields are implicit.
export function contactCardClaimText(claim) {
  return JSON.stringify({ purpose: CONTACT_CARD_PURPOSE, version: 1, network: CONTACT_CARD_NETWORK,
    cardId: claim.cardId, revision: claim.revision, previousHash: claim.previousHash,
    issuedAt: claim.issuedAt, card: { format: claim.card.format, version: claim.card.version,
      name: claim.card.name, username: claim.card.username, url: claim.card.url } });
}

export function signedContactCardDownload(bundle) {
  const username = bundle.claim.card.username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "contact";
  return { filename: `${username}.signed.json`, type: "application/json;charset=utf-8", content: JSON.stringify(bundle, null, 2) + "\n" };
}
