import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-catalog-type-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, call;
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(200); }
  }
  if (!port) throw new Error('Browser did not start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await call('Page.enable');
  const poll=async expression=>{for(let n=0;n<80;n++){if(await evaluate(expression))return;await pause(50);}throw new Error('Condition failed: '+expression);};
  const results = [];
  const runtimeErrors = [];
  socket.addEventListener('message', event => { const message=JSON.parse(String(event.data));if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message.params.exceptionDetails.text); });
  await call('Runtime.enable');
  const dismissConsent = () => evaluate("(()=>{const button=document.querySelector('.consent-banner__close');if(button)button.click();})()");
  for (const width of [1910,1440,1120,1024,900,861,860,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride', {width,height:960,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate', {url:'http://localhost:8080/in-office-swag-store'});
    await poll("!!document.getElementById('office-swag-title')");
    await dismissConsent();
    await evaluate('document.fonts.ready');
    await evaluate("Promise.all(Array.from(document.querySelectorAll('.office-swag img')).map(img=>{img.loading='eager';return img.decode();}))");
    await pause(150);
    const result = await evaluate(`(()=>{const main=document.querySelector('.office-swag'),nav=document.querySelector('.site-header .nav-links'),brand=document.querySelector('.site-header .brand'),end=document.querySelector('.header-end'),link=document.querySelector('.office-store-nav'),about=Array.from(document.querySelectorAll('.nav-links__sheet>a')).find(a=>a.textContent.trim()==='About');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(main).fontFamily,headingFont:getComputedStyle(main.querySelector('h1')).fontFamily,headingSize:getComputedStyle(main.querySelector('h1')).fontSize,navBackground:getComputedStyle(link).backgroundColor,navRadius:getComputedStyle(link).borderRadius,bodySize:getComputedStyle(main.querySelector('.office-swag-hero-copy>p:not(.office-swag-eyebrow)')).fontSize,images:Array.from(main.querySelectorAll('img')).map(i=>({loaded:i.complete&&i.naturalWidth>0,src:i.getAttribute('src')})),desktopHeaderFits:innerWidth<=860||(brand.getBoundingClientRect().right<=nav.getBoundingClientRect().left&&nav.getBoundingClientRect().right<=end.getBoundingClientRect().left),navGap:innerWidth>860?link.getBoundingClientRect().left-about.getBoundingClientRect().right:null,ctaLinks:Array.from(main.querySelectorAll('.office-swag-button')).map(a=>a.getAttribute('href')),occasionRows:main.querySelectorAll('tbody tr').length,title:document.title};})()`);
    if(!result.headingFont.includes('Hanken Grotesk')||result.navRadius!=='6px'||result.overflow||!result.desktopHeaderFits||result.images.some(i=>!i.loaded)||result.ctaLinks.some(h=>h!=='/request-demo')||result.occasionRows!==4)throw Error(JSON.stringify(result));
    results.push(result);
    if(width===1440||width===390){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(fileURLToPath(new URL('in-office-swag-hero-'+width+'.png',import.meta.url)),Buffer.from(shot.data,'base64'));
      const metrics=await call('Page.getLayoutMetrics');
      const full=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
      await writeFile(fileURLToPath(new URL('in-office-swag-full-'+width+'.png',import.meta.url)),Buffer.from(full.data,'base64'));
    }
  }
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080/'});await poll("!!document.querySelector('.lh-hero')");await dismissConsent();
    if(width===390)await evaluate("document.querySelector('[aria-label=\"Open menu\"]').click()");
    await evaluate("document.querySelector('.office-store-nav').click()");
    await poll("location.pathname==='/in-office-swag-store'&&!!document.getElementById('office-swag-title')");
    if(await evaluate("!!document.querySelector('.site-header.menu-open')"))throw Error('Mobile menu did not close');
    await evaluate("document.querySelector('.office-swag-button').click()");await poll("location.pathname==='/request-demo'");
  }
  if(runtimeErrors.length)throw Error(JSON.stringify(runtimeErrors));
  await writeFile(fileURLToPath(new URL('in-office-swag-results.json',import.meta.url)),JSON.stringify({viewports:results,navFromHome:true,mobileMenuClosedOnNavigation:true,ctaNavigation:true,runtimeErrors},null,2));
  console.log(JSON.stringify({widths:results.map(r=>r.width),allImagesLoaded:true,navFromHome:true,ctaNavigation:true,runtimeErrors}));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



