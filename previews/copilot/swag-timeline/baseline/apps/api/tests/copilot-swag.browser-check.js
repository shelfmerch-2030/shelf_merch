// Explicit local-browser verification; normal test discovery does not require Edge or Vite processes.
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
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

it('uses real Edge controls and real isolated backend services for the supported ai-test publishing lifecycle', async () => {
  await clearTestDb();
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: 'true', EMBEDDED_COPILOT_WRITE_COLLECTIONS: 'true', OPENAI_API_KEY: 'synthetic-provider-only', COPILOT_AI_PROVIDER: 'openai' });
  const tenant = await makeTenant({ slug: 'ai-test', name: 'Isolated browser workspace' });
  const account = await makeUser(tenant, 'company_admin');
  const hoodie = await CatalogProduct.create({ sku: 'BROWSER-HOODIE', name: 'Sustainable Classic Hoodie', category: 'Apparel', status: 'active', basePriceInr: 840, primaryImageUrl: '/synthetic-hoodie.png' });
  for (let i = 0; i < 7; i++) await CatalogProduct.create({ sku: `BROWSER-EXTRA-${i}`, name: `Winter Hoodie ${i}`, category: 'Apparel', status: 'active', basePriceInr: 500 + i });
  const store = await Shop.create({ tenantId: tenant._id, name: 'AI Store', slug: 'synthetic-browser-store', status: 'draft' });
  vi.mocked(streamOpenAiCompletion).mockImplementation(async ({ messages }) => {
    const last = messages.at(-1);
    const conversation = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id }).sort({ createdAt: -1 });
    if (last.role === 'user') return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'name', name: 'swag_configure',
      arguments: JSON.stringify({ revision: conversation.swag.revision, name: String(last.content).replace(/[.!]$/, '') }) }] };
    const result = JSON.parse(last.content);
    if (result.conversationId) return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'catalog', name: 'catalog_search', arguments: JSON.stringify({ query: 'Hoodie', category: 'Apparel' }) }] };
    return { text: 'Here are verified winter options. Select products or browse another category.', toolCalls: [], finishReason: 'stop', usage: {} };
  });
  const output = path.resolve('../../previews/copilot/swag-ux/legacy-browser'); await mkdir(output, { recursive: true });
  const api = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => api.once('listening', resolve));
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  const frontPort = await freePort(); const origin = `http://127.0.0.1:${frontPort}`;
  const viteLog = openSync(path.join(output, 'browser-vite.log'), 'w');
  const vite = spawn(process.execPath, [path.resolve('../../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], {
    cwd: path.resolve('../web'), windowsHide: true, stdio: ['ignore', viteLog, viteLog], env: { ...process.env, NODE_ENV: 'development', VITE_GTM_ID: '', VITE_USE_MOCKS: 'false' },
  });
  const profile = await mkdtemp(path.join(tmpdir(), 'shelfmerch-swag-browser-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, call, evaluate; const errors = []; const requests = []; const checks = [];
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
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request: browserRequest } = message.params;
      try {
        const url = new URL(browserRequest.url);
        if (url.origin === origin && url.pathname.startsWith('/api/')) {
          requests.push({ path: url.pathname, method: browserRequest.method });
          // Every API request is sent to our isolated replica-set app, never the developer Vite proxy.
          const response = await fetch(`${apiOrigin}${url.pathname}${url.search}`, { method: browserRequest.method,
            headers: { authorization: `Bearer ${account.token}`, ...(browserRequest.postData ? { 'content-type': 'application/json' } : {}) },
            ...(browserRequest.postData ? { body: browserRequest.postData } : {}) });
          await call('Fetch.fulfillRequest', { requestId, responseCode: response.status,
            responseHeaders: [{ name: 'Content-Type', value: response.headers.get('content-type') || 'application/json' }], body: Buffer.from(await response.arrayBuffer()).toString('base64') });
        } else if (url.origin === origin && url.pathname === '/synthetic-hoodie.png') {
          await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAD0lEQVR4nGP4jwYYSBcAAHg8P8FY7imoAAAAAElFTkSuQmCC' });
        } else if (url.origin === origin) await call('Fetch.continueRequest', { requestId });
        else if (url.protocol === 'data:') await call('Fetch.continueRequest', { requestId });
        else await call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      } catch (error) { errors.push(`API bridge: ${error.message}`); try { await call('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch {} }
    });
    await call('Page.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
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
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sm_access',${JSON.stringify(account.token)});localStorage.setItem('sm_user',${JSON.stringify(JSON.stringify({ id: String(account.user._id), tenantId: String(tenant._id), name: 'Browser admin', email: account.user.email, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] }))});localStorage.setItem('sm_workspace_slug','ai-test');localStorage.setItem('shelfmerch.consent',JSON.stringify({v:1,analytics:false,advertising:false}));` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `${origin}/ai-test/copilot` });
    await poll(`!!document.getElementById('copilot-input')`);
    await send('I want to design a swag.'); await poll(`document.body.innerText.includes('What would you like to name your swag collection?')`); checks.push('name-first');
    await send('Swag for winter'); await poll(`!!document.querySelector('[aria-label="Select Sustainable Classic Hoodie"]')`); checks.push('verified catalog card with select control');
    await send('Sustainable Classic Hoodie: add this'); await poll(`!!document.querySelector('[aria-label="Remove Sustainable Classic Hoodie"][aria-pressed="true"]')`); checks.push('natural-language exact-name selection');
    await evaluate(`document.querySelector('[aria-label="Remove Sustainable Classic Hoodie"][aria-pressed="true"]').click()`);
    await poll(`!!document.querySelector('[aria-label="Select Sustainable Classic Hoodie"]:not(:disabled)')`);
    await evaluate(`document.querySelector('[aria-label="Select Sustainable Classic Hoodie"]').click()`);
    await poll(`document.querySelector('.sm-swag-flow').innerText.includes('1 product selected')`); checks.push('deselect and select through backend');
    await click('Show more products'); await poll(`document.querySelectorAll('[aria-label^="Select Winter Hoodie"]').length===5`);
    await click('Show more products'); await poll(`document.querySelectorAll('[aria-label^="Select Winter Hoodie"]').length===7`); checks.push('catalog pagination');
    const current = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
    expect(current.swag.productIds).toEqual([String(hoodie._id)]);
    await evaluate(`window.location.reload()`); await poll(`!!document.querySelector('[data-conversation-id="${current._id}"]')`);
    await evaluate(`document.querySelector('[data-conversation-id="${current._id}"]').click()`);
    await poll(`!!document.querySelector('[aria-label="Remove Sustainable Classic Hoodie"][aria-pressed="true"]')`); checks.push('reload restores authoritative selection');
    await click('Continue', `document.querySelector('.sm-swag-flow')`); await poll(`!!document.querySelector('.sm-swag-flow')&&document.querySelector('.sm-swag-flow').innerText.includes('Upload logo')`);
    await click('Skip logo', `document.querySelector('.sm-swag-flow')`); await poll(`document.querySelector('.sm-swag-flow').innerText.includes('Save Design')`); checks.push('skip artwork without designer handoff');
    await click('Next', `document.querySelector('.sm-swag-flow')`); await poll(`!!document.querySelector('.sm-swag-flow input[type=checkbox]')`);
    await evaluate(`document.querySelector('.sm-swag-flow input[type=checkbox]').click()`); await poll(`document.querySelector('.sm-swag-flow input[type=checkbox]').checked && !document.querySelector('.sm-swag-flow input[type=checkbox]').disabled`);
    await click('Next', `document.querySelector('.sm-swag-flow')`); await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm & Publish')`);
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0); checks.push('one explicit publication preview, no collection before confirmation');
    await writeFile(path.join(output, 'browser-review.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirm & Publish'); b.click(); b.click();})()`);
    await poll(`document.body.innerText.includes('Your Swag for winter collection has been published to AI Store.')`); checks.push('committed publication and natural result');
    expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(1);
    const saved = await Collection.findOne({ tenantId: tenant._id }); expect(saved.productRefs.map(ref => String(ref.catalogProductId))).toEqual([String(hoodie._id)]);
    const published = await Shop.findOne({ tenantId: tenant._id, _id: store._id }); expect(published.activeListingKeys).toContain(`${saved._id}:${hoodie._id}`); expect(published.status).toBe('draft');
    expect(requests.filter(r => r.path.endsWith('/writes/swag.collection/execute'))).toHaveLength(1); checks.push('double-click submitted once, one collection/listing, draft store unchanged');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('.sm-copilot-confirm--success').scrollIntoView({block:'end'})`); await pause(200);
    expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await writeFile(path.join(output, 'browser-completed-mobile.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64')); checks.push('responsive mobile result');
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
      await writeFile(path.resolve('../../previews/copilot/swag-ux/legacy-browser-images.json'), JSON.stringify({ syntheticImages: true, actualBrowser: 'Microsoft Edge', results }, null, 2));
      await writeFile(path.resolve('../../previews/copilot/swag-ux/legacy-browser-images.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      checks.push('actual collection, saved design, management and Copilot components load all three saved mockup URLs; v2 replaces v1; storefront home resolver agrees');
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(output, 'browser-evidence.json'), JSON.stringify({ actualBrowser: 'Microsoft Edge headless', frontendRoute: '/ai-test/copilot',
      backend: 'real application controllers and services, MongoMemoryReplSet', provider: 'mocked (no external AI calls)', liveWorkspaceData: false,
      artworkBrowserPath: 'skip artwork; upload/editor covered separately by isolated regressions', checks, errors, totalCollections: 1, executeRequests: 1 }, null, 2));
  } catch (error) {
    if (process.env.SWAG_IMAGE_CHECK === 'true' && evaluate) await writeFile(path.resolve('../../previews/copilot/swag-ux/legacy-browser-images-failure.json'), JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('#mockup-browser-fixture img')).map(img=>({src:img.getAttribute('src'),width:img.naturalWidth,complete:img.complete}))`).catch(() => []), null, 2));
    await writeFile(path.join(output, 'browser-debug.json'), JSON.stringify({ checks, errors, requests, origin, cwd: process.cwd(), viteExitCode: vite.exitCode }, null, 2));
    if (evaluate) await writeFile(path.join(output, 'browser-failure.txt'), `${error.stack}\n${await evaluate('document.body.innerText').catch(() => '')}`);
    throw error;
  } finally {
    if (call) await call('Browser.close').catch(() => {}); socket?.close(); edge.kill(); vite.kill();
    closeSync(viteLog);
    await new Promise(resolve => api.close(resolve));
  }
}, 180000);
