// Synthetic keys only. Independent TON wire assembly for verification tests.
import { beginCell, storeStateInit } from "@ton/core";
import { WalletContractV4 } from "@ton/ton";
import { keyPairFromSeed, sign } from "@ton/crypto";
import { createHash } from "node:crypto";
import { publicContactCard } from "../../shared/contact-card.js";
import { contactCardClaimText } from "../../shared/ton-contact-card.js";
const hash = (value) => createHash('sha256').update(value).digest();
export function signedCardFixture({ now = 1800000000, claim: suppliedClaim, payload, domain = 'cards.example', seed = 1 } = {}) {
  const key = keyPairFromSeed(Buffer.alloc(32, seed));
  const contract = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  const address = contract.address.toRawString();
  const stateInit = beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
  const claim = suppliedClaim || { purpose: 'rollapp.contact-card', version: 1, network: '-3', cardId: '12345678-1234-4234-8234-123456789012', revision: 1, previousHash: null, issuedAt: now,
    card: publicContactCard({name:'Тестовый 😀',username:'synthetic-user'}, `https://${domain}`) };
  const text = contactCardClaimText(claim);
  const challenge = payload || 'ab'.repeat(16) + '.' + hash(text).toString('hex');
  const wc = Buffer.alloc(4); wc.writeInt32BE(0);
  const domainBytes = Buffer.from(domain);
  const domainLE = Buffer.alloc(4); domainLE.writeUInt32LE(domainBytes.length);
  const domainBE = Buffer.alloc(4); domainBE.writeUInt32BE(domainBytes.length);
  const tsLE = Buffer.alloc(8); tsLE.writeBigUInt64LE(BigInt(now));
  const tsBE = Buffer.alloc(8); tsBE.writeBigUInt64BE(BigInt(now));
  const content = Buffer.from(text), length = Buffer.alloc(4); length.writeUInt32BE(content.length);
  const proofHash = hash(Buffer.concat([Buffer.from('ton-proof-item-v2/'),wc,contract.address.hash,domainLE,domainBytes,tsLE,Buffer.from(challenge)]));
  const proofDigest = hash(Buffer.concat([Buffer.from('ffff','hex'),Buffer.from('ton-connect'),proofHash]));
  const signDigest = hash(Buffer.concat([Buffer.from('ffff','hex'),Buffer.from('ton-connect/sign-data/'),wc,contract.address.hash,domainBE,domainBytes,tsBE,Buffer.from('txt'),length,content]));
  return { format:'rollapp-signed-contact-card', version:1, claim,
    wallet:{address,publicKey:key.publicKey.toString('hex'),stateInit},
    proof:{timestamp:now,domain:{lengthBytes:domainBytes.length,value:domain},payload:challenge,signature:sign(proofDigest,key.secretKey).toString('base64')},
    signedData:{address,domain,timestamp:now,signature:sign(signDigest,key.secretKey).toString('base64'),payload:{type:'text',text,network:'-3',from:address}} };
}
