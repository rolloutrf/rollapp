import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';
const output = '/tmp/rollapp-stories';
await mkdir(output, { recursive: true });
await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','color=c=orange:s=32x64:r=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-y',`${output}/fixture-story.mp4`]);
const videoFixture=await readFile(`${output}/fixture-story.mp4`);
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, plugins: [{
  name: 'story-presentation', enforce: 'pre',
  transform(source, id) {
    if(id.endsWith('/src/App.jsx?story-navigation')) return source+'\nexport { PersistentProfileHero, ProfileEditorContext, ToastContext };';
    if (id.endsWith('/src/hooks/use-user-stories.js')) return `import {useEffect,useState} from 'react'; export function useUserStories(username) {
      const [stories,setStories]=useState([]);
      useEffect(()=>{const update=()=>setStories(window.__activeStory ? [{id:'fixture',expiresAt:new Date(Date.now()+86400000).toISOString(),videoUrl:'/fixture-story.mp4'}] : []);update();window.addEventListener('rollapp:stories',update);return()=>window.removeEventListener('rollapp:stories',update)},[]);
      return {stories,loadError:window.__loadError || ''}; }`;
  },
  configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
    if (req.url==='/fixture-story.mp4') { res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',videoFixture.length);return res.end(videoFixture); }
    if (['/app/friends','/app/wishes','/app/spheres/identity','/app/friendship'].some(path=>req.url.split('?')[0]===path || (path==='/app/friends' && req.url.startsWith(path+'/')))) {
      res.setHeader('Content-Type','text/html');return res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/story-navigation.jsx"></script></body></html>'));
    }
    if (!req.url.startsWith('/stories-fixture')) return next();
    res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html'+(req.url.includes('dark=1')?' class="dark"':'')+'><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/stories.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const browser = await chromium.launch({ ...browserLaunchOptions(), executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: [...browserLaunchOptions().args, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  for(const width of [320,390,768,820,1024,1440,1920]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    await page.route('**/api/**',route=>{errors.push('Unexpected navigation fixture API');return route.abort()});
    page.on('pageerror',error=>errors.push(error.message));
    for(const path of ['/app/friends','/app/friends/','/app/friends/subscriptions','/app/friends/followers','/app/wishes','/app/spheres/identity','/app/friendship']) {
      await page.goto(smokeOrigin(server)+path);
      if(/^\/app\/friends(?:\/|$)/.test(path)) {
        await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
        await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor();
        assert(!await page.evaluate(()=>window.__profile),'friends avatar opens stories');
      } else {
        assert.equal(await page.locator('.story-avatar').count(),0,'stories are unavailable outside friends');
        await page.locator('.persistent-profile-hero__avatar-button').click();
        assert(await page.evaluate(()=>window.__profile),'other avatar opens profile');
      }
    }
    assert.deepEqual(errors,[]);console.log(`PASS story navigation ${width}: friends only; other avatars open profile`);await page.close();
  }
  for (const dark of [false,true]) for (const [width,height] of [[320,740],[390,844],[768,1024],[820,1180],[1024,768],[1440,900],[1920,1080],[390,400]]) {
    const page = await browser.newPage({ viewport: { width,height } });
    const errors=[];
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${smokeOrigin(server)}/stories-fixture?dark=${dark?1:0}`);
    await page.getByRole('button',{name:'Записать сторис', exact:true}).click();
    await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor();
    await page.getByRole('button',{name:'Записать',exact:true}).click();
    await page.getByRole('button',{name:'Остановить',exact:true}).waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button',{name:'Остановить',exact:true}).click();
    await page.getByRole('button',{name:'Опубликовать',exact:true}).waitFor();
    assert(await page.locator('video').evaluate(video => !!video.src && !video.srcObject), 'preview must release camera');
    const primary=await page.getByRole('button',{name:'Опубликовать',exact:true}).evaluate(e=>({form:!!e.form,type:e.type,background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
    assert(primary.form && primary.type==='submit','primary action belongs to HTML form');
    assert.notEqual(primary.background,primary.color,'primary label stays visible in both themes');
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...document.querySelectorAll('[data-control-bar] button')].filter(b=>b.checkVisibility()).map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {name:b.getAttribute('aria-label')||b.textContent,height:r.height,left:r.left,right:r.right,radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].map(parseFloat)}})}));
    assert(!geometry.overflow, `${width}: overflow`);
    for (const control of geometry.controls) { assert.equal(control.height,48,`${width}: ${control.name} height`); assert(control.radii.every(r=>r>=24),`${width}: rounded ${control.name}`); assert(control.left>=0 && control.right<=width,`${width}: clipped ${control.name}`); }
    await page.screenshot({path:`${output}/${dark?'dark':'light'}-${width}x${height}.png`,fullPage:true});
    await page.evaluate(()=>{window.__uploadFails=true});
    await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Ошибка публикации'}).waitFor();
    assert(await page.locator('video').evaluate(video=>!!video.src),'failed upload keeps draft');
    await page.evaluate(()=>{window.__uploadFails=false});
    await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
    await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.__uploads),2);
    await page.evaluate(()=>{window.__activeStory=true;window.dispatchEvent(new Event('rollapp:stories'))});
    await page.getByRole('button',{name:'Посмотреть или добавить сторис'}).waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.story-avatar')).borderTopColor==='rgb(249, 115, 22)');
    const avatar=await page.locator('.story-avatar').first().evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}});
    assert(Math.abs(avatar.width-avatar.height)<1, 'story ring must stay circular');
    await page.getByRole('button',{name:'Посмотреть или добавить сторис'}).click();
    await page.getByRole('heading',{name:'Сторис · Владелец',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.story-form video')?.readyState>=2);
    assert.equal(await page.locator('.story-form video').evaluate(v=>Math.round(v.duration)),1,'published MP4 decodes in viewer');
    await page.getByRole('button',{name:width<768?'Назад':'Закрыть',exact:true}).click();
    await page.getByRole('button',{name:'Сторис Гость',exact:true}).click();
    await page.getByRole('heading',{name:'Сторис · Гость',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Добавить сторис',exact:true}).count(),0,'visitors cannot author another profile');
    await page.getByRole('button',{name:width<768?'Назад':'Закрыть',exact:true}).click();
    await page.evaluate(()=>{window.__activeStory=false;window.dispatchEvent(new Event('rollapp:stories'))});
    await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
    if(width<768) { await page.goBack(); await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor({state:'hidden'}); }
    else await page.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
    await page.getByRole('button',{name:'Редактировать профиль',exact:true}).click();
    await page.waitForFunction(()=>window.__profile===true);
    await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor({state:'hidden'});
    if(width<768) assert(!new URL(page.url()).searchParams.has('formScreen'),'profile callback follows restored history');
    if(width===390 && height===844) {
      await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
      await page.clock.install();
      await page.getByRole('button',{name:'Записать',exact:true}).click();
      await page.getByRole('button',{name:'Остановить',exact:true}).waitFor();
      await page.waitForTimeout(500);
      await page.clock.fastForward(60_001);
      await page.getByRole('button',{name:'Опубликовать',exact:true}).waitFor();
      assert(await page.locator('video').evaluate(v=>!v.srcObject),'deadline must release camera automatically');
      assert.equal(await page.evaluate(()=>window.__uploads),2,'deadline never publishes automatically');
      await page.goBack();
      await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor({state:'hidden'});
      await page.evaluate(()=>{
        const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async constraints=>{const media=await original(constraints);window.__heldCamera=media;return new Promise(resolve=>{window.__releasePermission=()=>resolve(media)})};
      });
      await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
      await page.getByRole('button',{name:'Записать',exact:true}).click();
      await page.waitForFunction(()=>!!window.__releasePermission);
      await page.goBack();
      await page.getByRole('heading',{name:'Новая сторис',exact:true}).waitFor({state:'hidden'});
      await page.evaluate(()=>window.__releasePermission());
      await page.waitForFunction(()=>window.__heldCamera.getTracks().every(track=>track.readyState==='ended'));
      assert.equal(await page.evaluate(()=>window.__uploads),2,'late permission cannot publish or retain camera');
      await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));});
      await page.getByRole('button',{name:'Записать сторис',exact:true}).click();
      await page.getByRole('button',{name:'Записать',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Разрешите доступ'}).waitFor();
      await page.getByRole('button',{name:'Выбрать видео',exact:true}).waitFor();
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS stories ${dark?'dark':'light'} ${width}x${height}: camera, preview, retry, ring, MP4 viewer, owner guards, close, geometry`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
