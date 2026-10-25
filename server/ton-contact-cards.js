import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { publicContactCard } from "../shared/contact-card.js";
import { CONTACT_CARD_NETWORK, CONTACT_CARD_PURPOSE, contactCardClaimText } from "../shared/ton-contact-card.js";
import { CardSignatureError, sha256, verifySignedContactCard, verifyWalletProof } from "./ton-contact-signatures.js";
import { tonConnectConfig } from "./ton-connect.js";
import { createRegistryReader, prepareRegistryDeployment } from "./contact-card-registry.js";

export function createContactCardSigning({ env = process.env, now = Date.now, maxPending = 1000 } = {}) {
  // Short-lived replay protection, not an application database. A restart or a
  // request reaching a different worker fails closed and requires a new proof.
  const pending = new Map();
  const seconds = () => Math.floor(now() / 1000);
  function config() {
    const config = tonConnectConfig(env);
    if (!config) throw new CardSignatureError("Для подписи TON нужен настроенный публичный HTTPS-адрес приложения", 503);
    return { origin: config.manifest.url, domain: new URL(config.manifest.url).host, manifestUrl: config.manifestUrl };
  }
  function collect() { for (const [id, value] of pending) if (value.expires <= seconds()) pending.delete(id); }
  function requirePending(id, user, stage) {
    collect();
    const value = typeof id === "string" && pending.get(id);
    if (!value || value.userId !== user.id || value.stage !== stage) throw new CardSignatureError("Запрос истёк или уже использован. Подключите кошелёк заново.", 409);
    if (JSON.stringify(value.claim.card) !== JSON.stringify(publicContactCard(user, config().origin))) {
      pending.delete(id);
      throw new CardSignatureError("Профиль изменился. Создайте подпись заново.", 409);
    }
    return value;
  }
  return {
    issue(user, previous) {
      const { origin, domain, manifestUrl } = config(); collect();
      const card = publicContactCard(user, origin);
      const prior = previous ? verifySignedContactCard(previous, { expectedDomain: domain, now: seconds() }) : null;
      if (prior && prior.card.url !== card.url) throw new CardSignatureError("Предыдущая версия относится к другому профилю");
      if (prior?.revision === 0xffffffff) throw new CardSignatureError("Достигнут предел версий визитки");
      for (const [id, value] of pending) if (value.userId === user.id) pending.delete(id);
      if (pending.size >= maxPending) throw new CardSignatureError("Сервис подписи занят. Попробуйте позже.", 503);
      const id = randomBytes(16).toString("hex");
      const claim = { purpose: CONTACT_CARD_PURPOSE, version: 1, network: CONTACT_CARD_NETWORK, cardId: prior?.cardId || randomUUID(),
        revision: prior ? prior.revision + 1 : 1, previousHash: prior?.hash || null, issuedAt: seconds(), card };
      const payload = `${id}.${sha256(contactCardClaimText(claim)).toString("hex")}`;
      if (Buffer.byteLength(domain) + Buffer.byteLength(payload) > 222) throw new CardSignatureError("Домен приложения слишком длинный для TON Proof", 503);
      pending.set(id, { stage: "proof", userId: user.id, claim, payload, domain, previousAddress: prior?.address, expires: seconds() + 600 });
      return { challengeId: id, payload, claim, domain, network: CONTACT_CARD_NETWORK, manifestUrl, expiresAt: seconds() + 600 };
    },
    prove(user, { challengeId, network, wallet, proof }) {
      const pendingValue = requirePending(challengeId, user, "proof");
      if (network !== CONTACT_CARD_NETWORK) throw new CardSignatureError("Переключите кошелёк на TON Testnet и подключитесь заново");
      const verified = verifyWalletProof(wallet, proof, { domain: pendingValue.domain, payload: pendingValue.payload, now: seconds() });
      if (pendingValue.previousAddress && pendingValue.previousAddress !== verified.wallet.address) throw new CardSignatureError("Обновление должен подписать тот же кошелёк. Смена владельца выполняется отдельно в реестре.");
      // Synchronous verification + delete makes consumption atomic in this worker.
      pending.delete(challengeId);
      const ticket = randomBytes(24).toString("hex");
      pending.set(ticket, { ...pendingValue, stage: "signature", ...verified, expires: seconds() + 300 });
      return { ticket, claim: pendingValue.claim, address: verified.wallet.address,
        signPayload: { type: "text", text: contactCardClaimText(pendingValue.claim), network: CONTACT_CARD_NETWORK, from: verified.wallet.address } };
    },
    finish(user, { ticket, signedData }) {
      const value = requirePending(ticket, user, "signature");
      // SDK analytics traceId is not part of the signed response or portable file.
      const clean = signedData && { address: signedData.address, domain: signedData.domain, timestamp: signedData.timestamp,
        signature: signedData.signature, payload: signedData.payload };
      const verified = verifySignedContactCard({ format: "rollapp-signed-contact-card", version: 1, claim: value.claim,
        wallet: value.wallet, proof: value.proof, signedData: clean }, { expectedDomain: value.domain, now: seconds(), maxAge: 300 });
      pending.delete(ticket);
      return verified.bundle;
    },
  };
}

export function registerTonContactCardRoutes(app, { requireAuth, rateLimit = (_req, _res, next) => next(), env = process.env, signing = createContactCardSigning({ env }), readRegistry = createRegistryReader({ env }) }) {
  const route = (handler) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!req.body || Buffer.byteLength(JSON.stringify(req.body)) > 65536) throw new CardSignatureError("Слишком большой запрос визитки");
      res.json(await handler(req));
    } catch (error) {
      if (error instanceof CardSignatureError) return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Неверный формат подписанной визитки" });
      res.status(400).json({ error: "Не удалось проверить подпись или состояние кошелька" });
    }
  };
  app.post("/api/contact-cards/ton/challenge", requireAuth, rateLimit, route((req) => signing.issue(req.user, req.body.previous)));
  app.post("/api/contact-cards/ton/proof", requireAuth, rateLimit, route((req) => signing.prove(req.user, req.body)));
  app.post("/api/contact-cards/ton/signature", requireAuth, rateLimit, route((req) => signing.finish(req.user, req.body)));
  app.post("/api/contact-cards/ton/verify", rateLimit, route((req) => {
    const result = verifySignedContactCard(req.body.bundle);
    return { valid: true, address: result.address, network: result.network, domain: result.domain, card: result.card,
      revision: result.revision, hash: result.hash, signedAt: result.signedAt, registry: result.bundle.registry || null, identityVerified: false, registryVerified: false };
  }));
  app.post("/api/contact-cards/ton/registry/prepare", requireAuth, rateLimit, route((req) => {
    const config = tonConnectConfig(env);
    if (!config) throw new CardSignatureError("Публичный HTTPS-адрес приложения не настроен", 503);
    const verified = verifySignedContactCard(req.body.bundle, { expectedDomain: new URL(config.manifest.url).host, maxAge: 900 });
    if (JSON.stringify(verified.card) !== JSON.stringify(publicContactCard(req.user, new URL(verified.card.url).origin))) throw new CardSignatureError("Визитка относится к другому профилю", 403);
    return prepareRegistryDeployment(verified.bundle, req.body.recovery);
  }));
  app.post("/api/contact-cards/ton/registry/check", rateLimit, route((req) => readRegistry(req.body.address, req.body.bundle)));
}
