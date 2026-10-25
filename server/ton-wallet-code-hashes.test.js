import assert from "node:assert/strict";
import test from "node:test";
import { beginCell, storeStateInit } from "@ton/core";
import { WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from "@ton/ton";
import { KNOWN_WALLET_CODE_HASHES } from "./ton-wallet-code-hashes.js";
import { validatedWallet } from "./ton-contact-signatures.js";

test("runtime wallet allowlist matches all official versions and extracts their actual public keys", () => {
  const constructors = [WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1];
  const publicKey = Buffer.from("21".repeat(32), "hex");
  assert.equal(KNOWN_WALLET_CODE_HASHES.length, constructors.length);
  for (const [index, constructor] of constructors.entries()) {
    const wallet = constructor.create({ workchain: 0, publicKey });
    assert.equal(KNOWN_WALLET_CODE_HASHES[index].codeHash, wallet.init.code.hash().toString("hex"));
    const stateInit = beginCell().store(storeStateInit(wallet.init)).endCell().toBoc().toString("base64");
    assert.equal(validatedWallet({ address: wallet.address.toRawString(), stateInit }).publicKey, publicKey.toString("hex"));
  }
});
