import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Blockchain } from "@ton/sandbox";
import { beginCell, contractAddress, toNano, SendMode } from "@ton/core";
import { runTolkCompiler } from "@ton/tolk-js";
import { registryCode, registryInit, registryActionBody, registryCardId, REGISTRY_CODE_HASH, prepareRegistryDeployment, createRegistryReader } from "./contact-card-registry.js";
import { verifySignedContactCard } from "./ton-contact-signatures.js";
import { signedCardFixture } from "../scripts/fixtures/signed-contact-card.js";
const snapshot = (state) => ({ ...state, owner: state.owner.toRawString(), recovery: state.recovery.toRawString() });
const id = '12'.repeat(32), hash = '34'.repeat(32);
class Registry {
  constructor(config) { this.init=registryInit(config);this.address=contractAddress(0,this.init); }
  async send(provider,via,body=beginCell().endCell()) { await provider.internal(via,{value:toNano('0.05'),sendMode:SendMode.PAY_GAS_SEPARATELY,body}); }
  async getState(provider) { const {stack}=await provider.get('get_card_state',[]);return {cardId:stack.readBigNumber(),revision:stack.readNumber(),hash:stack.readBigNumber(),owner:stack.readAddress(),recovery:stack.readAddress(),recoveryAt:stack.readNumber()}; }
  async getPending(provider) { const {stack}=await provider.get('get_pending_recovery',[]);return {owner:stack.readAddressOpt(),at:stack.readNumber()}; }
}
function exit(result,address) { return result.transactions.find(tx=>tx.inMessage?.info.type==='internal'&&tx.inMessage.info.dest.equals(address))?.description.computePhase.exitCode; }
async function fixture() {
 const chain=await Blockchain.create();chain.now=1800000000;
 const owner=await chain.treasury('owner'), recovery=await chain.treasury('recovery'), next=await chain.treasury('next'), stranger=await chain.treasury('stranger');
 const registry=chain.openContract(new Registry({cardId:id,revision:1,hash,owner:owner.address.toRawString(),recovery:recovery.address.toRawString()}));
 await registry.send(owner.getSender());
 return {chain,owner,recovery,next,stranger,registry};
}
test('checked-in contract artifact matches the compiler and reviewed Tolk source',async()=>{
 const result=await runTolkCompiler({entrypointFileName:'main.tolk',fsReadCallback:()=>readFileSync(new URL('../contracts/contact-card-registry.tolk',import.meta.url),'utf8')});
 assert.equal(result.status,'ok');assert.equal(result.codeHashHex.toLowerCase(),REGISTRY_CODE_HASH);assert.equal(registryCode.hash().toString('hex'),REGISTRY_CODE_HASH);
});
test('registry accepts only owner updates, exact consecutive versions, nonzero hashes and exact bodies',async()=>{
 const {owner,stranger,registry}=await fixture();
 const update=registryActionBody('update',{revision:2,hash:'56'.repeat(32)});
 assert.equal(exit(await registry.send(stranger.getSender(),update),registry.address),401);
 assert.equal((await registry.getState()).revision,1);
 assert.equal(exit(await registry.send(owner.getSender(),update),registry.address),0);
 assert.equal((await registry.getState()).revision,2);
 assert.equal(exit(await registry.send(owner.getSender(),update),registry.address),409);
 const before=await registry.getState();
 const trailing=beginCell().storeSlice(registryActionBody('update',{revision:3,hash:'78'.repeat(32)}).beginParse()).storeBit(1).endCell();
 assert.notEqual(exit(await registry.send(owner.getSender(),trailing),registry.address),0);
 assert.deepEqual(snapshot(await registry.getState()),snapshot(before));
});
test('owner rotation preserves document hash, revokes old owner and clears pending recovery',async()=>{
 const {owner,recovery,next,registry}=await fixture();
 await registry.send(recovery.getSender(),registryActionBody('recover',{owner:next.address.toRawString()}));
 await registry.send(owner.getSender(),registryActionBody('rotate',{owner:next.address.toRawString(),recovery:recovery.address.toRawString()}));
 const state=await registry.getState();assert(state.owner.equals(next.address));assert.equal(state.hash,BigInt('0x'+hash));assert.equal(state.recoveryAt,0);
 const update=registryActionBody('update',{revision:2,hash:'56'.repeat(32)});
 assert.equal(exit(await registry.send(owner.getSender(),update),registry.address),401);
 assert.equal(exit(await registry.send(next.getSender(),update),registry.address),0);
});
test('recovery is a delayed two-step operation with owner veto and sender/capture guards',async()=>{
 const {chain,owner,recovery,next,stranger,registry}=await fixture();
 const propose=registryActionBody('recover',{owner:next.address.toRawString()});
 assert.equal(exit(await registry.send(stranger.getSender(),propose),registry.address),401);
 await registry.send(recovery.getSender(),propose);
 const pending=await registry.getPending();assert(pending.owner.equals(next.address));assert.equal(pending.at,chain.now+604800);
 assert.equal(exit(await registry.send(recovery.getSender(),registryActionBody('executeRecovery')),registry.address),425);
 assert.equal(exit(await registry.send(stranger.getSender(),registryActionBody('cancelRecovery')),registry.address),401);
 await registry.send(owner.getSender(),registryActionBody('cancelRecovery'));assert.equal((await registry.getPending()).owner,null);
 assert.equal(exit(await registry.send(recovery.getSender(),registryActionBody('executeRecovery')),registry.address),409);
 await registry.send(recovery.getSender(),propose);chain.now+=604800;
 assert.equal(exit(await registry.send(stranger.getSender(),registryActionBody('executeRecovery')),registry.address),401);
 await registry.send(recovery.getSender(),registryActionBody('executeRecovery'));assert((await registry.getState()).owner.equals(next.address));
 assert.equal((await registry.getState()).revision,1);
});
test('bounced messages cannot update or rotate authority',async()=>{
 const {chain,owner,next,recovery,registry}=await fixture();
 const before=await registry.getState();
 await chain.sendMessage({info:{type:'internal',ihrDisabled:true,bounce:false,bounced:true,src:owner.address,dest:registry.address,value:{coins:toNano('0.05')},ihrFee:0n,forwardFee:0n,createdLt:0n,createdAt:chain.now},init:null,body:registryActionBody('rotate',{owner:next.address.toRawString(),recovery:recovery.address.toRawString()})});
 assert.deepEqual(snapshot(await registry.getState()),snapshot(before));
});
test('deployment is pinned to Testnet, verified signer, fixed bytecode, explicit funding and a separate recovery address',()=>{
 const bundle=signedCardFixture();
 const prepared=prepareRegistryDeployment(bundle,'0:'+'11'.repeat(32),{now:1800000000});
 assert.equal(prepared.transaction.network,'-3');assert.equal(prepared.transaction.from,bundle.wallet.address);
 assert.equal(prepared.transaction.messages[0].amount,'50000000');assert.equal(prepared.codeHash,REGISTRY_CODE_HASH);
 assert.equal(prepared.recoveryDelaySeconds,604800);assert(prepared.transaction.messages[0].stateInit);
 assert.throws(()=>prepareRegistryDeployment(bundle,bundle.wallet.address,{now:1800000000}));
 assert.throws(()=>prepareRegistryDeployment(bundle,'0:'+'11'.repeat(32),{now:1800001000}));
});
test('unavailable, inactive or foreign-code RPC never becomes a confirmed registration',async()=>{
 const bundle=signedCardFixture({now:Math.floor(Date.now()/1000)});let calls=0;
 const inactive=createRegistryReader({fetchImpl:async(url)=>{calls++;assert(url.includes('testnet.toncenter.com'));return {ok:true,json:async()=>({ok:true,result:{state:'uninitialized'}})};}});
 assert.equal((await inactive('0:'+'11'.repeat(32),bundle)).matches,false);assert.equal(calls,1);
 const unavailable=createRegistryReader({fetchImpl:async()=>{throw Error('offline');}});await assert.rejects(()=>unavailable('0:'+'11'.repeat(32),bundle),/не подтверждена/);
 const foreign=createRegistryReader({fetchImpl:async()=>({ok:true,json:async()=>({ok:true,result:{state:'active',code:beginCell().endCell().toBoc().toString('base64')}})})});
 await assert.rejects(()=>foreign('0:'+'11'.repeat(32),bundle),/другой контракт/);
});

