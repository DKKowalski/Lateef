import { chromium } from 'playwright-core';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve('site/dist');const errors=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.LATEEF_TEST_CHROMIUM,channel:process.env.LATEEF_TEST_CHROMIUM?undefined:'chromium'});
try{
 await mkdir('artifacts/site',{recursive:true});
 for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
 for(const name of ['index.html','install.html','privacy.html','security.html']){
  await page.goto(pathToFileURL(join(root,name)).href);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error(`Horizontal overflow: ${name} at ${width}`);
  for(const href of await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.getAttribute('href')))){
   if(href.startsWith('#')){if(!await page.locator(href).count())throw Error('Missing anchor '+href);}
   else if(!/^https?:/.test(href))await stat(resolve(root,href.split('#')[0]));
  }
  if(name==='index.html'){
    const stage=page.locator('[data-stage]').first();await stage.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>window.LateefMotion&&document.querySelector('[data-stage].is-playing'));
    const offset=()=>stage.locator('.a-draw').first().evaluate(el=>parseFloat(getComputedStyle(el).strokeDashoffset));
    await stage.locator('[data-play]').click();await page.waitForTimeout(330);
    const mid=await offset();if(!(mid>0&&mid<1))throw Error('SVG stroke does not draw progressively');
    await page.waitForTimeout(2700);
    if(await stage.evaluate(el=>el.classList.contains('is-playing')))throw Error('Stage did not settle after playing');
    if(await offset()!==0)throw Error('Finished stroke is not complete');
    await page.emulateMedia({reducedMotion:'reduce'});await stage.locator('[data-play]').click();
    const names=await stage.evaluate(el=>[getComputedStyle(el.querySelector('.a-draw')).animationName,getComputedStyle(el.querySelector('.art')).animationName]);
    if(names[0]!=='none'||names[1]!=='settle')throw Error('Reduced motion still moves parts: '+names);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(500);
    const arrow=page.locator('.terminal .interactive-arrow .arrow-shaft');
    const original=await arrow.getAttribute('d');await page.locator('.terminal>a').focus();await page.waitForTimeout(65);
    if(original===await arrow.getAttribute('d'))throw Error('Keyboard focus did not animate the SVG arrow');
    await page.evaluate(()=>document.activeElement.blur());await page.waitForTimeout(900);
    const access=page.locator('[data-access]'),route=()=>access.locator('.route').evaluate(el=>parseFloat(getComputedStyle(el).strokeDashoffset));
    await access.locator('[data-access-toggle]').click();await page.waitForTimeout(300);
    if((await access.locator('[data-access-toggle]').getAttribute('aria-pressed'))!=='false')throw Error('Revoke action not reflected in accessibility state');
    if(await route()<.99)throw Error('Revoked route still visible');
    await access.locator('[data-access-toggle]').click();await page.waitForTimeout(700);
    if(await route()>.01)throw Error('Shared route not restored');
    await page.evaluate(()=>{const source=document.querySelector('[data-gallery]');const copy=source.cloneNode(true);copy.removeAttribute('id');source.after(copy);const a=window.LateefMotion.mount(source),b=window.LateefMotion.mount(copy);if(a!==window.LateefMotion.mount(source))throw Error('Mounting twice made a second controller');const ids=[...document.querySelectorAll('svg [id]')].map(el=>el.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate SVG IDs');for(const s of document.querySelectorAll('[data-stage]'))s.classList.remove('is-playing');b.play(0);if(source.querySelector('[data-stage]').classList.contains('is-playing')||!copy.querySelector('[data-stage]').classList.contains('is-playing'))throw Error('Galleries do not play independently');copy.querySelector('[data-access-toggle]').click();if(source.querySelector('[data-access]').dataset.access!=='shared')throw Error('Access switch leaked between galleries');b.destroy();if(copy.querySelector('.is-playing'))throw Error('Destroy left a stage playing');copy.remove();});
    const settled=await arrow.getAttribute('d');await page.waitForTimeout(100);if(settled!==await arrow.getAttribute('d'))throw Error('SVG spring did not settle');
  }
  if(name==='index.html')await page.screenshot({path:resolve(`artifacts/site/home-${width}.png`),fullPage:true});
 }
 await page.close();
 }
 if(errors.length)throw Error(errors.join('; '));
 console.log('PASS: desktop/mobile layouts, internal links/downloads, page scripts, stage play/settle/reduced-motion, access switch, independent galleries; all browser pages closed.');
}finally{await browser.close();}
