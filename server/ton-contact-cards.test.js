import test from "node:test";
import express from "express";
import assert from "node:assert/strict";
import { beginCell, storeStateInit } from "@ton/core";
import { WalletContractV3R2, WalletContractV5R1 } from "@ton/ton";
import { signedCardFixture } from "../scripts/fixtures/signed-contact-card.js";
import { createContactCardSigning, registerTonContactCardRoutes } from "./ton-contact-cards.js";
import { validatedWallet, verifySignedContactCard, verifyWalletProof } from "./ton-contact-signatures.js";
const now = 1800000000;
const user = { id: 'owner', name: 'Тестовый 😀', username: 'synthetic-user', email: 'PRIVATE', bio: 'PRIVATE' };
const env = { PUBLIC_APP_URL: 'https://cards.example' };

test('independent wire fixture verifies both TON protocols, Unicode, and historical offline files', () => {
  const fixture = signedCardFixture();
  const verified = verifySignedContactCard(fixture, { now: now + 86400 });
  assert.equal(verified.address, fixture.wallet.address);
  assert.equal(verified.card.name, 'Тестовый 😀');
  assert.equal(verified.network, '-3');
  assert.throws(() => verifySignedContactCard(fixture, { now: now + 86400, maxAge: 300 }));
  assert.throws(() => verifySignedContactCard(fixture, { now, expectedDomain: 'wrong.example' }));
  assert.throws(() => verifySignedContactCard(fixture, { now: now - 120 }));
});
test('tampered card, wallet, domain, network, signature, stateInit and private additions fail closed', () => {
  const attacks = [
    b => { b.claim.card.name = 'Attacker'; }, b => { b.claim.network = '-239'; },
    b => { b.signedData.domain = 'evil.example'; }, b => { b.wallet.publicKey = '00'.repeat(32); },
    b => { b.wallet.address = '0:'+'00'.repeat(32); }, b => { b.signedData.payload.text += ' '; },
    b => { b.proof.domain.lengthBytes++; }, b => { b.proof.payload = 'aa'.repeat(16)+'.'+'bb'.repeat(32); },
    b => { b.signedData.signature = 'A'.repeat(86)+'=='; }, b => { b.claim.card.email = 'PRIVATE'; },
    b => { b.wallet.stateInit = beginCell().store(storeStateInit({code:beginCell().endCell(),data:beginCell().endCell()})).endCell().toBoc().toString('base64'); },
    b => { b.claim.revision = 2; }, b => { b.signedData.timestamp += 901; },
  ];
  for (const attack of attacks) { const fixture = signedCardFixture(); attack(fixture); assert.throws(() => verifySignedContactCard(fixture, {now})); }
});
test('v3 and testnet v5 wallet keys are extracted only from recognized code and derived addresses', () => {
  for (const type of [WalletContractV3R2, WalletContractV5R1]) {
    const contract = type.create({workchain:0,publicKey:Buffer.alloc(32,7),...(type === WalletContractV5R1 ? {walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}} : {})});
    const wallet = validatedWallet({address:contract.address.toRawString(),stateInit:beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64')});
    assert.equal(wallet.publicKey,'07'.repeat(32));
  }
});
test('owner-bound nonce and signing ticket are single use, expire, and never trust client profile fields', () => {
  let clock = now * 1000;
  const signing = createContactCardSigning({env,now:()=>clock});
  const issued = signing.issue(user);
  const fixture = signedCardFixture({claim:issued.claim,payload:issued.payload});
  const input = {challengeId:issued.challengeId,network:'-3',wallet:fixture.wallet,proof:fixture.proof};
  assert.throws(() => signing.prove({...user,id:'other'},input));
  assert.throws(() => signing.prove(user,{...input,network:'-239'}));
  const proven = signing.prove(user,input);
  assert.throws(() => signing.prove(user,input));
  const bundle = signing.finish(user,{ticket:proven.ticket,signedData:{...fixture.signedData,traceId:'ignored'}});
  assert.doesNotMatch(JSON.stringify(bundle), /PRIVATE|traceId/);
  assert.throws(() => signing.finish(user,{ticket:proven.ticket,signedData:fixture.signedData}));
  const expiring = signing.issue(user); clock += 601000;
  assert.throws(() => signing.prove(user,{...input,challengeId:expiring.challengeId}));
});
test('changed profile, replacement request and changed signer cancel stale authoring; updates link hashes', () => {
  const signing = createContactCardSigning({env,now:()=>now*1000});
  const first = signing.issue(user), stale = signedCardFixture({claim:first.claim,payload:first.payload});
  assert.throws(() => signing.prove({...user,name:'changed'},{challengeId:first.challengeId,network:'-3',wallet:stale.wallet,proof:stale.proof}));
  const previous = signedCardFixture();
  const update = signing.issue(user,previous);
  assert.equal(update.claim.revision,2);
  assert.equal(update.claim.previousHash,verifySignedContactCard(previous,{now}).hash);
  const wrong = signedCardFixture({claim:update.claim,payload:update.payload,seed:2});
  assert.throws(() => signing.prove(user,{challengeId:update.challengeId,network:'-3',wallet:wrong.wallet,proof:wrong.proof}));
  const replaced = signing.issue(user), old = signedCardFixture({claim:replaced.claim,payload:replaced.payload}); signing.issue(user);
  assert.throws(() => signing.prove(user,{challengeId:replaced.challengeId,network:'-3',wallet:old.wallet,proof:old.proof}));
  assert.throws(() => verifyWalletProof(previous.wallet,previous.proof,{domain:'cards.example',payload:previous.proof.payload,now:now+601}));
});

test('HTTP routes require authentication for signing, return safe errors, enforce size and expose verification without identity claims', async (t) => {
  const app = express(); app.use(express.json({limit:'256kb'}));
  registerTonContactCardRoutes(app,{env,requireAuth:(req,res,next)=>{if(req.headers['x-test-owner']!=='yes')return res.status(401).json({error:'Login required'});req.user=user;next();}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async(action,body,owner=false)=>fetch(`http://127.0.0.1:${server.address().port}/api/contact-cards/ton/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...(owner?{'X-Test-Owner':'yes'}:{})},body:JSON.stringify(body)});
  for(const action of ['challenge','proof','signature','registry/prepare'])assert.equal((await request(action,{})).status,401);
  const now=Math.floor(Date.now()/1000),bundle=signedCardFixture({now});
  const verified=await request('verify',{bundle});assert.equal(verified.status,200);assert.equal(verified.headers.get('cache-control'),'no-store');
  const result=await verified.json();assert.equal(result.valid,true);assert.equal(result.identityVerified,false);assert.equal(result.registryVerified,false);
  const issued=await (await request('challenge',{},true)).json();
  const signed=signedCardFixture({now,claim:issued.claim,payload:issued.payload});
  const proof={challengeId:issued.challengeId,network:'-3',wallet:signed.wallet,proof:signed.proof};
  const proven=await (await request('proof',proof,true)).json();assert(proven.ticket);
  assert.equal((await request('proof',proof,true)).status,409);
  assert.equal((await request('signature',{ticket:proven.ticket,signedData:signed.signedData},true)).status,200);
  assert.equal((await request('signature',{ticket:proven.ticket,signedData:signed.signedData},true)).status,409);
  assert.equal((await request('verify',{bundle:null})).status,400);
  assert.equal((await request('verify',{bundle,extra:'😀'.repeat(17000)})).status,400);
  const prepared=await request('registry/prepare',{bundle,recovery:'0:'+'11'.repeat(32)},true);assert.equal(prepared.status,200);assert.equal((await prepared.json()).transaction.network,'-3');
});
