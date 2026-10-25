import { createHash } from "node:crypto";
import { Address, Cell, contractAddress, loadStateInit } from "@ton/core";
import { signVerify } from "@ton/crypto";
import { WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from "@ton/ton";
import { z } from "zod";
import { publicContactCard } from "../shared/contact-card.js";
import { CONTACT_CARD_NETWORK, CONTACT_CARD_PURPOSE, contactCardClaimText } from "../shared/ton-contact-card.js";

export const sha256 = (value) => createHash("sha256").update(value).digest();
const text = (max) => z.string().min(1).max(max);
const timestamp = z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^\d{1,15}$/)]).transform(Number).refine(Number.isSafeInteger);
const rawAddress = z.string().regex(/^(?:0|-1):[a-fA-F0-9]{64}$/);
const cardSchema = z.object({ format: z.literal("rollapp-contact-card"), version: z.literal(1), name: text(1000), username: text(100), url: text(2000) }).strict();
export const claimSchema = z.object({ purpose: z.literal(CONTACT_CARD_PURPOSE), version: z.literal(1), network: z.literal(CONTACT_CARD_NETWORK),
  cardId: z.uuid(), revision: z.number().int().min(1).max(0xffffffff), previousHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  issuedAt: timestamp, card: cardSchema }).strict();
const proofSchema = z.object({ timestamp, domain: z.object({ lengthBytes: z.number().int().min(1).max(128), value: text(128) }).strict(), payload: text(128), signature: text(100) }).strict();
const signedDataSchema = z.object({ address: rawAddress, domain: text(128), timestamp, signature: text(100),
  payload: z.object({ type: z.literal("text"), text: text(8192), network: z.literal(CONTACT_CARD_NETWORK), from: rawAddress }).strict() }).strict();
