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
  for(const [name,path] of [['platform','/platform'],['zoho','/case-studies/zoho-people']]){
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://localhost:8080'+path});
    await poll("!!document.querySelector('main h1')");
    await evaluate("(()=>{const close=document.querySelector('.consent-banner__close');if(close)close.click()})()");
    await evaluate('document.fonts.ready');await pause(400);
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(fileURLToPath(new URL('office-reference-'+name+'.png',import.meta.url)),Buffer.from(shot.data,'base64'));
    console.log(await evaluate("(()=>{const h=document.querySelector('main h1'),p=document.querySelector('main p');return {path:location.pathname,headingFont:getComputedStyle(h).fontFamily,headingSize:getComputedStyle(h).fontSize,bodyFont:getComputedStyle(p).fontFamily,bodySize:getComputedStyle(p).fontSize};})()"));
  }
} finally {
  if (call && socket?.readyState === WebSocket.OPEN) { try { await call('Browser.close'); } catch {} }
  socket?.close();
  if (browser.exitCode === null) browser.kill();
}



