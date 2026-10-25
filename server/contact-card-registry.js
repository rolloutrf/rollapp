import { readFileSync } from "node:fs";
import { Address, Cell, beginCell, contractAddress, storeStateInit } from "@ton/core";
import { CardSignatureError, sha256, verifySignedContactCard } from "./ton-contact-signatures.js";
import { CONTACT_CARD_NETWORK } from "../shared/ton-contact-card.js";
import { tonFetch } from "./ton-network.js";

const artifact = JSON.parse(readFileSync(new URL("../contracts/contact-card-registry.compiled.json", import.meta.url), "utf8"));
export const registryCode = Cell.fromBase64(artifact.codeBoc64);
export const REGISTRY_CODE_HASH = registryCode.hash().toString("hex");
if (REGISTRY_CODE_HASH !== artifact.codeHash.toLowerCase() || artifact.sourceHash !== sha256(readFileSync(new URL("../contracts/contact-card-registry.tolk", import.meta.url))).toString("hex")) throw Error("Contact card registry artifact is stale; rebuild it before starting");
export const REGISTRY_OPS = { update: 0x43415201, rotate: 0x43415202, recover: 0x43415203, cancelRecovery: 0x43415204, executeRecovery: 0x43415205 };
export const REGISTRY_FUNDING = "50000000";
export function registryCardId(claim) { return sha256(claim.cardId).toString("hex"); }
export function registryInit({ cardId, revision, hash, owner, recovery }) {
  const ownerAddress = Address.parse(owner), recoveryAddress = Address.parse(recovery);
  if (ownerAddress.equals(recoveryAddress)) throw new CardSignatureError("Для восстановления нужен отдельный кошелёк");
  if (!/^[a-f0-9]{64}$/.test(cardId) || !/^[a-f0-9]{64}$/.test(hash) || /^0+$/.test(hash) || !Number.isInteger(revision) || revision < 1 || revision > 0xffffffff) throw new CardSignatureError("Неверные данные реестра");
  const authority = beginCell().storeAddress(ownerAddress).storeAddress(recoveryAddress).storeMaybeRef(null).endCell();
  const data = beginCell().storeBuffer(Buffer.from(cardId, "hex")).storeUint(revision, 32).storeBuffer(Buffer.from(hash, "hex")).storeRef(authority).endCell();
  return { code: registryCode, data };
}
export function registryActionBody(operation, values = {}) {
  if (!Object.hasOwn(REGISTRY_OPS, operation)) throw new CardSignatureError("Неизвестное действие реестра");
  const body = beginCell().storeUint(REGISTRY_OPS[operation], 32);
  if (operation === "update") {
    if (!/^[a-f0-9]{64}$/.test(values.hash) || /^0+$/.test(values.hash) || !Number.isInteger(values.revision) || values.revision < 2 || values.revision > 0xffffffff) throw new CardSignatureError("Неверная версия или хэш");
    body.storeUint(values.revision, 32).storeBuffer(Buffer.from(values.hash, "hex"));
  }
  if (["rotate", "recover"].includes(operation)) body.storeAddress(Address.parse(values.owner));
  if (operation === "rotate") body.storeAddress(Address.parse(values.recovery));
  return body.endCell();
}
export function prepareRegistryDeployment(bundle, recovery, { now = Math.floor(Date.now() / 1000) } = {}) {
  const verified = verifySignedContactCard(bundle, { now, maxAge: 900 });
  const recoveryAddress = Address.parse(recovery);
  if (![0, -1].includes(recoveryAddress.workChain)) throw new CardSignatureError("Неподдерживаемая сеть адреса восстановления");
  if (!/^(?:0|-1):/.test(recovery) && !Address.parseFriendly(recovery).isTestOnly) throw new CardSignatureError("Укажите адрес Testnet или полный raw-адрес кошелька восстановления");
  const init = registryInit({ cardId: registryCardId(bundle.claim), revision: verified.revision, hash: verified.hash, owner: verified.address, recovery: recoveryAddress.toRawString() });
  const address = contractAddress(0, init);
  return { address: address.toString({ testOnly: true, bounceable: true }), rawAddress: address.toRawString(), codeHash: REGISTRY_CODE_HASH,
    owner: verified.address, recovery: recoveryAddress.toRawString(), hash: verified.hash, revision: verified.revision, recoveryDelaySeconds: 604800,
    transaction: { network: CONTACT_CARD_NETWORK, from: verified.address, validUntil: now + 300,
      messages: [{ address: address.toString({ testOnly: true, bounceable: true }), amount: REGISTRY_FUNDING,
        stateInit: beginCell().store(storeStateInit(init)).endCell().toBoc().toString("base64"), payload: beginCell().endCell().toBoc().toString("base64") }] } };
}

export function createRegistryReader({ env = process.env, fetchImpl = tonFetch } = {}) {
  const endpoint = "https://testnet.toncenter.com/api/v2/jsonRPC";
  async function rpc(method, params) {
    const response = await fetchImpl(endpoint, { method: "POST", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", ...(env.TONCENTER_TESTNET_API_KEY ? { "X-API-Key": env.TONCENTER_TESTNET_API_KEY } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: "contact-card", method, params }) });
    if (!response.ok) throw Error("TON RPC unavailable");
    const body = await response.json();
    if (!body.ok || !body.result) throw Error("TON RPC rejected request");
    return body.result;
  }
  return async (registryAddress, bundle) => {
    const verified = verifySignedContactCard(bundle);
    if (verified.bundle.registry && verified.bundle.registry.codeHash !== REGISTRY_CODE_HASH) throw new CardSignatureError("Файл ссылается на другую версию кода реестра");
    const address = Address.parse(registryAddress).toRawString();
    try {
      const state = await rpc("getAddressInformation", { address });
      if (state.state !== "active") return { active: false, matches: false, network: CONTACT_CARD_NETWORK };
      if (Cell.fromBase64(state.code).hash().toString("hex") !== REGISTRY_CODE_HASH) throw new CardSignatureError("По этому адресу находится другой контракт");
      const getter = await rpc("runGetMethod", { address, method: "get_card_state", stack: [] });
      if (![0, 1].includes(getter.exit_code) || !Array.isArray(getter.stack) || getter.stack.length !== 6) throw Error("Invalid registry response");
      const number = (i) => { if (getter.stack[i][0] !== "num" || !/^0x[0-9a-f]+$/i.test(getter.stack[i][1])) throw Error("Invalid integer"); return BigInt(getter.stack[i][1]); };
      const account = (i) => { if (!["slice", "cell"].includes(getter.stack[i][0])) throw Error("Invalid address"); return Cell.fromBase64(getter.stack[i][1].bytes).beginParse().loadAddress().toRawString(); };
      const cardId = number(0).toString(16).padStart(64, "0"), revision = Number(number(1)), hash = number(2).toString(16).padStart(64, "0"), owner = account(3), recovery = account(4), recoveryAt = Number(number(5));
      const matches = cardId === registryCardId(bundle.claim) && revision === verified.revision && hash === verified.hash && owner === verified.address;
      return { active: true, matches, network: CONTACT_CARD_NETWORK, address, codeHash: REGISTRY_CODE_HASH, owner, recovery, revision, hash, recoveryAt };
    } catch (error) {
      if (error instanceof CardSignatureError) throw error;
      throw new CardSignatureError("Не удалось проверить TON Testnet. Регистрация не подтверждена; попробуйте позже.", 503);
    }
  };
}
