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
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__fixtureRequests = [];
    const realFetch = window.fetch;
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
      window.__fixtureRequests.push({path:url.pathname,method:init.method||'GET'});
      if (/execute|cancel|write-artifacts/.test(url.pathname)) throw Error('Fixture forbids writes');
      return new Response(JSON.stringify(url.pathname.endsWith('/resolve') ? {status:'pending'} : {items:[]}), {headers:{'Content-Type':'application/json'}});
    };
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width:1440,height:1000,deviceScaleFactor:1,mobile:false });
  await call('Page.navigate', {url:'http://localhost:8080/login'});
  await poll('document.readyState === "complete"');
  await evaluate(`(async () => {
    const component = await (await fetch('/src/features/copilot/CopilotConfirmationCard.tsx')).text();
    const reactPath = component.match(/from \"([^\"]*react\\.js[^\"]*)\"/);
    window.__reactPath = reactPath?.[1];
  })()`);
  const transformed = await evaluate(`(async () => (await (await fetch('/src/features/copilot/CopilotConfirmationCard.tsx')).text()).slice(0,1600))()`);
  const reactPath = transformed.match(/from "([^"]*\/react\.js[^\"]*)"/)?.[1];
  if (!reactPath) throw Error('React module path unavailable: '+transformed.slice(0,300));
  const query=reactPath.includes('?')?reactPath.slice(reactPath.indexOf('?')):'';
  const mountFixture = async (reactPath, query) => {
    const React = (await import(reactPath)).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js' + query)).default;
    const {CopilotConfirmationCard,CopilotWriteSuccess} = await import('/src/features/copilot/CopilotConfirmationCard.tsx');
    const {CopilotMarkdown} = await import('/src/features/copilot/CopilotMarkdown.tsx');
    const {CopilotUserMessage} = await import('/src/features/copilot/CopilotUserMessage.tsx');
    await import('/src/features/copilot/copilot.css');
    const h=React.createElement;
    const common={campaignName:'Welcome rewards',shopName:'Team store',currency:'INR',currencyMode:'points',pointsScope:'stadium',recipientCount:2,creditsPerRecipient:250,totalBudget:500,fundingSource:'organization_unallocated',fundingName:'Operating wallet',deliveryMode:'now',invitations:2,walletImpact:{debitedNow:500,balanceBefore:10000,balanceAfter:9500,unallocatedBefore:8000,unallocatedAfter:7500}};
    const base={kind:'confirmation',operation:'campaigns.launch',confirmationId:'fixture-points-confirmation',status:'pending',preview:common,request:{name:'Do not use request facts',totalBudget:999999}};
    const host=document.createElement('div'); document.body.replaceChildren(host);
    const md='## Clear, readable responses\n\nYour store is **Live**. Review the details below.\n\n1. View your store\n2. Manage its layout\n\n- Keep receipts\n- Check approval status\n\n| Department | Available |\n| --- | --- |\n| Marketing | \u20b91,99,000 |\n\n'+String.fromCharCode(96,96,96)+'text\nA long code example wraps without an extra scroll area.\n'+String.fromCharCode(96,96,96);
    window.__polishRoot=createRoot(host);
    const card=props=>h(CopilotConfirmationCard,{artifact:{...base,...props},onChange:()=>{}});
    const render=dark=>{ document.documentElement.classList.toggle('dark',dark); window.__polishRoot.render(h('main',{className:'sm-copilot-page',style:{display:'block',height:'auto',maxWidth:'900px',margin:'0 auto',padding:'20px',borderRadius:0}},
      h(CopilotMarkdown,{content:md}),
      h(CopilotUserMessage,{content:'Use the attached purchase order\\n\\n[Attachments]\\n- Purchase order (documentTicketId=hidden-ticket-id)'.replaceAll('\\n','\n'),attachments:[{id:'fixture-file',kind:'purchase_order',ticketId:'hidden-ticket-id',originalName:'Marketing purchase order - November 2026.pdf',mimeType:'application/pdf',sizeBytes:24576}]}),
      h('div',{className:'sm-copilot-products'},
        h(CopilotWriteSuccess,{artifact:{kind:'success',operation:'campaigns.launch',message:'stale sent claim',result:{...common,status:'launched',deliveryMode:'scheduled',sendAt:'2027-01-01T04:30:00.000Z',timezone:'Asia/Kolkata',walletDebited:true,debitedAmountInr:500,invitationsSent:0,invitationsUnresolved:false}}}),
        h(CopilotWriteSuccess,{artifact:{kind:'success',operation:'campaigns.launch',message:'stale sent claim',result:{...common,status:'redemption_open',walletDebited:true,debitedAmountInr:500,invitationsSent:1,invitationsUnresolved:true}}}),
        card({operation:'campaigns.points_draft',confirmationId:'fixture-draft',preview:{...common,name:'Welcome rewards',walletImpact:{debitedNow:0,requiredAtLaunch:500,balance:10000,unallocatedAmount:8000}}}),
        card({operation:'campaigns.allocate_credits',confirmationId:'fixture-credit',preview:{...common,currencyMode:'inr',walletImpact:{debitedNow:0,requiredAtLaunch:500,balance:10000,unallocatedAmount:8000}}}),
        card({confirmationId:'fixture-launch-org'}),
        card({confirmationId:'fixture-launch-dept',preview:{...common,fundingSource:'department_budget',fundingName:'Marketing',pointsScope:'shop',walletImpact:{debitedNow:500,balanceBefore:2000,balanceAfter:1500,unallocatedBefore:2000,unallocatedAfter:1500}}}),
        card({status:'failed',message:'This confirmation expired. Prepare a fresh preview.'})
      )
    ));}; window.__renderPolish=render;render(false);return true;
  };
  const mounted = await evaluate(`(${mountFixture.toString()})(${JSON.stringify(reactPath)},${JSON.stringify(query)})`);
  await poll('document.querySelectorAll(".sm-copilot-confirm").length === 7');
  await evaluate("document.querySelector('.sm-copilot-confirm button').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  const keyboardTab=await evaluate("document.activeElement.textContent.trim() === 'Confirm'");
  await evaluate("document.querySelector('.sm-copilot-confirm__original summary').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'char',text:String.fromCharCode(13),key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await pause(100);
  const keyboardDisclosure=await evaluate("document.querySelector('.sm-copilot-confirm__original').open");
  if(!keyboardTab||!keyboardDisclosure) throw Error('Keyboard navigation failed '+JSON.stringify({keyboardTab,keyboardDisclosure}));
  await evaluate("document.querySelector('.sm-copilot-confirm__original').open=false;document.activeElement.blur()");
  const checks=[];
  for(const width of [1440,390,320]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600}); await pause(250);
    for(const dark of [false,true]) {
      await evaluate(`window.__renderPolish(${dark})`); await pause(100);
      const result=await evaluate(`(() => {
        const cards=[...document.querySelectorAll('.sm-copilot-confirm')];
        const pending=cards.find(c=>c.querySelector('button'));
        const terminal=cards.filter(c=>!c.querySelector('button'));
        const rects=cards.map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,overflow:c.scrollWidth>c.clientWidth+1}));
        return {width:innerWidth,dark:document.documentElement.classList.contains('dark'),documentOverflow:document.documentElement.scrollWidth>innerWidth+1,cards:rects,terminalCount:terminal.length,buttons:[...pending.querySelectorAll('button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height})),ticketVisible:document.body.innerText.includes('hidden-ticket-id'),technicalTitle:document.body.innerText.includes('Do not use request facts'),stateBadges:[...document.querySelectorAll('.sm-copilot-state')].map(e=>e.textContent),writes:window.__fixtureRequests.filter(r=>/execute|cancel|write-artifacts/.test(r.path))};
      })()`);
      checks.push(result);
      if(result.documentOverflow||result.cards.some(c=>c.overflow)||result.ticketVisible||result.technicalTitle||result.writes.length||result.buttons.some(b=>b.height<40)||result.terminalCount!==3) throw Error('Responsive check failed '+JSON.stringify(result));
      if(width!==320){const metrics=await call('Page.getLayoutMetrics');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.cssContentSize.height,scale:1}});await writeFile(new URL('send-points-'+width+(dark?'-dark':'')+'.png',out),Buffer.from(shot.data,'base64'));}
    }
  }
  await writeFile(new URL('send-points-browser-results.json',out),JSON.stringify({fixtureOnly:true,mounted,keyboardTab,keyboardDisclosure,checks,errors},null,2));
  if(errors.length) throw Error(JSON.stringify(errors));
  console.log(JSON.stringify({checks:checks.length,overflows:checks.filter(c=>c.documentOverflow).length,errors}));
} finally {try {await shutdown?.();} catch {} socket?.close();browser.kill();}
