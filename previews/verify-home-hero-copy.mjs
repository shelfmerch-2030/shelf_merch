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
  for (const width of [1910,1440,1024,768,390,320]) {
    await call('Emulation.setDeviceMetricsOverride', {width,height:960,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate', {url:'http://localhost:8080/'});
    await poll("!!document.getElementById('lh-title')");
    await evaluate('document.fonts.ready');
    await evaluate("Promise.all(Array.from(document.querySelectorAll('.lh-hero img')).map(img=>img.decode().catch(()=>{})))");
    await evaluate("(()=>{const overlay=document.querySelector('.consent-overlay');if(overlay)overlay.style.display='none';})()");
    await pause(200);
    const result = await evaluate(`(()=>{const h=document.getElementById('lh-title'),hero=document.querySelector('.lh-hero'),p=hero.querySelector('p'),cta=hero.querySelector('.lh-actions');return {width:innerWidth,heading:h.textContent.replace(/\\s+/g,' ').trim(),fontSize:getComputedStyle(h).fontSize,headingHeight:h.getBoundingClientRect().height,headingOverflow:h.scrollWidth>h.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth,heroHeight:hero.getBoundingClientRect().height,ctaBottom:cta.getBoundingClientRect().bottom,description:p.textContent.replace(/\\s+/g,' ').trim()};})()`);
    if(result.heading!=='The AI-powered platform for corporate swag'||result.headingOverflow||result.pageOverflow||result.headingHeight>220||(width>=1024&&result.ctaBottom>960))throw Error(JSON.stringify(result));
    results.push(result);
    if(width===1440||width===390){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(fileURLToPath(new URL('home-hero-copy-'+width+'.png',import.meta.url)),Buffer.from(shot.data,'base64'));}
  }
  await writeFile(fileURLToPath(new URL('home-hero-copy-results.json',import.meta.url)),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