const walletSchema = z.object({ address: rawAddress, publicKey: z.string().regex(/^[a-f0-9]{64}$/i).optional(), stateInit: text(16384) }).strict();
export const signedCardSchema = z.object({ format: z.literal("rollapp-signed-contact-card"), version: z.literal(1), claim: claimSchema,
  wallet: walletSchema, proof: proofSchema, signedData: signedDataSchema,
  // Advisory locator, not signed claim data. A fresh chain read must establish
  // any registry assertion; a file alone never proves current chain state.
  registry: z.object({ address: text(100), network: z.literal(CONTACT_CARD_NETWORK), codeHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional() }).strict();

export class CardSignatureError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function ensure(value, message) { if (!value) throw new CardSignatureError(message); }
function uint(value, bytes, little = false) {
  const buffer = Buffer.alloc(bytes);
  if (bytes === 8) little ? buffer.writeBigUInt64LE(BigInt(value)) : buffer.writeBigUInt64BE(BigInt(value));
  else little ? buffer.writeUInt32LE(value) : buffer.writeUInt32BE(value);
  return buffer;
}
function addressBytes(value) {
  const address = Address.parseRaw(value), wc = Buffer.alloc(4);
  wc.writeInt32BE(address.workChain);
  return Buffer.concat([wc, address.hash]);
}
function base64(value, expectedBytes) {
  ensure(typeof value === "string" && /^[A-Za-z0-9+/_-]+={0,2}$/.test(value), "Некорректная кодировка подписи");
  const buffer = Buffer.from(value, "base64");
  ensure(buffer.toString("base64").replace(/=+$/, "") === value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "") && (!expectedBytes || buffer.length === expectedBytes), "Некорректная длина подписи");
  return buffer;
}
const knownWallets = [WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1].map((type) => ({
  code: type.create({ workchain: 0, publicKey: Buffer.alloc(32) }).init.code,
  skip: type === WalletContractV5R1 ? 65 : 64,
}));

export function validatedWallet(value) {
  const wallet = walletSchema.parse(value);
  const roots = Cell.fromBoc(base64(wallet.stateInit));
  ensure(roots.length === 1, "Ожидалось одно состояние кошелька");
  const source = roots[0].beginParse();
  const init = loadStateInit(source); source.endParse();
  const address = Address.parseRaw(wallet.address);
  ensure(init.code && init.data && !init.libraries && init.splitDepth === undefined && init.special === undefined, "Неподдерживаемое состояние кошелька");
  ensure(contractAddress(address.workChain, init).equals(address), "Адрес не соответствует состоянию кошелька");
  const known = knownWallets.find(({ code }) => code.equals(init.code));
  ensure(known, "Этот тип кошелька пока не поддерживается. Используйте стандартный v3/v4/v5 Tonkeeper или MyTonWallet.");
  const data = init.data.beginParse(); data.skip(known.skip);
  const publicKey = data.loadBuffer(32);
  ensure(!wallet.publicKey || wallet.publicKey.toLowerCase() === publicKey.toString("hex"), "Публичный ключ не принадлежит этому кошельку");
  return { ...wallet, address: address.toRawString(), publicKey: publicKey.toString("hex"), key: publicKey };
}

// TON Proof uses LE domain length/timestamp; signData uses BE. These are
// different domain-separated protocols, not signatures over a JSON object.
export function tonProofDigest(address, proof) {
  const domain = Buffer.from(proof.domain.value, "utf8");
  ensure(domain.length === proof.domain.lengthBytes, "Длина домена не совпадает");
  const inner = sha256(Buffer.concat([Buffer.from("ton-proof-item-v2/"), addressBytes(address), uint(domain.length, 4, true), domain,
    uint(proof.timestamp, 8, true), Buffer.from(proof.payload, "utf8")]));
  return sha256(Buffer.concat([Buffer.from([255, 255]), Buffer.from("ton-connect"), inner]));
}
export function tonSignDataDigest(result) {
  const domain = Buffer.from(result.domain, "utf8"), content = Buffer.from(result.payload.text, "utf8");
  return sha256(Buffer.concat([Buffer.from([255, 255]), Buffer.from("ton-connect/sign-data/"), addressBytes(result.address),
    uint(domain.length, 4), domain, uint(result.timestamp, 8), Buffer.from("txt"), uint(content.length, 4), content]));
}
export function verifyWalletProof(walletValue, proofValue, { domain, payload, now = Math.floor(Date.now() / 1000), maxAge = 600 } = {}) {
  const wallet = validatedWallet(walletValue), proof = proofSchema.parse(proofValue);
  ensure(proof.domain.value === domain && proof.payload === payload, "Подтверждение выдано для другого запроса или домена");
  ensure(proof.timestamp <= now + 60 && proof.timestamp >= now - maxAge, "Подтверждение кошелька устарело");
  ensure(signVerify(tonProofDigest(wallet.address, proof), base64(proof.signature, 64), wallet.key), "Подпись кошелька недействительна");
  return { wallet: { address: wallet.address, publicKey: wallet.publicKey, stateInit: wallet.stateInit }, proof };
}

export function verifySignedContactCard(value, { expectedDomain, now = Math.floor(Date.now() / 1000), maxAge } = {}) {
  ensure(Buffer.byteLength(JSON.stringify(value)) <= 65536, "Файл визитки слишком большой");
  const bundle = signedCardSchema.parse(value), { claim, signedData, proof } = bundle;
  const url = new URL(claim.card.url);
  ensure(url.protocol === "https:" && !url.username && !url.password, "Для подписанной визитки нужен публичный HTTPS-профиль");
  ensure(JSON.stringify(publicContactCard(claim.card, url.origin)) === JSON.stringify(claim.card), "Неканонические поля визитки");
  const domain = url.host;
  ensure(!expectedDomain || domain === expectedDomain, "Визитка подписана для другого приложения");
  ensure(signedData.domain === domain && proof.domain.value === domain, "Домены подписей не совпадают с профилем");
  const canonical = contactCardClaimText(claim), hash = sha256(canonical).toString("hex");
  ensure(signedData.payload.text === canonical, "Подписанный текст не совпадает с визиткой");
  ensure(/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(proof.payload) && proof.payload.slice(33) === hash, "Подтверждение кошелька не связано с этой визиткой");
  ensure((claim.revision === 1) === (claim.previousHash === null), "Неверная цепочка версий визитки");
  ensure(claim.issuedAt <= now + 60 && signedData.timestamp <= now + 60 && proof.timestamp <= now + 60, "Дата подписи находится в будущем");
  ensure(proof.timestamp >= claim.issuedAt - 60 && proof.timestamp <= claim.issuedAt + 600 && signedData.timestamp >= proof.timestamp - 60 && signedData.timestamp <= claim.issuedAt + 900, "Нарушен срок выдачи подписей");
  ensure(maxAge === undefined || signedData.timestamp >= now - maxAge, "Нужна свежая подпись визитки");
  const verified = verifyWalletProof(bundle.wallet, proof, { domain, payload: proof.payload, now: proof.timestamp });
  const wallet = validatedWallet(verified.wallet);
  ensure(Address.parseRaw(signedData.address).equals(Address.parseRaw(wallet.address)) && Address.parseRaw(signedData.payload.from).equals(Address.parseRaw(wallet.address)), "Подписи принадлежат разным кошелькам");
  ensure(signVerify(tonSignDataDigest(signedData), base64(signedData.signature, 64), wallet.key), "Подпись содержимого визитки недействительна");
  return { bundle: { ...bundle, wallet: verified.wallet }, hash, address: wallet.address, network: CONTACT_CARD_NETWORK, domain, card: claim.card, revision: claim.revision, cardId: claim.cardId, signedAt: signedData.timestamp };
}