test('RPC confirmation requires actual matching bytecode, card id, owner, hash and version',async()=>{
 const bundle=signedCardFixture({now:Math.floor(Date.now()/1000)}),verified=verifySignedContactCard(bundle);
 const number=value=>['num','0x'+BigInt(value).toString(16)];
 const account=value=>['slice',{bytes:beginCell().storeAddress(value).endCell().toBoc().toString('base64')}];
 const { Address }=await import('@ton/core');
 const stack=[number('0x'+registryCardId(bundle.claim)),number(1),number('0x'+verified.hash),account(Address.parse(verified.address)),account(Address.parse('0:'+'11'.repeat(32))),number(0)];
 const reader=createRegistryReader({fetchImpl:async(_url,options)=>({ok:true,json:async()=>({ok:true,result:JSON.parse(options.body).method==='getAddressInformation'?{state:'active',code:registryCode.toBoc().toString('base64')}:{exit_code:0,stack}})})});
 assert.equal((await reader('0:'+'22'.repeat(32),bundle)).matches,true);
 for(const [index,value] of [[0,number(1)],[1,number(2)],[2,number(1)],[3,account(Address.parse('0:'+'33'.repeat(32)))]] ){
  const previous=stack[index];stack[index]=value;assert.equal((await reader('0:'+'22'.repeat(32),bundle)).matches,false);stack[index]=previous;
 }
});
