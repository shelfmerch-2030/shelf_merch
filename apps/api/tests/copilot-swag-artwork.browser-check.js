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
import { Shop } from '../src/modules/shops/shop.model.js';
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

it('uploads a PNG in real Edge, applies it with the API-owned sandboxed renderer, reviews saved mockups and publishes after separate approval', async () => {
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
  const hoodie = await CatalogProduct.create({ sku: 'BROWSER-HOODIE', name: 'ActiveDry Polo', category: 'Apparel', status: 'active', basePriceInr: 840, primaryImageUrl: '/synthetic-hoodie.png', maskImageUrl: baseUrl, physicalDimensions: { width: 20, height: 24 }, printAreas: [{key:'front',label:'Front',xIn:7,yIn:6,widthIn:6,heightIn:6,dpi:300,methods:['dtf'],mockupImageUrl:baseUrl}] });
  for (let i = 0; i < 7; i++) await CatalogProduct.create({ sku: `BROWSER-EXTRA-${i}`, name: `Summer Polo ${i}`, category: 'Apparel', status: 'active', basePriceInr: 500 + i });
  const store = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'synthetic-browser-store', status: 'draft' });
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
  const output = path.resolve('../../previews/copilot/swag-timeline/browser'); await mkdir(output, { recursive: true });
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
    await send('I want to design swag.'); await poll(`document.body.innerText.includes('What would you like to name your swag collection?')`); checks.push('name-first'); await capture('01-start'); await capture('02-name-question');
    await send('Team Swag'); await poll(`document.body.innerText.includes('Would you like me to show you some products?')`);
    await capture('03-name-acknowledged');
    expect(await evaluate(`document.querySelectorAll('.sm-swag-product-add').length`)).toBe(0);
    await send('Yes'); await poll(`!!document.querySelector('[aria-label="Add ActiveDry Polo"]')`); checks.push('ordinary name acknowledged before explicit browsing'); await capture('04-products');
    expect(await evaluate(`document.querySelectorAll('.sm-swag-flow').length`)).toBe(0);
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message--assistant')).every(m=>m.querySelector('.sm-copilot-message__body').innerText.replace('ShelfMerch Copilot','').trim().length>0)`)).toBe(true);
    expect(await evaluate(`document.querySelectorAll('.sm-copilot-product--selectable').length`)).toBe(4);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-interaction input:not([type=checkbox])').length`)).toBe(0);
    await evaluate(`document.querySelector('.sm-copilot-products--swag').scrollIntoView({block:'center'})`);
    await writeFile(path.join(output,'products-desktop.png'), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await pause(150); await capture('products-mobile');
    expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await writeFile(path.join(output,'products-mobile.png'), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('ActiveDry Polo: add this'); await poll(`!!document.querySelector('[aria-label="Remove ActiveDry Polo"][aria-pressed="true"]')`); checks.push('natural-language exact-name selection');
    await evaluate(`document.querySelector('[aria-label="Remove ActiveDry Polo"][aria-pressed="true"]').click()`);
    await poll(`!!document.querySelector('[aria-label="Add ActiveDry Polo"]:not(:disabled)')`);
    await evaluate(`document.querySelector('[aria-label="Add ActiveDry Polo"]').focus()`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await poll(`document.querySelector('.sm-swag-interaction').innerText.includes('1 product added')`); checks.push('deselect and keyboard select through backend');
    await poll(`document.activeElement?.getAttribute('aria-label')==='Remove ActiveDry Polo'`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).contains(document.activeElement)`)).toBe(true);
    checks.push('keyboard focus retained after acknowledgement and Tab stays in current assistant interaction');
    await capture('05-products-added');
    await click('Explore more'); await poll(`document.querySelectorAll('[aria-label^="Add Summer Polo"]').length===4`); checks.push('catalog pagination');
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message')).slice(0,-1).every(m=>!m.querySelector('.sm-swag-product-add:not(:disabled)'))`)).toBe(true);
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message')).at(-1).querySelector('[data-swag-step=products]')!==null`)).toBe(true);
    await evaluate(`document.querySelector('.sm-copilot-messages').scrollTop=0`); await pause(150);
    await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-product__img')).at(-1).style.height='240px'`); await pause(150);
    expect(await evaluate(`document.querySelector('.sm-copilot-messages').scrollTop`)).toBe(0);
    await click('Latest message'); await poll(`document.querySelector('.sm-copilot-messages').scrollHeight-document.querySelector('.sm-copilot-messages').scrollTop-document.querySelector('.sm-copilot-messages').clientHeight<90`);
    checks.push('chronological assistant controls, older cards inactive, history scroll preserved through image resize, Latest message returns to bottom');
    const current = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
    expect(current.swag.productIds).toEqual([String(hoodie._id)]);
    await evaluate(`window.location.reload()`); await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await click('View selection'); await poll(`!!document.querySelector('[aria-label="Remove ActiveDry Polo from selection"]')`); checks.push('reload restores authoritative selection across catalog pages');
    await click('Continue with selected products', `document.querySelector('.sm-swag-interaction')`); await poll(`!!document.querySelector('.sm-swag-interaction')&&document.querySelector('.sm-swag-interaction').innerText.includes('Upload logo')`);
    await capture('06-upload-prompt');
    await call('Page.setInterceptFileChooserDialog', { enabled: true });
    await click('Upload logo', `document.querySelector('.sm-swag-interaction')`);
    const documentRoot = await call('DOM.getDocument');
    const fileInput = await call('DOM.querySelector', { nodeId: documentRoot.root.nodeId, selector: '#copilot-attach-swag_artwork' });
    await call('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [logoPath] });
    await poll(`!!document.querySelector('[data-swag-step=design]')`);
    await capture('07-logo-received');
    await click('Apply to all');
    await poll(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()==='Apply to All'&&!button.disabled)`);
    await capture('08-apply-approval');
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
    await evaluate('window.location.reload()');
    await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await poll(`Array.from(document.querySelectorAll('button')).filter(button=>button.textContent.trim()==='Apply to All'&&!button.disabled).length===1`);
    expect(await McpWriteConfirmation.countDocuments({ tenantId: tenant._id, status: 'pending', operation: 'swag.collection' })).toBe(1);
    await poll(`document.querySelectorAll('[alt="Uploaded logo, not yet applied"]').length===1`);
    checks.push('reload preserves one current uploaded-logo preview and one pending Apply review');
    await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Apply to All');button.click();button.click();})()`);
    await poll(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()==='Looks good'&&!button.disabled)`);
    const applied = await Collection.findOne({ tenantId: tenant._id });
    expect(applied.productRefs[0].mockupUrl).toBeTruthy(); expect(applied.productRefs[0].placements[0].key).toBe('front');
    expect(await readFile(path.join(LOCAL_UPLOAD_DIR, applied.artworkUrl.slice('/uploads/'.length)))).toEqual(await readFile(logoPath));
    await poll(`Array.from(document.querySelectorAll('.sm-swag-interaction img')).some(image=>image.getAttribute('src')===${JSON.stringify(applied.productRefs[0].mockupUrl)}&&image.complete&&image.naturalWidth===1000)`);
    expect(await evaluate(`document.querySelectorAll('.sm-swag-interaction [role=alert]').length`)).toBe(0);
    await writeFile(path.join(output,'browser-applied.png'), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await capture('09-saved-mockups');
    checks.push('real PNG file input and multipart upload, single Apply approval, actual backend browser rendering, persisted original logo and loaded saved mockup');
    await evaluate(`Array.from(document.querySelectorAll('.sm-swag-interaction details')).find(d=>d.querySelector('summary').textContent==='More design options').open=true`);
    await click('Save for later', `document.querySelector('.sm-swag-interaction')`); await click('Confirm & Save Design');
    await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Continue designing'&&!b.disabled)`);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
    await capture('13-saved-for-later');
    await evaluate('window.location.reload()'); await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await click('Continue designing'); await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Looks good'&&!b.disabled)`);
    expect(await evaluate(`document.body.innerText.includes('Team Swag')`)).toBe(true);
    await capture('14-resumed');
    checks.push('Save for Later compact receipt, reload and Continue designing preserve the collection and saved mockup');
    await send('Looks good. Publish it.'); await poll(`!!document.querySelector('.sm-swag-interaction input[type=checkbox]')`);
    await capture('10-stores');
    await send('AI Store');
    await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm & Publish')`);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1); checks.push('one separate final Publish approval; the already applied design is saved but not published');
    await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-confirm')).find(card=>Array.from(card.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm & Publish')).scrollIntoView({block:'center'})`); await pause(150);
    await writeFile(path.join(output, 'browser-review.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await capture('11-publish-approval');
    await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirm & Publish'); b.click(); b.click();})()`);
    await poll(`document.body.innerText.includes('Your Team Swag collection has been published to AI Store.')`); checks.push('committed publication and natural result'); await capture('12-published');
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
    const saved = await Collection.findOne({ tenantId: tenant._id }); expect(saved.productRefs.map(ref => String(ref.catalogProductId))).toEqual([String(hoodie._id)]);
    const published = await Shop.findOne({ tenantId: tenant._id, _id: store._id }); expect(published.activeListingKeys).toContain(`${saved._id}:${hoodie._id}`); expect(published.status).toBe('draft');
    expect(requests.filter(r => r.path.endsWith('/writes/swag.collection/execute'))).toHaveLength(3); checks.push('one Apply execute, one explicit Save for Later and one Publish execute despite double clicks; one collection/listing, draft store unchanged');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-confirm--success')).at(-1).scrollIntoView({block:'end'})`); await pause(200);
    expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await writeFile(path.join(output, 'browser-completed-mobile.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64')); checks.push('responsive mobile result'); await capture('15-mobile-conversation');
    if (process.env.SWAG_IMAGE_CHECK === 'true') {
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
      const fixturePath = `/@fs/${path.resolve('../../previews/copilot/swag-artwork/browser-fixture.tsx').replaceAll('\\', '/')}`;
      const results = [];
      for (const version of ['v1', 'v2']) {
        const result = await evaluate(`(async()=>{window.imageFixtureModule=await import(${JSON.stringify(fixturePath)});return window.imageFixtureModule.renderFixtures(${JSON.stringify(version)});})()`);
        await poll(`document.querySelectorAll('#mockup-browser-fixture img').length===12`);
        await evaluate(`document.querySelectorAll('#mockup-browser-fixture details').forEach(el=>el.open=true)`);
        await poll(`Array.from(document.querySelectorAll('#mockup-browser-fixture img')).filter(img=>img.getAttribute('src').includes('saved-fixture-')&&img.getAttribute('src').endsWith('-${version}')&&img.complete&&img.naturalWidth>0).length===12`);
        const images = await evaluate(`Array.from(document.querySelectorAll('#mockup-browser-fixture img')).map(img=>img.getAttribute('src'))`);
        expect(images).toHaveLength(12);
        expect(images.every(src => result.expected.includes(src))).toBe(true);
        expect(result.storefrontHome).toEqual(result.expected);
        results.push({ ...result, images });
      }
      await writeFile(path.resolve('../../previews/copilot/swag-artwork/browser-images.json'), JSON.stringify({ syntheticImages: true, actualBrowser: 'Microsoft Edge', results }, null, 2));
      await writeFile(path.resolve('../../previews/copilot/swag-artwork/browser-images.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      checks.push('actual collection, saved design, management and Copilot components load all three saved mockup URLs; v2 replaces v1; storefront home resolver agrees');
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'browser-evidence.json'), JSON.stringify({ actualBrowser: 'Microsoft Edge headless', frontendRoute: '/ai-test/copilot',
      backend: 'real application controllers and services, MongoMemoryReplSet', provider: 'mocked (no external AI calls)', liveWorkspaceData: false,
      artworkBrowserPath: 'actual PNG file input, real multipart controller upload, real API-owned sandboxed Edge renderer, verified saved mockups, separate final Publish approval', checks, errors, totalCollections: 1, executeRequests: 3 }, null, 2));
  } catch (error) {
    if (process.env.SWAG_IMAGE_CHECK === 'true' && evaluate) await writeFile(path.resolve('../../previews/copilot/swag-artwork/browser-images-failure.json'), JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('#mockup-browser-fixture img')).map(img=>({src:img.getAttribute('src'),width:img.naturalWidth,complete:img.complete}))`).catch(() => []), null, 2));
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
