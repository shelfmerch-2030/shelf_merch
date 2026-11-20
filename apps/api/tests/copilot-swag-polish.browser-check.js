// Explicit local-browser verification; normal test discovery does not require Edge or Vite processes.
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { png } from './fixtures/swagArtwork.js';
import { LOCAL_UPLOAD_DIR } from '../src/services/storage.service.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { streamOpenAiCompletion } from '../src/modules/copilot/providers/openaiChatAdapter.js';

vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js', async original => ({ ...await original(),
  createOpenAiClient: vi.fn(() => ({})), streamOpenAiCompletion: vi.fn(),
}));
const previous = { enabled: env.EMBEDDED_COPILOT_ENABLED, flag: env.EMBEDDED_COPILOT_WRITE_COLLECTIONS, key: env.OPENAI_API_KEY, provider: env.COPILOT_AI_PROVIDER };
beforeAll(connectTestDb);
afterAll(async () => { Object.assign(env, { EMBEDDED_COPILOT_ENABLED: previous.enabled, EMBEDDED_COPILOT_WRITE_COLLECTIONS: previous.flag,
  OPENAI_API_KEY: previous.key, COPILOT_AI_PROVIDER: previous.provider }); await disconnectTestDb(); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

it('verifies focused product selection, card states and composer-only logo upload in real Edge', async () => {
  await clearTestDb();
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: 'true', EMBEDDED_COPILOT_WRITE_COLLECTIONS: 'true', OPENAI_API_KEY: 'synthetic-provider-only', COPILOT_AI_PROVIDER: 'openai' });
  const tenant = await makeTenant({ slug: 'ai-test', name: 'Isolated browser workspace' });
  const account = await makeUser(tenant, 'company_admin');
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const artworkFolder = await mkdtemp(path.join(LOCAL_UPLOAD_DIR, 'isolated-browser-auto-'));
  const logoPath = path.join(artworkFolder, 'company-logo.png');
  await writeFile(logoPath, png(64,32,[220,20,20,255]));
  await writeFile(path.join(artworkFolder,'base.png'), png(200,300,[235,235,235,255]));
  const baseUrl = `/uploads/${path.basename(artworkFolder)}/base.png`;
  const products = [];
  for (const [index,name] of ['Ceramic Mug','Classic Crew Neck','Classic Profile Mug','Corporate Polo','Travel Corporate Polo with an exceptionally long catalog product name for responsive layout verification'].entries()) {
    products.push(await CatalogProduct.create({ sku: `POLISH-${index}`, name, category: 'Apparel', status: 'active', basePriceInr: 500+index*100,
      primaryImageUrl: baseUrl, maskImageUrl: baseUrl, physicalDimensions: { width: 20, height: 24 },
      printAreas: [{key:'front',label:'Front',xIn:7,yIn:6,widthIn:6,heightIn:6,dpi:300,methods:['dtf'],mockupImageUrl:baseUrl}] }));
  }
  const phase = process.env.SWAG_POLISH_PHASE || 'after';
  const after = phase === 'after';
  vi.mocked(streamOpenAiCompletion).mockImplementation(async ({ messages }) => {
    const last = messages.at(-1);
    const conversation = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id }).sort({ createdAt: -1 });
    if (last.role === 'user' && !conversation.swag) return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'start', name: 'swag_configure', arguments: JSON.stringify({ revision: 0, reset: true }) }] };
    if (last.role === 'user') return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'name', name: 'swag_configure',
      arguments: JSON.stringify({ revision: conversation.swag.revision, name: String(last.content).replace(/[.!]$/, '') }) }] };
    const result = JSON.parse(last.content);
    if (result.conversationId && !result.name) return { text: 'What would you like to name your swag collection?', toolCalls: [], finishReason: 'stop', usage: {} };
    if (result.conversationId) return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'catalog', name: 'catalog_search', arguments: JSON.stringify({ query: 'Polo', category: 'Apparel', limit: 4 }) }] };
    return { text: 'Here are verified summer options. Select products or browse another category.', toolCalls: [], finishReason: 'stop', usage: {} };
  });
  const output = path.resolve(process.env.SWAG_POLISH_OUTPUT || `../../previews/copilot/swag-polish/${phase}`); await mkdir(output, { recursive: true });
  const api = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => api.once('listening', resolve));
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  const frontPort = await freePort(); const origin = `http://127.0.0.1:${frontPort}`;
  const viteLog = openSync(path.join(output, 'browser-vite.log'), 'w');
  const vite = spawn(process.execPath, [path.resolve('../../node_modules/vite/bin/vite.js'), '--config', path.resolve('../../previews/copilot/swag-auto/vite-artwork-browser.config.mjs'), '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], {
    cwd: path.resolve('../web'), windowsHide: true, stdio: ['ignore', viteLog, viteLog], env: { ...process.env, NODE_ENV: 'development', VITE_GTM_ID: '', VITE_USE_MOCKS: 'false', SWAG_BROWSER_API_ORIGIN: apiOrigin },
  });
  const profile = await mkdtemp(path.join(tmpdir(), 'shelfmerch-swag-browser-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, call, evaluate; const errors = []; const requests = []; const responses = []; const checks = [];
  try {
    let frontReady = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) { frontReady = true; break; } } catch {} await pause(200); }
    if (!frontReady) throw Error(`Isolated Vite server did not start (exit ${vite.exitCode}). See browser-vite.log.`);
    let port;
    for (let i = 0; i < 80; i++) { try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(200); } }
    if (!port) throw Error('Edge did not start');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let sequence = 0; const pending = new Map();
    call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.addEventListener('message', async event => {
      const message = JSON.parse(String(event.data)); const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result); }
      if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/api/')) responses.push({ path: new URL(message.params.response.url).pathname, status: message.params.response.status });
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request: browserRequest } = message.params;
      try {
        const url = new URL(browserRequest.url);
        if (url.origin === origin && url.pathname.startsWith('/api/')) {
          requests.push({ path: url.pathname, method: browserRequest.method });
          // The test-only Vite config routes every API/proxy prefix exclusively to our isolated API. Multipart upload bytes stay intact.
          await call('Fetch.continueRequest', { requestId });
        } else if (url.origin === origin && url.pathname === '/synthetic-hoodie.png') {
          await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAD0lEQVR4nGP4jwYYSBcAAHg8P8FY7imoAAAAAElFTkSuQmCC' });
        } else if (url.origin === origin) await call('Fetch.continueRequest', { requestId });
        else if (url.protocol === 'data:') await call('Fetch.continueRequest', { requestId });
        else await call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      } catch (error) { errors.push(`API bridge: ${error.message}`); try { await call('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch {} }
    });
    await call('Page.enable'); await call('Network.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value;
    };
    async function poll(expression) { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(150); } throw Error(`Browser condition failed: ${expression}\n${await evaluate('document.body.innerText')}`); }
    async function click(text, root = 'document') {
      await poll(`Array.from(${root}.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);
      const point = await evaluate(`(()=>{const b=Array.from(${root}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    }
    async function send(content) {
      await evaluate(`(()=>{const el=document.getElementById('copilot-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(content)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await poll(`!!document.querySelector('[aria-label="Send message"]:not(:disabled)')`); await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
      await poll(`!document.querySelector('[aria-label="Sending message"]')`);
    }
    async function capture(name) {
      await evaluate(`document.querySelector('.sm-copilot-messages').scrollTop=document.querySelector('.sm-copilot-messages').scrollHeight`);
      await pause(150);
      await writeFile(path.join(output,`${name}.png`), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sm_access',${JSON.stringify(account.token)});localStorage.setItem('sm_user',${JSON.stringify(JSON.stringify({ id: String(account.user._id), tenantId: String(tenant._id), name: 'Browser admin', email: account.user.email, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] }))});localStorage.setItem('sm_workspace_slug','ai-test');localStorage.setItem('shelfmerch.consent',JSON.stringify({v:1,analytics:false,advertising:false}));` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `${origin}/ai-test/copilot` });
    await poll(`!!document.getElementById('copilot-input')`);
    const continueLabel = after ? 'Continue' : 'Continue with selected products';
    await send('I want to design swag.');
    await poll(`document.body.innerText.includes('What would you like to name your swag collection?')`);
    await send('Polish check'); await send('Yes');
    await poll(`document.querySelectorAll('.sm-swag-product-add').length===4`);
    await capture('01-unselected');
    const corporateId = String(products[3]._id);
    const corporate = `document.querySelector('[data-swag-product-id="${corporateId}"]').closest('.sm-copilot-product--selectable')`;
    const styles = expression => evaluate(`(()=>{const e=${expression},s=getComputedStyle(e),r=e.getBoundingClientRect();return {border:s.borderColor,borderWidth:s.borderWidth,background:s.backgroundColor,shadow:s.boxShadow,outline:s.outlineStyle,outlineWidth:s.outlineWidth,transition:s.transitionDuration,width:r.width,left:r.left};})()`);
    const unselected = await styles(corporate);
    for (const product of products.slice(0,4)) {
      await poll(`!!document.querySelector('[aria-label=${JSON.stringify('Add '+product.name)}]:not(:disabled)')`);
      await evaluate(`(()=>{const b=document.querySelector('[aria-label=${JSON.stringify('Add '+product.name)}]');b.click();b.click();})()`);
      await poll(`!!document.querySelector('[aria-label=${JSON.stringify('Remove '+product.name)}][aria-pressed=true]')`);
    }
    const saved = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
    expect(saved.swag.productIds).toEqual(products.slice(0,4).map(p=>String(p._id)));
    expect(requests.filter(r=>r.path.endsWith('/swag')&&r.method==='POST')).toHaveLength(4);
    checks.push('four backend-acknowledged selections, duplicate clicks blocked, original product identities preserved');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:25,y:100}); await pause(200);
    const selected = await styles(corporate);
    await capture('02-selected'); await capture('04-selected-summary');
    const continueStyle = await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('[data-swag-step=products] button')).find(b=>b.textContent.trim()===${JSON.stringify(continueLabel)}),s=document.querySelector('[aria-label="Selected products"], [aria-label="Products added"]');return {width:b.getBoundingClientRect().width,left:b.getBoundingClientRect().left,summaryLeft:s.getBoundingClientRect().left};})()`);
    if(after){ expect(await evaluate(`new Set(Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).querySelectorAll('.sm-copilot-product--selectable')).size`)).toBe(4); expect(await evaluate(`new Set(Array.from(Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).querySelectorAll('.sm-copilot-product--selectable')).map(e=>e.getBoundingClientRect().top)).size`)).toBe(1); expect(selected.border).toBe(unselected.border); expect(continueStyle.width).toBeLessThan(180); expect(Math.abs(continueStyle.left-continueStyle.summaryLeft)).toBeLessThan(2); }
    const point = await evaluate(`(()=>{const e=${corporate};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+25};})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point}); await pause(220);
    const hovered = await styles(corporate); await capture('03-hovered');
    if(after){ expect(hovered.border).toBe(selected.border); expect(hovered.shadow).toBe(selected.shadow); }
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await evaluate(`document.querySelector('[data-swag-product-id="${corporateId}"]').focus()`);
    const focus = await styles(`document.querySelector('[data-swag-product-id="${corporateId}"]')`);
    if(after){ expect(focus.outlineWidth).toBe('2px'); expect(focus.shadow).toBe('none'); }
    await capture('keyboard-focus');
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const reduced = await styles(corporate); if(after){ expect(reduced.transition).toBe('0s'); expect((await styles(`document.querySelector('[data-swag-product-id="${corporateId}"]')`)).transition).toBe('0s'); }
    await call('Emulation.setEmulatedMedia',{features:[]});
    await evaluate(`document.activeElement?.blur()`);
    checks.push('desktop selection summary, pointer hover, keyboard focus and reduced-motion inspected');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await pause(150);
    await capture('06-mobile-cards-summary');
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    await click('Explore more'); await poll(`!!document.querySelector('[aria-label=${JSON.stringify('Add '+products[4].name)}]')`);
    await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true}); await pause(150); await capture('long-name-mobile');
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    expect(await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).querySelector('.sm-copilot-product__meta strong');return e.scrollWidth<=e.clientWidth+1})()`)).toBe(true);
    checks.push('390px and 320px layouts, long names and pagination retain all four selections');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await pause(150); await capture('long-name-desktop');
    if(after)expect((await styles(`Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).querySelector('.sm-copilot-product--selectable')`)).width).toBeLessThan(240);
    await click(continueLabel); await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
    await capture('05-logo-prompt');
    const logoQuestion = after
      ? 'Would you like to add your company logo? You can upload it using the + button below, or continue without one.'
      : 'Would you like to add your company logo? You can upload it using + below, or skip for now.';
    expect((await CopilotConversation.findById(saved._id)).messages.at(-1).content).toBe(logoQuestion);
    const logoButtons=await evaluate(`Array.from(document.querySelectorAll('[data-swag-step=artwork] button')).map(b=>b.textContent.trim())`);
    expect(logoButtons).toEqual(after ? [] : ['Upload logo','Skip logo','Change products']);
    if(after)expect(await evaluate('document.body.innerText')).toContain(logoQuestion);
    if (after) await send('Skip'); else await click('Skip logo');
    await poll(`!!document.querySelector('[data-swag-step=design]')`);
    expect((await CopilotConversation.findById(saved._id)).swag.artwork).toBe('none');
    await send('Remove Corporate Polo');
    await poll(`!!document.querySelector('[data-swag-step=products]')`);
    expect((await CopilotConversation.findById(saved._id)).swag.productIds).not.toContain(corporateId);
    await click(continueLabel); await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
    await call('Page.setInterceptFileChooserDialog',{enabled:true});
    await evaluate(`document.querySelector('[aria-label="Add attachment"]').click()`);
    await poll(`!!Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork'))`);
    await evaluate(`Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork')).click()`);
    const root = await call('DOM.getDocument'); const input=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#copilot-attach-swag_artwork'});
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[logoPath]});
    await send('');
    await poll(`document.querySelector('.sm-copilot-sent-logo img')?.naturalWidth > 0`);
    expect(await evaluate('document.body.innerText')).toContain("I've received your logo.");
    await capture('uploaded-logo');
    await send('Yes'); await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled)`);
    await capture('apply-approval');
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
    expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id,status:'pending',operation:'swag.collection'})).toBe(1);
    expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(0);
    expect(errors).toEqual([]);
    checks.push('Skip uses existing no-artwork transition; natural-language removal still works; + Swag purpose uploads PNG and prepares approval without automatic execution');
    await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({phase,actualBrowser:'Microsoft Edge headless',backend:'real controllers, MongoMemoryReplSet and local multipart storage',provider:'mocked',liveCustomerDataUsed:false,executeRequests:0,collections:0,checks,errors,unselected,selected,hovered,focus,reduced,continueStyle},null,2));
  } catch (error) {
    await writeFile(path.join(output, 'browser-debug.json'), JSON.stringify({ checks, errors, requests, responses, origin, cwd: process.cwd(), viteExitCode: vite.exitCode }, null, 2));
    if (evaluate) await writeFile(path.join(output, 'browser-failure.txt'), `${error.stack}\n${await evaluate('document.body.innerText').catch(() => '')}`);
    throw error;
  } finally {
    if (call) await call('Browser.close').catch(() => {}); socket?.close(); edge.kill(); vite.kill();
    closeSync(viteLog);
    await new Promise(resolve => api.close(resolve));
    if (path.dirname(artworkFolder) === LOCAL_UPLOAD_DIR) await rm(artworkFolder, { recursive: true, force: true });
    const tenantFolder = path.join(LOCAL_UPLOAD_DIR, String(tenant._id));
    if (path.dirname(tenantFolder) === LOCAL_UPLOAD_DIR) await rm(tenantFolder, { recursive: true, force: true });
  }
}, 180000);
