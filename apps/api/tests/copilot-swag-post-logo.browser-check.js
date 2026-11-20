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
import { Shop } from '../src/modules/shops/shop.model.js';
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

it('verifies natural post-logo approval, real saved mockups and separately confirmed publishing in Edge', async () => {
  await clearTestDb();
  const storeStatus = process.env.SWAG_PUBLISH_STORE_STATUS === 'live' ? 'live' : 'draft';
  const publishCheck = Boolean(process.env.SWAG_PUBLISH_STORE_STATUS);
  const selectedCount = publishCheck ? 3 : 2;
  const collectionName = publishCheck ? 'SWAGGG DESIGN' : 'Team Swag';
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: 'true', EMBEDDED_COPILOT_WRITE_COLLECTIONS: 'true', OPENAI_API_KEY: 'synthetic-provider-only', COPILOT_AI_PROVIDER: 'openai' });
  const tenant = await makeTenant({ slug: 'ai-test', name: 'Isolated browser workspace' });
  const account = await makeUser(tenant, 'company_admin');
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const artworkFolder = await mkdtemp(path.join(LOCAL_UPLOAD_DIR, 'isolated-browser-auto-'));
  const logoPath = path.join(artworkFolder, 'company-logo.png');
  const invalidPath = path.join(artworkFolder, 'invalid-logo.txt');
  await writeFile(logoPath, png(64,32,[220,20,20,255]));
  await writeFile(invalidPath, 'not a PNG');
  await writeFile(path.join(artworkFolder,'base.png'), png(200,300,[235,235,235,255]));
  const baseUrl = `/uploads/${path.basename(artworkFolder)}/base.png`;
  const products = [];
  const catalogPhotos = ['catalog/category-tiles/apparel/polo-shirts.png', 'mug.png', 'catalog/backpack-lifestyle.png'];
  const productImages = [];
  const productNames = ['Corporate Polo', 'Ceramic Mug', publishCheck ? 'Anti-Theft Laptop Backpack With Organizer' : 'Classic Profile Mug', 'Classic Crew Neck'];
  for (const [index,name] of productNames.entries()) {
    let baseImage = baseUrl;
    if ((process.env.SWAG_LOGO_FLOW_CHECK || publishCheck) && index < selectedCount && catalogPhotos[index]) {
      const name = `product-${index}.png`;
      await writeFile(path.join(artworkFolder, name), await readFile(path.resolve('../web/assets', catalogPhotos[index])));
      baseImage = `/uploads/${path.basename(artworkFolder)}/${name}`;
    }
    productImages.push(baseImage);
    products.push(await CatalogProduct.create({ sku: `POLISH-${index}`, name, category: 'Apparel', status: 'active', basePriceInr: 500+index*100,
      primaryImageUrl: baseImage, maskImageUrl: baseImage, physicalDimensions: { width: 20, height: 24 },
      variants: publishCheck ? [{ sku: `POLISH-OPTION-${index}`, stock: index === 2 ? 0 : 8 }] : [],
      printAreas: [{key:'front',label:'Front',xIn:publishCheck && index === 2 ? 13 : 7,yIn:publishCheck && index === 2 ? 10 : 6,widthIn:6,heightIn:6,dpi:300,methods:['dtf'],mockupImageUrl:baseImage}] }));
  }
  const store = await Shop.create({tenantId:tenant._id,name:'AI Store',slug:'isolated-post-logo-store',status:storeStatus});
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
  const output = path.resolve(process.env.SWAG_LOGO_FLOW_OUTPUT || '../../previews/copilot/swag-post-logo/browser'); await mkdir(output, { recursive: true });
  const api = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => api.once('listening', resolve));
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  const frontPort = await freePort(); const origin = `http://127.0.0.1:${frontPort}`;
  const viteLog = openSync(path.join(output, 'browser-vite.log'), 'w');
  const vite = spawn(process.execPath, [path.resolve('../../node_modules/vite/bin/vite.js'), '--config', path.resolve('../../previews/copilot/swag-auto/vite-artwork-browser.config.mjs'), '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], {
    cwd: path.resolve('../web'), windowsHide: true, stdio: ['ignore', viteLog, viteLog], env: { ...process.env, NODE_ENV: 'development', VITE_GTM_ID: '', VITE_USE_MOCKS: 'false', SWAG_BROWSER_API_ORIGIN: apiOrigin },
  });
  const profile = await mkdtemp(path.join(tmpdir(), 'shelfmerch-swag-browser-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, call, evaluate, holdUpload, holdPublish; const errors = []; const requests = []; const responses = []; const checks = [];
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
      const { requestId, request: browserRequest, responseStatusCode } = message.params;
      try {
        const url = new URL(browserRequest.url);
        if (url.origin === origin && url.pathname.startsWith('/api/')) {
          if (responseStatusCode && url.pathname.endsWith('/execute')) {
            expect(responseStatusCode).toBe(200);
            await call('Fetch.failRequest', { requestId, errorReason: 'ConnectionClosed' });
            return;
          }
          requests.push({ path: url.pathname, method: browserRequest.method });
          if (holdUpload && browserRequest.method === 'POST' && url.pathname.endsWith('/copilot/attachments')) await holdUpload;
          if (holdPublish && url.pathname.endsWith('/execute')) {
            await holdPublish;
            await call('Fetch.continueRequest', { requestId, interceptResponse: storeStatus === 'live' });
            return;
          }
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
    async function send(content, doubleClick = false) {
      await evaluate(`(()=>{const el=document.getElementById('copilot-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(content)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await poll(`!!document.querySelector('[aria-label="Send message"]:not(:disabled)')`);
      await evaluate(`(()=>{const button=document.querySelector('[aria-label="Send message"]');button.click();if(${doubleClick})button.click();})()`);
      await poll(`!document.querySelector('[aria-label="Sending message"]')`);
    }
    async function capture(name, bottom = true) {
      if (bottom) await evaluate(`document.querySelector('.sm-copilot-messages').scrollTop=document.querySelector('.sm-copilot-messages').scrollHeight`);
      await pause(150);
      await writeFile(path.join(output,`${name}.png`), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sm_access',${JSON.stringify(account.token)});localStorage.setItem('sm_user',${JSON.stringify(JSON.stringify({ id: String(account.user._id), tenantId: String(tenant._id), name: 'Browser admin', email: account.user.email, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] }))});localStorage.setItem('sm_workspace_slug','ai-test');localStorage.setItem('shelfmerch.consent',JSON.stringify({v:1,analytics:false,advertising:false}));` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `${origin}/ai-test/copilot` });
    await poll(`!!document.getElementById('copilot-input')`);
    await send('I want to design swag.');
    await poll(`document.body.innerText.includes('What would you like to name your swag collection?')`);
    await send(collectionName); await send('Yes');
    await poll(`document.querySelectorAll('.sm-swag-product-add').length===4`);
    for(const product of products.slice(0,selectedCount)){
      await evaluate(`document.querySelector('[aria-label=${JSON.stringify('Add '+product.name)}]').click()`);
      await poll(`!!document.querySelector('[aria-label=${JSON.stringify('Remove '+product.name)}][aria-pressed=true]')`);
    }
    await click('Continue', `document.querySelector('.sm-swag-interaction')`);
    await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
    await call('Page.setInterceptFileChooserDialog',{enabled:true});
    await evaluate(`document.querySelector('[aria-label="Add attachment"]').click()`);
    await poll(`!!Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork'))`);
    await evaluate(`Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork')).click()`);
    async function attach(file) {
      const documentRoot=await call('DOM.getDocument');
      const fileInput=await call('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector:'#copilot-attach-swag_artwork'});
      await call('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[file]});
    }
    if (process.env.SWAG_LOGO_FLOW_CHECK) {
      await attach(invalidPath);
      await poll(`document.body.innerText.includes('Swag artwork must be a PNG')`);
      expect(requests.filter(request=>request.path.endsWith('/copilot/attachments'))).toHaveLength(0);
      const beforeUpload=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id});
      let releaseUpload;
      holdUpload=new Promise(resolve=>{releaseUpload=resolve;});
      try {
        await attach(logoPath);
        await poll(`!!document.querySelector('.sm-copilot-logo-draft [aria-label="Uploading"]') && document.querySelector('[aria-label="Send message"]').disabled`);
        expect(await evaluate(`document.getElementById('copilot-input').placeholder`)).toBe('Ask ShelfMerch Copilot…');
        await evaluate(`document.querySelector('[aria-label="New chat"]').click()`);
        await poll(`!document.querySelector('.sm-copilot-logo-draft, [data-swag-step=artwork]')`);
      } finally { releaseUpload(); holdUpload=undefined; }
      await vi.waitFor(()=>expect(requests.filter(request=>request.path.includes('/copilot/attachments/') && request.method==='DELETE')).toHaveLength(1),{timeout:10000});
      await evaluate(`document.querySelector('[data-conversation-id="${beforeUpload._id}"]').click()`);
      await poll(`!!document.querySelector('[data-swag-step=artwork]') && !document.querySelector('.sm-copilot-logo-draft')`);
      const afterUpload=await CopilotConversation.findById(beforeUpload._id);
      expect(afterUpload.swag.revision).toBe(beforeUpload.swag.revision);
      checks.push('invalid file rejected, delayed upload leaves composer healthy, switching conversations discards the original unsent draft');
    }
    await attach(logoPath);
    await poll(`!!document.querySelector('.sm-copilot-composer .sm-copilot-logo-draft img') && !!document.querySelector('[aria-label="Send message"]:not(:disabled)')`);
    expect(await evaluate(`document.querySelectorAll('.sm-copilot-sent-logo').length`)).toBe(0);
    await capture('00-logo-composer-desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    await capture('00-logo-composer-mobile');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('[aria-label="Remove company-logo.png"]').click()`);
    await poll(`!document.querySelector('.sm-copilot-logo-draft') && !!document.querySelector('[data-swag-step=artwork]')`);
    await attach(logoPath);
    await poll(`!!document.querySelector('.sm-copilot-logo-draft img') && !!document.querySelector('[aria-label="Send message"]:not(:disabled)')`);
    const uploadsBeforeSend=requests.filter(request=>request.path.endsWith('/copilot/attachments') && request.method==='POST').length;
    const logoText = process.env.SWAG_LOGO_FLOW_CHECK ? '' : 'Use this company logo';
    await send(logoText, true);
    await poll(`!!document.querySelector('[data-swag-step=design]')`);
    await poll(`document.body.innerText.includes("I've received your logo. Would you like me to apply it to your selected products?")`);
    await poll(`document.querySelector('.sm-copilot-sent-logo img')?.naturalWidth > 0`);
    expect(await evaluate(`document.querySelector('[data-swag-step=design]').querySelectorAll('button').length`)).toBe(0);
    const sentLogoPresentation = `(() => { const body=document.querySelector('.sm-copilot-sent-logo').closest('.sm-copilot-message__body');
      return { background:getComputedStyle(body).backgroundColor, text:body.innerText.trim(), caption:!!body.querySelector('figcaption'), draft:!!document.querySelector('.sm-copilot-logo-draft, .sm-swag-logo') }; })()`;
    const expectedSentLogo = { background: 'rgba(0, 0, 0, 0)', text: logoText, caption: false, draft: false };
    expect(await evaluate(sentLogoPresentation)).toEqual(expectedSentLogo);
    expect(await evaluate(`document.querySelector('[data-swag-step=design]').innerText.includes('More design options')`)).toBe(false);
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
    expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(0);
    checks.push('composer shows actual PNG on desktop and mobile; sent image has no colored wrapper or filename; one acknowledgement');
    await capture('01-logo-received-desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    await capture('02-logo-received-mobile');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const current=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id});
    expect(current.messages.filter(message=>message.role==='user' && message.attachments?.length)).toHaveLength(1);
    expect(current.messages.filter(message=>message.role==='assistant' && message.content?.includes("I've received your logo.")).length).toBe(1);
    expect(requests.filter(request=>request.path.endsWith('/copilot/attachments') && request.method==='POST')).toHaveLength(uploadsBeforeSend);
    await evaluate('window.location.reload()'); await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await poll(`document.querySelector('.sm-copilot-sent-logo img')?.naturalWidth > 0 && document.body.innerText.includes("I've received your logo.")`);
    expect(await evaluate(sentLogoPresentation)).toEqual(expectedSentLogo);
    await send('Yes.');
    await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled)`);
    await capture('03-apply-confirmation');
    const preparedApply = await CopilotConversation.findById(current._id).lean();
    const originalApply = preparedApply.messages.findLast(message => message.artifacts.some(a => a.kind === 'confirmation' && a.request?.action === 'apply'));
    const applyApproval = originalApply.artifacts.find(a => a.kind === 'confirmation' && a.request?.action === 'apply');
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
    expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id,status:'pending',operation:'swag.collection'})).toBe(1);
    await evaluate('window.location.reload()');await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await poll(`Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled).length===1`);
    await poll(`document.querySelector('.sm-copilot-sent-logo img')?.naturalWidth > 0`);
    await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled);b.click();b.click();})()`);
    await poll(`document.body.innerText.includes('Do these designs look good? Would you like to publish them or make changes?')`);
    await poll(`document.querySelectorAll('.sm-swag-previews img').length===${selectedCount} && Array.from(document.querySelectorAll('.sm-swag-previews img')).every(image=>image.naturalWidth>0)`);
    const applied=await Collection.findOne({tenantId:tenant._id});
    expect(applied.productRefs).toHaveLength(selectedCount);
    const mockups=applied.productRefs.map(ref=>ref.mockupUrl);
    expect(mockups.every(Boolean)).toBe(true);
    const displayed=await evaluate(`Array.from(document.querySelectorAll('.sm-swag-previews img')).map(img=>img.getAttribute('src'))`);
    expect(displayed).toEqual(mockups);
    expect(displayed.every(url=>!productImages.includes(url))).toBe(true);
    expect(new Set(displayed).size).toBe(selectedCount);
    expect(await evaluate(`document.querySelector('[data-swag-step=design]').querySelectorAll('button').length`)).toBe(0);
    expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(1);
    const artworkCompletion = `Your logo has been applied to ${selectedCount} products.`;
    expect(await evaluate(`document.body.innerText.split(${JSON.stringify(artworkCompletion)}).length - 1`)).toBe(1);
    expect(await evaluate(`!document.body.innerText.includes('Earlier approval completed') && !document.querySelector('.sm-swag-completed-approval')`)).toBe(true);
    await capture('04-saved-branded-mockups');
    checks.push(`typed Yes prepares only; one authorized click executes; real sandboxed renderer saves ${selectedCount} product-specific branded mockups`);
    if (process.env.SWAG_LOGO_FLOW_CHECK) {
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
      await capture('04-saved-branded-mockups-mobile');
      await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate('window.location.reload()');
      await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
      await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
      await poll(`document.querySelectorAll('.sm-swag-previews img').length===2 && document.querySelector('.sm-copilot-sent-logo img')?.naturalWidth>0`);
      expect(requests.filter(request=>request.path.endsWith('/execute'))).toHaveLength(1);
      await capture('05-reloaded-mockups');
      await writeFile(path.join(output, 'logo-flow-evidence.json'), JSON.stringify({ mockups, displayed, executeRequests: 1, provider: 'mocked', checks, errors }, null, 2));
      expect(errors).toEqual([]);
      return;
    }
    await send('Looks good.');
    await poll(`document.body.innerText.includes('Would you like to publish the entire collection or only a selected product?')`);
    await capture('05-publishing-choice');
    await send('Publish only the polo.');
    await poll(`document.body.innerText.includes('separate one-product collection')`);
    expect((await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id})).swag.productIds).toHaveLength(selectedCount);
    expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id,status:'pending',operation:'swag.collection'})).toBe(0);
    await capture('06-single-product-guidance');
    await send('Publish the collection');
    await poll(`!!document.querySelector('[data-swag-step=stores]')`);
    await capture('07-store-options');
    await send('Publish my collection to AI Store.');
    await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm & Publish'&&!b.disabled)`);
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-swag-publish button')).filter(b=>b.textContent.trim()==='Confirm & Publish'&&!b.disabled).length`)).toBe(1);
    const prepared = await CopilotConversation.findById(current._id).lean();
    const approvalMessage = prepared.messages.findLast(message => message.artifacts.some(a => a.kind === 'confirmation' && a.request?.action === 'publish'));
    const approval = approvalMessage.artifacts.find(a => a.kind === 'confirmation' && a.request?.action === 'publish');
    await poll(`document.querySelectorAll('.sm-swag-publish__gallery img').length===${selectedCount}`);
    const reviewImages = await evaluate(`Array.from(document.querySelectorAll('.sm-swag-publish__gallery img')).map(img=>img.getAttribute('src'))`);
    expect(reviewImages).toEqual(mockups);
    if (publishCheck) {
      expect(await evaluate(`document.querySelector('.sm-swag-publish__warnings').innerText`)).toContain('Anti-Theft Laptop Backpack With Organizer is currently out of stock');
      expect(await evaluate(`document.querySelector('.sm-swag-publish__visibility').innerText`)).toContain(storeStatus === 'live' ? 'existing visibility rules' : 'is a draft store');
    }
    await capture('08-final-publication-confirmation');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    await evaluate(`document.querySelector('.sm-swag-publish').scrollIntoView({block:'center'})`);
    await capture('08-final-publication-mobile', false);
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    expect((await Shop.findOne({tenantId:tenant._id,_id:store._id})).activeListingKeys).toHaveLength(0);
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(1);
    let releasePublication;
    holdPublish = new Promise(resolve => { releasePublication = resolve; });
    const success = storeStatus === 'live' ? `Your ${collectionName} collection has been published to AI Store successfully.` : `Your ${collectionName} collection has been added to AI Store.`;
    try {
      await evaluate(`(()=>{window.originalMessage=document.querySelector('.sm-copilot-messages article');const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirm & Publish'&&!b.disabled);b.focus();b.click();b.click();})()`);
      await poll(`!!document.querySelector('.sm-swag-publish[aria-busy=true]')`);
      expect(await evaluate(`Array.from(document.querySelectorAll('.sm-swag-publish button')).every(button=>button.disabled)`)).toBe(true);
      await capture('09-publishing-pending');
    } finally { releasePublication(); }
    await poll(`document.body.innerText.includes(${JSON.stringify(success)})`);
    const published=await Shop.findOne({tenantId:tenant._id,_id:store._id});
    expect(published.activeListingKeys).toHaveLength(selectedCount);expect(published.status).toBe(storeStatus);
    expect((await Collection.findOne({tenantId:tenant._id})).productRefs.map(ref=>ref.mockupUrl)).toEqual(mockups);
    expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(2);
    expect(await evaluate(`window.originalMessage===document.querySelector('.sm-copilot-messages article')`)).toBe(true);
    expect(await evaluate(`!document.body.innerText.includes('Earlier approval completed') && !document.querySelector('.sm-swag-completed-approval')`)).toBe(true);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-publication-result').length`)).toBe(1);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-publication-result img, .sm-swag-publish__gallery').length`)).toBe(0);
    expect(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm & Publish')`)).toBe(false);
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-swag-publication-result a')).map(a=>a.getAttribute('href'))`)).toEqual(['/ai-test/swag', storeStatus === 'live' ? `${origin}/shop/${store._id}` : `/ai-test/shops/${store._id}`]);
    if (storeStatus === 'live') expect(requests.slice(requests.findLastIndex(request => request.path.endsWith('/execute')) + 1).some(request => request.path.endsWith('/resolve'))).toBe(true);
    await poll(`(()=>{const log=document.querySelector('.sm-copilot-messages');return log.scrollHeight-log.clientHeight-log.scrollTop<32;})()`);
    await capture('10-published-desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await capture('11-published-mobile');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    checks.push('one execution despite rapid clicks; committed success appears once at the bottom with verified links and no redundant completed review');
    await evaluate('window.location.reload()');await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await poll(`document.body.innerText.includes(${JSON.stringify(success)})`);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-publication-result').length === 1 && !document.querySelector('.sm-swag-completed-approval') && document.body.innerText.split(${JSON.stringify(artworkCompletion)}).length - 1 === 1`)).toBe(true);
    expect(await evaluate(`new Set(Array.from(document.querySelectorAll('.sm-swag-applied-previews figure'), figure=>figure.getBoundingClientRect().top)).size`)).toBe(1);
    const loaded=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id}).lean();
    const receipts=loaded.messages.filter(m=>m.uiEventId?.startsWith('swag:receipt:'));
    expect(receipts).toHaveLength(2);expect(new Set(receipts.map(m=>m.uiEventId)).size).toBe(2);
    expect(loaded.messages.indexOf(receipts[1])).toBeGreaterThan(loaded.messages.indexOf(receipts[0]));
    const storedApply = loaded.messages.find(message => message.uiEventId === originalApply.uiEventId);
    const storedApplyApproval = storedApply.artifacts.find(a => a.confirmationId === applyApproval.confirmationId);
    expect(storedApply.content).toBe(originalApply.content);
    expect(storedApplyApproval.request).toEqual(applyApproval.request);
    expect(storedApplyApproval.preview).toEqual(applyApproval.preview);
    expect(receipts[0].uiEventId).toBe(`swag:receipt:${applyApproval.confirmationId}`);
    const storedReview = loaded.messages.find(message => message.uiEventId === approvalMessage.uiEventId);
    const storedApproval = storedReview.artifacts.find(a => a.confirmationId === approval.confirmationId);
    expect(storedReview.content).toBe(approvalMessage.content);
    expect(storedApproval.request).toEqual(approval.request);
    expect(storedApproval.preview).toEqual(approval.preview);
    expect(receipts[1].uiEventId).toBe(`swag:receipt:${approval.confirmationId}`);
    expect(receipts[1].artifacts[0]).toMatchObject({ confirmationId: approval.confirmationId, status: 'completed', result: { action: 'publish', published: true, productCount: selectedCount } });
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message--assistant')).every(m=>m.querySelector('.sm-copilot-message__body').innerText.replace('ShelfMerch Copilot','').trim().length>0)`)).toBe(true);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-product-add:not(:disabled)').length`)).toBe(0);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);
    await capture('12-reloaded-mobile');
    expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(2);
    checks.push('reload recovers two distinct chronological receipts with original approval text, requests and preview data intact; no completed disclosures, blank assistant rows or replay');
    expect(errors).toEqual([]);
    await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({actualBrowser:'Microsoft Edge headless',widths:[1440,390],backend:'real controllers, MongoMemoryReplSet, local multipart upload and actual deterministic renderer',provider:'mocked; no live Claude calls',liveCustomerData:false,storeStatus,lostPublicationAcknowledgement:storeStatus === 'live',executeRequests:2,collections:1,listings:selectedCount,mockups,reviewImages,checks,errors},null,2));

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
