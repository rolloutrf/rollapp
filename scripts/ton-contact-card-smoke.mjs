import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';
import { createContactCardSigning, registerTonContactCardRoutes } from '../server/ton-contact-cards.js';
import { verifySignedContactCard } from '../server/ton-contact-signatures.js';
import { signedCardFixture } from './fixtures/signed-contact-card.js';

// An explicit, database-free test fixture. Real route and signature verification,
// synthetic wallet keys, no bridge/RPC/network transaction or application data.
const env={PUBLIC_APP_URL:'https://cards.example'}, user={id:'fixture',name:'Михаил 😀',username:'mikhail'};
const signing=createContactCardSigning({env}), issued=new Map();
const originalIssue=signing.issue; signing.issue=(...args)=>{const result=originalIssue(...args);issued.set(result.payload,result);return result;};
const app=express(); app.use(express.json({limit:'256kb'}));
app.get('/api/ton-connect/config',(_req,res)=>res.json({manifestUrl:'https://cards.example/tonconnect-manifest.json'}));
app.post('/__wallet/connect',(req,res)=>{
  const challenge=issued.get(req.body.payload), bundle=signedCardFixture({now:Math.floor(Date.now()/1000),claim:challenge.claim,payload:challenge.payload});
  res.json({account:{chain:'-3',address:bundle.wallet.address,walletStateInit:bundle.wallet.stateInit,publicKey:bundle.wallet.publicKey},connectItems:{tonProof:{proof:bundle.proof}}});
});
app.post('/__wallet/sign',(req,res)=>res.json(signedCardFixture({now:Math.floor(Date.now()/1000),claim:JSON.parse(req.body.payload.text)}).signedData));
registerTonContactCardRoutes(app,{env,signing,requireAuth:(req,_res,next)=>{req.user=user;next();},readRegistry:async()=>({active:false,matches:false,network:'-3'})});
const server=await createServer({cacheDir:'node_modules/.vite-ton-card-smoke',server:{host:'127.0.0.1',port:smokePort(process.env.TON_CARD_PORT),strictPort:true,hmr:false,watch:null},plugins:[{
  name:'ton-card-fixture',enforce:'pre',
  resolveId(id){if(id==='@tonconnect/sdk')return fileURLToPath(new URL('./fixtures/ton-card-wallet.js',import.meta.url));},
  configureServer(vite){vite.middlewares.use(app);vite.middlewares.use(async(req,res,next)=>{
    if(!req.url.startsWith('/__ton-card'))return next();res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/ton-contact-card.jsx"></script></body></html>'));
  });},
}]});
await listenSmokeServer(server);const origin=smokeOrigin(server),browser=await chromium.launch(browserLaunchOptions());
try {
 for(const [width,height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[1440,400],[390,400]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('data:'))errors.push('External request: '+request.url());});
  await page.goto(origin+'/__ton-card');await page.getByRole('button',{name:'Визитка',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Подпись TON Testnet',exact:true}).click();
  await page.evaluate(()=>{window.walletTest.mode='mainnet';});
  await dialog.getByRole('button',{name:'Test wallet',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'Переключите кошелёк'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Подписать визитку',exact:true}).count(),0);
  await dialog.getByRole('button',{name:'Выбрать другой кошелёк',exact:true}).click();
  await page.evaluate(()=>{window.walletTest.mode='success';});await dialog.getByRole('button',{name:'Test wallet',exact:true}).click();
  const sign=dialog.getByRole('button',{name:'Подписать визитку',exact:true});await sign.waitFor();
  await page.evaluate(()=>{window.walletTest.mode='reject';});await sign.click();await dialog.getByRole('alert').filter({hasText:'отменено'}).waitFor();
  await page.evaluate(()=>{window.walletTest.mode='tamper';});await sign.click();await dialog.getByRole('alert').filter({hasText:'недействительна'}).waitFor();
  await page.evaluate(()=>{window.walletTest.mode='success';});await sign.click();
  const download=dialog.getByRole('button',{name:'Скачать подпись',exact:true});await download.waitFor();
  const waiting=page.waitForEvent('download');await download.click();const file=await waiting;
  const bundle=JSON.parse(await readFile(await file.path(),'utf8'));assert.equal(verifySignedContactCard(bundle).domain,'cards.example');
  assert.equal(bundle.claim.card.username,'mikhail');assert.equal(bundle.claim.network,'-3');assert.equal(await page.evaluate(()=>window.walletTest.transactions.length),0);
  await dialog.getByRole('textbox',{name:'Адрес кошелька восстановления Testnet'}).fill('0:'+'11'.repeat(32));
  await dialog.getByRole('button',{name:'Подготовить запись',exact:true}).click();
  const send=dialog.getByRole('button',{name:'Подтвердить в кошельке',exact:true});await send.waitFor();await send.click();
  await dialog.getByText('Кошелёк отправил запрос.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.walletTest.transactions.length),1);
  assert.equal(await page.evaluate(()=>window.walletTest.transactions[0].network),'-3');
  await dialog.getByRole('button',{name:'Проверить запись в сети',exact:true}).click();await dialog.getByText('Запись этой версии пока не подтверждена',{exact:false}).waitFor();
  const registryFileWait=page.waitForEvent('download');await download.click();const registryFile=await registryFileWait;
  const registryBundle=JSON.parse(await readFile(await registryFile.path(),'utf8'));assert.equal(registryBundle.registry.network,'-3');assert.equal(verifySignedContactCard(registryBundle).hash,verifySignedContactCard(bundle).hash);
  await dialog.getByLabel('Файл подписанной визитки').setInputFiles({name:'registry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(registryBundle))});
  await dialog.getByRole('button',{name:'Проверить реестр Testnet',exact:true}).click();await dialog.getByText('Файл не подтверждён текущей записью',{exact:false}).waitFor();
  await dialog.getByLabel('Файл подписанной визитки').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await dialog.getByText('Подпись файла действительна',{exact:false}).waitFor();
  const bad=structuredClone(bundle);bad.claim.card.name='tampered';
  await dialog.getByLabel('Файл подписанной визитки').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await dialog.getByRole('alert').filter({hasText:'не совпадает'}).waitFor();assert.equal(await dialog.getByText('Подпись файла действительна',{exact:false}).count(),0);
  await page.evaluate(()=>document.fonts.ready);
  for(const button of await dialog.locator('[data-control-bar] button').all()){
    assert.equal(Math.round((await button.boundingBox()).height),48);
    assert(await button.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Clipped control label');
    assert.deepEqual(await button.evaluate(el=>{const s=getComputedStyle(el);return[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius];}),['24px','24px','24px','24px']);
  }
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'Dialog horizontal overflow');
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
  await send.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/rollapp-ton-card-${width}-${height}.png`});
  await dialog.getByLabel('Файл подписанной визитки').setInputFiles({name:'previous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await dialog.getByRole('button',{name:'Подписать обновление',exact:true}).click();await dialog.getByRole('button',{name:'Test wallet',exact:true}).click();
  await sign.click();await download.waitFor();
  const nextFileWait=page.waitForEvent('download');await download.click();const nextFile=await nextFileWait;
  const nextBundle=JSON.parse(await readFile(await nextFile.path(),'utf8'));assert.equal(nextBundle.claim.revision,2);assert.equal(nextBundle.claim.previousHash,verifySignedContactCard(bundle).hash);assert.equal(nextBundle.claim.cardId,bundle.claim.cardId);
  await dialog.getByRole('button',{name:'Выбрать другой кошелёк',exact:true}).click();await dialog.getByRole('button',{name:'Test wallet',exact:true}).click();
  await page.evaluate(()=>{window.walletTest.mode='delay';});await sign.click();await page.waitForFunction(()=>Boolean(window.walletTest.release));
  await page.evaluate(()=>window.walletTest.disconnect());await dialog.getByRole('button',{name:'Test wallet',exact:true}).waitFor();
  await page.evaluate(()=>{window.walletTest.release();window.walletTest.mode='success';});
  await dialog.getByRole('button',{name:'Test wallet',exact:true}).click();await sign.waitFor();assert(await sign.isEnabled());
  assert.equal(await download.count(),0,'Stale signing result survived wallet change');
  await dialog.getByRole('button',{name:'Закрыть визитку',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.goto(origin+'/__ton-card?guest');await page.getByRole('button',{name:'Визитка',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Подпись TON Testnet',exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${width}×${height}: real signature routes, mainnet rejection, reject/retry/tamper, download, file verification, signed update chain, explicit Testnet transaction, unconfirmed RPC, guest access, geometry`);
 }
} finally {await browser.close();await server.close();}
