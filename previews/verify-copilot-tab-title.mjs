import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out = new URL('./copilot/', import.meta.url);
await mkdir(out, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), 'shelfmerch-copilot-'));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
let shutdown;
const errors = [];
try {
  let port;
  for (let i = 0; i < 60; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(200); }
  }
  if (!port) throw Error('Edge failed to start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    const req = pending.get(msg.id);
    if (req) { pending.delete(msg.id); clearTimeout(req.timer); msg.error ? req.reject(Error(msg.error.message)) : req.resolve(msg.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error(`Timeout: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  shutdown = () => call('Browser.close');
  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const poll = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw Error(`Condition failed: ${expression}. ${await evaluate('document.body.innerText.slice(0,1000)')}`);
  };
  const shot = async name => {
    await evaluate('document.fonts.ready');
    await pause(250);
    const res = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(name + '.png', out), Buffer.from(res.data, 'base64'));
  };
  console.log('Connected to Edge CDP', target.id);
  console.log(await call('Browser.getVersion'));

  await call('Page.enable'); await call('Runtime.enable');
  const installFixtures=()=>{
    const user={id:'title-fixture-user',tenantId:'title-fixture-tenant',name:'Title test',email:'title@example.test',role:'company_admin',scopeType:'tenant',assignedEntityIds:[]};
    localStorage.setItem('sm_access','browser-title-fixture');localStorage.setItem('sm_user',JSON.stringify(user));localStorage.setItem('sm_workspace_slug','ai-test');
    localStorage.setItem('shelfmerch.consent',JSON.stringify({v:1,analytics:false,advertising:false}));sessionStorage.setItem('sm-new-user-welcome-dismissed','1');
    window.__titleRequests=[];const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.origin);
      if(!url.pathname.startsWith('/api/'))return original(input,init);
      window.__titleRequests.push({path:url.pathname,method:init.method||'GET'});
      if(init.method && init.method!=='GET') throw Error('Read-only title fixture forbids mutation');
      let value={items:[]};
      if(url.pathname.endsWith('/copilot/status'))value={enabled:true,provider:'disabled',role:'company_admin',capabilities:[],writeToolsEnabled:false};
      if(url.pathname.endsWith('/auth/me'))value=user;
      if(url.pathname.endsWith('/tenants/me'))value={id:user.tenantId,name:'Title fixture',slug:location.pathname.split('/')[1]};
      if(url.pathname.endsWith('/notifications'))value={items:[],unreadCount:0};
      return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    };
  };
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(${installFixtures.toString()})()`});
  await call('Page.navigate',{url:'http://localhost:8080/ai-test/copilot'});
  const ready='document.title === "ShelfMerch Copilot | ShelfMerch" && !!document.querySelector(".sm-copilot-page")';
  await poll(ready);
  const snapshot=()=>evaluate(`({url:location.href,title:document.title,canonical:document.querySelector('link[rel="canonical"]')?.href||null,robots:document.querySelector('meta[name="robots"]')?.content})`);
  const direct=await snapshot();
  await call('Page.reload',{ignoreCache:true});await poll(ready);const refresh=await snapshot();
  const main=await evaluate(`(async()=>(await(await fetch('/src/main.tsx')).text()))()`);
  const routerPath=main.match(/from "([^"]*\/app\/router\.tsx[^\"]*)"/)?.[1];
  if(!routerPath)throw Error('Router module path unavailable');
  await evaluate(`(async()=>{window.__titleRouter=(await import(${JSON.stringify(routerPath)})).appRouter;await window.__titleRouter.navigate('/about');})()`);
  await poll('location.pathname === "/about" && document.title !== "ShelfMerch Copilot | ShelfMerch"');const publicPage=await snapshot();
  await evaluate(`window.__titleRouter.navigate('/another-tenant/copilot')`);await poll(ready);const clientNavigation=await snapshot();
  await evaluate(`window.__titleRouter.navigate('/ai-test/copilot/not-a-route')`);await poll('document.title === "Page not found | ShelfMerch"');const notFound=await snapshot();
  if([direct,refresh,clientNavigation].some(x=>x.canonical!==null||x.robots!=='noindex, nofollow'))throw Error('Private SEO metadata changed');
  if(publicPage.canonical!=='https://shelfmerch.io/about')throw Error('Public canonical changed');
  if(errors.length)throw Error(JSON.stringify(errors));
  await writeFile(new URL('tab-title-browser-results.json',out),JSON.stringify({fixtureOnly:true,direct,refresh,publicPage,clientNavigation,notFound,errors},null,2));
  console.log(JSON.stringify({direct,refresh,clientNavigation,notFound,errors}));
} finally {try {await shutdown?.();} catch {} socket?.close();browser.kill();}
