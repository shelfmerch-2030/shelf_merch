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
import { Category } from '../src/modules/catalog/category.model.js';
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

const checkSelectionGallery = Boolean(process.env.SWAG_SELECTION_GALLERY_CHECK);
const checkArtworkAcknowledgement = Boolean(process.env.SWAG_ARTWORK_ACK_CHECK);
const checkConversationSwitch = Boolean(process.env.COPILOT_CONVERSATION_SWITCH_CHECK);
const cardBaselinePath = process.env.SWAG_CARD_BASELINE_CSS;
const useSelectionPhotography = checkSelectionGallery || checkArtworkAcknowledgement || Boolean(cardBaselinePath);
it(checkConversationSwitch ? 'switches saved chats without replacing the Copilot frame or flashing its transcript in Edge'
  : cardBaselinePath ? 'compares catalog and Copilot card layouts while verifying in-place selection in Edge'
  : checkArtworkAcknowledgement ? 'acknowledges confirmed products inline before asking for a logo in Edge'
  : checkSelectionGallery ? 'shows confirmed catalog thumbnails in the expandable selection gallery in Edge'
  : process.env.SWAG_COMPOSER_CHECK ? 'keeps drafting available during product selection in Edge'
    : 'verifies upload refresh, virtual revision zero, delayed replies and rapid conversation switching in Edge', async () => {
  await clearTestDb();
  Object.assign(env, { EMBEDDED_COPILOT_ENABLED: 'true', EMBEDDED_COPILOT_WRITE_COLLECTIONS: 'true', OPENAI_API_KEY: 'synthetic-provider-only', COPILOT_AI_PROVIDER: 'openai' });
  const tenant = await makeTenant({ slug: 'ai-test', name: 'Isolated browser workspace' });
  const account = await makeUser(tenant, 'company_admin');
  if (cardBaselinePath) {
    const apparel = await Category.create({ name: 'Apparel', slug: 'apparel' });
    const shirts = await Category.create({ name: 'T-Shirts', slug: 't-shirts', parentId: apparel._id, depth: 1 });
    await Category.create({ name: 'Crew Neck', slug: 'crew-neck', parentId: shirts._id, depth: 2 });
  }
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const artworkFolder = await mkdtemp(path.join(LOCAL_UPLOAD_DIR, 'isolated-browser-auto-'));
  const logoPath = path.join(artworkFolder, 'company-logo.png');
  await writeFile(logoPath, png(64,32,[220,20,20,255]));
  await writeFile(path.join(artworkFolder,'base.png'), png(200,300,[235,235,235,255]));
  const baseUrl = `/uploads/${path.basename(artworkFolder)}/base.png`;
  const products = [];
  const galleryPhotography = ['catalog/category-tiles/apparel/polo-shirts.png', 'mug.png', 'catalog/drinkware-editorial/mugs.png',
    'catalog/category-tiles/apparel/t-shirts.png', 'tote.png', 'hoodie.png'];
  const longProductName = 'Classic Crew Neck Organic Cotton T-Shirt With Reinforced Collar for Corporate Events';
  for (const [index,name] of ['Corporate Polo','Ceramic Mug',cardBaselinePath ? longProductName : 'Classic Profile Mug','Classic Crew Neck','Travel Tote','Zip Hoodie'].entries()) {
    const thumbnail = `selection-${index}.png`;
    if (useSelectionPhotography) await writeFile(path.join(artworkFolder, thumbnail), await readFile(path.resolve('../web/assets', cardBaselinePath && index === 2 ? galleryPhotography[3] : galleryPhotography[index])));
    products.push(await CatalogProduct.create({ sku: `POLISH-${index}`, name, category: useSelectionPhotography && name === 'Travel Tote' ? 'Bags' : 'Apparel', status: 'active', basePriceInr: 500+index*100,
      ...(cardBaselinePath ? { brand: 'ShelfMerch', variants: [{ sku: `OPTION-${index}`, size: 'M', stock: index === 2 ? 0 : 10 }],
        ...([2, 3].includes(index) ? { subcategory: 'T-Shirts', childCategory: 'Crew Neck' } : {}) } : {}),
      primaryImageUrl: useSelectionPhotography ? `/uploads/${path.basename(artworkFolder)}/${thumbnail}` : baseUrl, maskImageUrl: baseUrl, physicalDimensions: { width: 20, height: 24 },
      printAreas: [{key:'front',label:'Front',xIn:7,yIn:6,widthIn:6,heightIn:6,dpi:300,methods:['dtf'],mockupImageUrl:baseUrl}] }));
  }
  const store = await Shop.create({tenantId:tenant._id,name:'AI Store',slug:'isolated-post-logo-store',status:'draft'});
  const slowRequests=[];
  vi.mocked(streamOpenAiCompletion).mockImplementation(async ({messages})=>{
    const last=messages.at(-1);
    const conversation=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id}).sort({createdAt:-1});
    const answer=text=>({text,toolCalls:[],finishReason:'stop',usage:{}});
    const configure=args=>({text:'',finishReason:'tool_calls',usage:{},toolCalls:[{id:`fixture-${Date.now()}`,name:'swag_configure',arguments:JSON.stringify(args)}]});
    if(last.role==='user'&&/^Slow /i.test(last.content)){
      let release;const gate=new Promise(resolve=>{release=resolve;});slowRequests.push({content:last.content,release});await gate;
      return answer(last.content.startsWith('Slow refresh')?'Obsolete pre-refresh response':'Late original conversation response');
    }
    if(last.role==='user'&&last.content==='Tell me the current design status')return answer('Your logo is still uploaded. No artwork has been applied.');
    if (useSelectionPhotography && last.role === 'user' && last.content === 'Show me bags') {
      return { text: '', finishReason: 'tool_calls', usage: {}, toolCalls: [{ id: 'bags', name: 'catalog_search', arguments: '{"category":"Bags","limit":4}' }] };
    }
    if(last.role==='user'&&!conversation.swag&&/design.*swag/i.test(last.content))return configure({});
    if(last.role==='user')return configure({revision:conversation.swag?.revision||0,name:String(last.content).replace(/[.!]$/,'')});
    const result=JSON.parse(last.content);
    if(result.conversationId)return answer(result.name ? '' : 'What would you like to name your collection?');
    return answer('Here are verified product options.');
  });

  const output = path.resolve(process.env.SWAG_REVISION_BROWSER_OUTPUT || '../../previews/copilot/swag-revision/browser');
  await mkdir(output, { recursive: true });
  const api = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => api.once('listening', resolve));
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  const frontPort = await freePort(); const origin = `http://127.0.0.1:${frontPort}`;
  const viteLog = openSync(path.join(output, 'browser-vite.log'), 'w');
  const vite = spawn(process.execPath, [path.resolve('../../node_modules/vite/bin/vite.js'), '--config', path.resolve('../../previews/copilot/swag-auto/vite-artwork-browser.config.mjs'), '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], {
    cwd: path.resolve('../web'), windowsHide: true, stdio: ['ignore', viteLog, viteLog], env: { ...process.env, NODE_ENV: 'development', VITE_GTM_ID: '', VITE_USE_MOCKS: 'false', SWAG_BROWSER_API_ORIGIN: apiOrigin },
  });
  const profile = await mkdtemp(path.join(tmpdir(), 'shelfmerch-swag-browser-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, call, evaluate, releaseSelection; let delaySelection = false, failSelection = false;
  let delayedConversationPath, releaseConversation;
  const selectionChecks = []; const errors = []; const requests = []; const responses = []; const checks = [];
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
          if (browserRequest.method === 'GET' && url.pathname === delayedConversationPath) {
            await new Promise(resolve => { releaseConversation = resolve; });
          }
          if (delaySelection && browserRequest.method === 'POST' && url.pathname.endsWith('/swag')) {
            delaySelection = false;
            await new Promise(resolve => { releaseSelection = resolve; });
            if (failSelection) {
              failSelection = false;
              await call('Fetch.fulfillRequest', { requestId, responseCode: 409,
                responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
                body: Buffer.from(JSON.stringify({ code: 'CONFIRMATION_STALE', message: 'Review the current design before trying again.' })).toString('base64') });
              return;
            }
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
    async function send(content) {
      await poll(`!!document.getElementById('copilot-input')&&!document.getElementById('copilot-input').disabled&&!document.getElementById('copilot-input').readOnly`);
      await evaluate(`(()=>{const el=document.getElementById('copilot-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(content)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await poll(`!!document.querySelector('[aria-label="Send message"]:not(:disabled)')`); await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
      await poll(`!document.querySelector('[aria-label="Sending message"]')`);
    }
    async function capture(name, bottom = true) {
      if (bottom) await evaluate(`document.querySelector('.sm-copilot-messages').scrollTop=document.querySelector('.sm-copilot-messages').scrollHeight`);
      await pause(150);
      await writeFile(path.join(output,`${name}.png`), Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sm_access',${JSON.stringify(account.token)});localStorage.setItem('sm_user',${JSON.stringify(JSON.stringify({ id: String(account.user._id), tenantId: String(tenant._id), name: 'Browser admin', email: account.user.email, role: 'company_admin', scopeType: 'tenant', assignedEntityIds: [] }))});localStorage.setItem('sm_workspace_slug','ai-test');localStorage.setItem('shelfmerch.consent',JSON.stringify({v:1,analytics:false,advertising:false}));` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__swagRevisionDocument=Date.now()+Math.random();' });
    if (cardBaselinePath) {
      await call('Page.navigate', { url: `${origin}/app/catalog/category/crew-neck` });
      await poll(`Array.from(document.querySelectorAll('h1,h2')).some(heading=>heading.textContent.trim()==='Crew Neck') && Array.from(document.querySelectorAll('.sm-cat-grid .catalog-product-card')).some(card=>card.textContent.includes('Classic Crew Neck'))`);
      await evaluate(`document.querySelector('.sm-cat-grid .catalog-product-card').scrollIntoView({block:'center'})`);
      await poll(`document.querySelector('.sm-cat-grid .catalog-product-card img')?.naturalWidth>0`);
      await capture('01-catalog-crew-neck-reference', false);
    }
    await call('Page.navigate', { url: `${origin}/ai-test/copilot` });
    await poll(`!!document.getElementById('copilot-input')`);
    const noConflicts=async()=>expect(await evaluate(`document.body.innerText.includes('while this reply was being prepared')`)).toBe(false);
    async function open(id){await poll(`!!document.querySelector('[data-conversation-id="${id}"]')`);await evaluate(`document.querySelector('[data-conversation-id="${id}"]').click()`);await poll(`!!document.getElementById('copilot-input')&&!document.getElementById('copilot-input').disabled&&!document.getElementById('copilot-input').readOnly`);}
    async function reloadPage(){const old=await evaluate('window.__swagRevisionDocument');await evaluate('window.location.reload()');await poll(`!!window.__swagRevisionDocument&&window.__swagRevisionDocument!==${JSON.stringify(old)}&&!!document.getElementById('copilot-input')`);}
    async function begin(content){await evaluate(`(()=>{const e=document.getElementById('copilot-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(content)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await poll(`!!document.querySelector('[aria-label="Send message"]:not(:disabled)')`);await evaluate(`document.querySelector('[aria-label="Send message"]').click()`);}
    if (checkConversationSwitch) {
      const owner = { tenantId: tenant._id, userId: account.user._id };
      const [first, slow, next] = await CopilotConversation.create([
        { ...owner, title: 'Current conversation', messages: [{ role: 'assistant', content: 'Current transcript stays visible.' }] },
        { ...owner, title: 'Slow conversation', messages: [{ role: 'assistant', content: 'Obsolete transcript.' }] },
        { ...owner, title: 'Next conversation', messages: [{ role: 'assistant', content: 'Next transcript is ready.' }] },
      ]);
      const select = id => evaluate(`document.querySelector('[data-conversation-id="${id}"]').click()`);
      await reloadPage();
      await open(String(first._id));
      await poll(`document.body.innerText.includes('Current transcript stays visible.')`);
      await evaluate(`void (window.switchProbe = { documentId:window.__swagRevisionDocument, frame:document.querySelector('.sm-copilot-page'), list:document.querySelector('.sm-copilot-history__list'), transcript:document.querySelector('.sm-copilot-transcript'), composer:document.getElementById('copilot-input') })`);
      delayedConversationPath = `/api/v1/copilot/conversations/${slow._id}`;
      await select(String(slow._id));
      await vi.waitFor(() => expect(releaseConversation).toBeTypeOf('function'));
      try {
        await poll(`document.querySelector('.sm-copilot-switch-status')?.innerText.includes('Opening conversation')`);
        expect(await evaluate(`window.switchProbe.transcript===document.querySelector('.sm-copilot-transcript') && window.switchProbe.transcript.innerText.includes('Current transcript stays visible.')`)).toBe(true);
        expect(await evaluate(`!document.querySelector('[data-conversation-id="${next._id}"]').disabled`)).toBe(true);
        await select(String(next._id));
        await poll(`document.body.innerText.includes('Next transcript is ready.')`);
      } finally { releaseConversation(); }
      await vi.waitFor(() => expect(responses).toContainEqual({ path: delayedConversationPath, status: 200 }));
      await pause(100);
      expect(await evaluate(`window.switchProbe.documentId===window.__swagRevisionDocument && window.switchProbe.frame===document.querySelector('.sm-copilot-page') && window.switchProbe.list===document.querySelector('.sm-copilot-history__list') && window.switchProbe.composer===document.getElementById('copilot-input') && document.body.innerText.includes('Next transcript is ready.') && !document.body.innerText.includes('Obsolete transcript.')`)).toBe(true);
      expect(errors).toEqual([]);
      return;
    }
    if (checkArtworkAcknowledgement) {
      const list = `document.querySelector('.sm-swag-artwork-selection')`;
      const logoQuestion = 'Would you like to add your company logo? You can upload it using the + button below, or continue without one.';
      async function add(name, count) {
        await poll(`!!document.querySelector(${JSON.stringify(`[aria-label="Add ${name}"]:not(:disabled)`)})`);
        await evaluate(`document.querySelector(${JSON.stringify(`[aria-label="Add ${name}"]`)}).click()`);
        await poll(`document.querySelector('.sm-swag-selected strong')?.textContent.trim() === '${count} product${count === 1 ? '' : 's'} selected'`);
      }
      await send('I want to design swag'); await send('Artwork acknowledgement'); await send('Yes');
      await add('Corporate Polo', 1); await add('Ceramic Mug', 2);
      await click('Explore more'); await add('Zip Hoodie', 3);
      await send('Show me bags'); await add('Travel Tote', 4);
      const requestStart = requests.length;
      const before = await evaluate(`(() => {
        const scroll = document.querySelector('.sm-copilot-messages');
        const footer = document.querySelector('.sm-swag-footer-continue');
        window.artworkCard = document.querySelector('[aria-label="Remove Travel Tote"]').closest('.sm-copilot-product--selectable');
        scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight - 125);
        footer.focus({ preventScroll: true });
        return { scroll: scroll.scrollTop, rows: document.querySelectorAll('.sm-copilot-message').length };
      })()`);
      await pause(75);
      await evaluate(`document.querySelector('.sm-swag-footer-continue').click()`);
      await poll(`!!${list}`);
      await pause(100);
      const transition = await evaluate(`({ cardRetained: window.artworkCard.isConnected, rows: document.querySelectorAll('.sm-copilot-message').length,
        scrollDelta: Math.abs(document.querySelector('.sm-copilot-messages').scrollTop - ${before.scroll}),
        inline: ${list}.parentElement.matches('.sm-copilot-bubble') && ${list}.nextElementSibling.innerText === ${JSON.stringify(logoQuestion)},
        matchingTypography: ['fontFamily', 'fontSize', 'lineHeight'].every(key => getComputedStyle(${list}.previousElementSibling)[key] === getComputedStyle(${list}.nextElementSibling)[key]),
        earlierCardsVisible: window.artworkCard.getBoundingClientRect().height > 0 && !window.artworkCard.closest('details') && !window.artworkCard.querySelector('.sm-swag-product-add'),
        fourSquareCards: Array.from(${list}.querySelectorAll('.sm-copilot-product--selectable')).filter(card => getComputedStyle(card).borderRadius === '0px' && card.querySelector('a').textContent === 'Details').length === 4,
        noButtons: !document.querySelector('[data-swag-step="artwork"] button') && !${list}.closest('article').querySelector('button') })`);
      expect(transition).toMatchObject({ cardRetained: true, rows: before.rows + 2, inline: true, matchingTypography: true, earlierCardsVisible: true, fourSquareCards: true, noButtons: true });
      expect(requests.slice(requestStart).filter(request => request.path.includes('/copilot/conversations/')).map(request => request.method)).toEqual(['POST']);
      await poll(`${list}.querySelectorAll('img').length === 4 && Array.from(${list}.querySelectorAll('img')).every(image => image.complete && image.naturalWidth > 0)`);
      const images = await evaluate(`Object.fromEntries(Array.from(${list}.querySelectorAll('img'), image => [image.alt, image.src.split('/').at(-1)]))`);
      expect(images).toEqual({ 'Corporate Polo': 'selection-0.png', 'Ceramic Mug': 'selection-1.png', 'Travel Tote': 'selection-4.png', 'Zip Hoodie': 'selection-5.png' });
      expect(await evaluate(`${list}.previousElementSibling.textContent`)).toBe("Great! You've selected 4 products for your collection.");
      expect(await evaluate(`${list}.innerText.includes('₹500 incl. GST')`)).toBe(true);
      const acknowledgeColumns = () => evaluate(`getComputedStyle(${list}.firstElementChild).gridTemplateColumns.split(' ').length`);
      expect(await acknowledgeColumns()).toBe(3);
      await evaluate(`${list}.closest('article').scrollIntoView({block:'start'})`);
      await capture('acknowledgement-desktop', false);
      await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      expect(await acknowledgeColumns()).toBe(2);
      expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      await evaluate(`${list}.closest('article').scrollIntoView({block:'start'})`);
      await capture('acknowledgement-mobile', false);
      const conversation = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
      await reloadPage(); await open(String(conversation._id));
      await poll(`!!${list} && ${list}.querySelectorAll('img').length === 4`);
      expect(await evaluate(`document.querySelectorAll('.sm-swag-artwork-selection').length`)).toBe(1);
      await capture('acknowledgement-reloaded');
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await call('Page.setInterceptFileChooserDialog', { enabled: true });
      await evaluate(`document.querySelector('[aria-label="Add attachment"]').click()`);
      await poll(`!!Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork'))`);
      await evaluate(`Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork')).click()`);
      const root = await call('DOM.getDocument');
      const input = await call('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#copilot-attach-swag_artwork' });
      await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [logoPath] });
      await send('');
      await poll(`!!document.querySelector('[data-swag-step=design]')`);
      await send('Yes'); await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled)`);
      expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
      expect(requests.filter(request => request.path.endsWith('/execute'))).toHaveLength(0);
      expect(errors).toEqual([]);
      await writeFile(path.join(output, 'artwork-acknowledgement-evidence.json'), JSON.stringify({ transition, images, reloadAcknowledgements: 1, logoUploaded: true, applyPrepared: true, errors }, null, 2));
      return;
    }
    if (checkSelectionGallery) {
      const summary = `document.querySelector('.sm-swag-selected')`;
      async function captureSelection(name) { await pause(100); await capture(name); }
      const count = value => poll(`${summary}?.querySelector('strong').textContent.trim() === '${value} product${value === 1 ? '' : 's'} selected'`);
      const clickLabel = label => evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}).click()`);
      async function add(label, total) { await clickLabel(`Add ${label}`); await count(total); }
      const toggle = () => evaluate(`${summary}.querySelector('.sm-swag-selected__toggle').click()`);
      const imageResults = () => evaluate(`Array.from(${summary}.querySelectorAll('img'), image => ({ name: image.alt, file: image.src.split('/').at(-1), loaded: image.complete && image.naturalWidth > 0 }))`);
      async function verifyImages() {
        await poll(`${summary}.querySelectorAll('img').length === 4 && Array.from(${summary}.querySelectorAll('img')).every(image => image.complete && image.naturalWidth > 0)`);
        const images = await imageResults();
        expect(Object.fromEntries(images.map(image => [image.name, image.file]))).toEqual({
          'Corporate Polo': 'selection-0.png', 'Ceramic Mug': 'selection-1.png', 'Travel Tote': 'selection-4.png', 'Zip Hoodie': 'selection-5.png',
        });
        return images;
      }
      await send('I want to design swag'); await send('Gallery check'); await send('Yes');
      await poll(`!!document.querySelector('[aria-label="Add Corporate Polo"]')`);
      await add('Corporate Polo', 1); await add('Ceramic Mug', 2);
      await click('Explore more'); await poll(`!!document.querySelector('[aria-label="Add Zip Hoodie"]')`);
      await add('Zip Hoodie', 3);
      await send('Show me bags'); await poll(`!!document.querySelector('[aria-label="Add Travel Tote"]')`);
      await add('Travel Tote', 4);
      expect(await evaluate(`${summary}.querySelector('.sm-swag-selected__items').hidden`)).toBe(true);
      await captureSelection('desktop-collapsed');
      const requestStart = requests.length;
      const beforeDisclosure = await evaluate(`(() => {
        window.galleryProbe = ${summary}.closest('.sm-copilot-products');
        const scroll = document.querySelector('.sm-copilot-messages');
        ${summary}.querySelector('.sm-swag-selected__toggle').focus({ preventScroll: true });
        return { top: scroll.scrollTop, messages: document.querySelectorAll('.sm-copilot-message').length };
      })()`);
      await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await poll(`${summary}.querySelector('.sm-swag-selected__toggle').getAttribute('aria-expanded') === 'true'`);
      const images = await verifyImages();
      expect(requests.slice(requestStart)).toHaveLength(0);
      expect(await evaluate(`window.galleryProbe === ${summary}.closest('.sm-copilot-products') && document.querySelectorAll('.sm-copilot-message').length === ${beforeDisclosure.messages}`)).toBe(true);
      const disclosureScrollDelta = await evaluate(`Math.abs(document.querySelector('.sm-copilot-messages').scrollTop - ${beforeDisclosure.top})`);
      expect(disclosureScrollDelta).toBeLessThanOrEqual(2);
      await captureSelection('desktop-expanded');
      const conversation = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
      await reloadPage(); await open(String(conversation._id)); await count(4);
      expect(await evaluate(`${summary}.querySelector('.sm-swag-selected__toggle').getAttribute('aria-expanded')`)).toBe('false');
      await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await captureSelection('mobile-collapsed');
      await toggle(); await verifyImages();
      expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      await captureSelection('mobile-expanded');
      await toggle();
      expect(await evaluate(`${summary}.querySelector('.sm-swag-selected__items').hidden`)).toBe(true);
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await toggle();
      delaySelection = true; failSelection = true;
      await clickLabel('Remove Corporate Polo from selection');
      await vi.waitFor(() => expect(releaseSelection).toBeTypeOf('function'));
      releaseSelection(); releaseSelection = undefined;
      await poll(`!!${summary}.querySelector('[role="alert"]') && !${summary}.querySelector('.sm-swag-selected__remove:disabled')`);
      await count(4);
      expect(await evaluate(`${summary}.querySelector('img[alt="Corporate Polo"]').isConnected`)).toBe(true);
      await evaluate(`(() => {
        window.galleryProbe = ${summary}.closest('.sm-copilot-products');
        window.cardProbe = window.galleryProbe.querySelector('.sm-copilot-product--selectable');
        window.scrollProbe = document.querySelector('.sm-copilot-messages');
        window.scrollProbe.scrollTop = Math.max(0, window.scrollProbe.scrollTop - 180);
        window.selectionStart = { scroll: window.scrollProbe.scrollTop, messages: document.querySelectorAll('.sm-copilot-message').length };
      })()`);
      const removalRequestStart = requests.length;
      delaySelection = true;
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await clickLabel('Remove Corporate Polo from selection');
      await vi.waitFor(() => expect(releaseSelection).toBeTypeOf('function'));
      await poll(`${summary}.querySelectorAll('button[aria-busy="true"]').length === 1`);
      await count(4);
      expect(await evaluate(`getComputedStyle(${summary}.querySelector('[aria-busy="true"] svg')).animationName`)).toBe('none');
      expect(await evaluate(`document.getElementById('copilot-input').placeholder.startsWith('Ask ShelfMerch') && !document.getElementById('copilot-input').disabled`)).toBe(true);
      await captureSelection('desktop-removal-pending');
      await evaluate(`window.scrollProbe.scrollTop = window.selectionStart.scroll`);
      releaseSelection(); releaseSelection = undefined;
      await count(3); await pause(100);
      const removal = await evaluate(`({ sameNodes: window.galleryProbe === ${summary}.closest('.sm-copilot-products') && window.cardProbe.isConnected,
        scrollDelta: Math.abs(window.selectionStart.scroll - window.scrollProbe.scrollTop), sameMessages: window.selectionStart.messages === document.querySelectorAll('.sm-copilot-message').length,
        expanded: ${summary}.querySelector('.sm-swag-selected__toggle').getAttribute('aria-expanded') === 'true' })`);
      expect(removal).toMatchObject({ sameNodes: true, sameMessages: true, expanded: true });
      expect(removal.scrollDelta).toBeLessThanOrEqual(2);
      expect(requests.slice(removalRequestStart).map(request => request.method)).toEqual(['POST']);
      await captureSelection('desktop-updated-count');
      for (const [index, name] of ['Ceramic Mug', 'Zip Hoodie', 'Travel Tote'].entries()) {
        await clickLabel(`Remove ${name} from selection`); await count(2 - index);
      }
      expect(await evaluate(`!${summary}.querySelector('.sm-swag-selected__toggle') && !${summary}.querySelector('.sm-swag-selected__items') && document.querySelector('.sm-swag-footer-continue').disabled`)).toBe(true);
      await captureSelection('desktop-empty');
      expect(errors).toEqual([]);
      await writeFile(path.join(output, 'selection-gallery-evidence.json'), JSON.stringify({ images, disclosureScrollDelta, removal, reloadCollapsed: true, failurePreservedSelection: true, errors }, null, 2));
      return;
    }
    if (process.env.SWAG_COMPOSER_CHECK) {
      const evidence = {};
      const snapshot = () => evaluate(`(() => {
        const input = document.getElementById('copilot-input');
        return { placeholder: input.placeholder, disabled: input.disabled, readOnly: input.readOnly, draft: input.value,
          unavailableBanner: document.body.innerText.includes('Chat is currently unavailable.'),
          sendDisabled: document.querySelector('[aria-label="Send message"]').disabled,
          continueDisabled: document.querySelector('.sm-swag-footer-continue')?.disabled ?? null };
      })()`);
      await send('I want to design swag'); await send('Composer check'); await send('Yes');
      await poll(`!!document.querySelector('[aria-label="Add Corporate Polo"]')`);
      await evaluate(`document.querySelector('[aria-label="Add Corporate Polo"]').click()`);
      await poll(`!!document.querySelector('.sm-swag-footer-continue:not(:disabled)')`);
      await evaluate(`(() => {
        const input = document.getElementById('copilot-input');
        window.composerPlaceholders = [input.placeholder];
        window.composerObserver = new MutationObserver(records => {
          window.composerPlaceholders.push(...records.map(record => record.oldValue), input.placeholder);
        });
        window.composerObserver.observe(input, { attributeFilter: ['placeholder'], attributeOldValue: true });
      })()`);
      async function holdSelection(label, fail = false) {
        delaySelection = true; failSelection = fail;
        await evaluate(`document.querySelector('[aria-label="${label}"]').click()`);
        await vi.waitFor(() => expect(releaseSelection).toBeTypeOf('function'));
        await poll(`!!document.querySelector('.sm-swag-product-add[aria-busy="true"]')`);
      }
      function resumeSelection() { releaseSelection(); releaseSelection = undefined; }
      const typeDraft = value => evaluate(`(() => {
          const input = document.getElementById('copilot-input');
          input.focus({ preventScroll: true });
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
      async function assertPending(key) {
        await typeDraft('Draft while selecting');
        evidence[key] = await snapshot();
        expect(evidence[key]).toMatchObject({ placeholder: 'Ask ShelfMerch Copilot…', disabled: false, readOnly: false, draft: 'Draft while selecting', unavailableBanner: false, sendDisabled: true, continueDisabled: true });
        const requestCount = requests.length;
        await evaluate(`document.getElementById('copilot-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
        expect(requests.slice(requestCount).filter(request => request.method === 'POST')).toHaveLength(0);
      }
      await holdSelection('Add Ceramic Mug'); await assertPending('pendingAdd'); resumeSelection();
      await poll(`!!document.querySelector('[aria-label="Remove Ceramic Mug"]') && !document.querySelector('.sm-swag-footer-continue').disabled`);
      evidence.acknowledgedAdd = await snapshot();
      expect(evidence.acknowledgedAdd).toMatchObject({ sendDisabled: false, continueDisabled: false, draft: 'Draft while selecting' });
      await holdSelection('Remove Ceramic Mug'); await assertPending('pendingRemove'); resumeSelection();
      await poll(`!!document.querySelector('[aria-label="Add Ceramic Mug"]') && !document.querySelector('.sm-swag-footer-continue').disabled`);
      evidence.acknowledgedRemove = await snapshot();
      expect(evidence.acknowledgedRemove).toMatchObject({ sendDisabled: false, continueDisabled: false, draft: 'Draft while selecting' });
      await holdSelection('Add Ceramic Mug', true); await assertPending('pendingFailedAdd'); resumeSelection();
      await poll(`!document.querySelector('.sm-swag-footer-continue').disabled && !document.querySelector('.sm-swag-product-add[aria-busy="true"]')`);
      expect(await evaluate(`!!document.querySelector('[aria-label="Add Ceramic Mug"]')`)).toBe(true);
      evidence.recoveredFailure = await snapshot();
      expect(evidence.recoveredFailure).toMatchObject({ sendDisabled: false, continueDisabled: false, draft: 'Draft while selecting' });
      evidence.healthyPlaceholders = await evaluate(`(() => { window.composerObserver.disconnect(); return window.composerPlaceholders; })()`);
      expect(evidence.healthyPlaceholders).toEqual(['Ask ShelfMerch Copilot…']);
      env.OPENAI_API_KEY = '';
      await reloadPage();
      await poll(`document.body.innerText.includes('Chat is currently unavailable.')`);
      await typeDraft('Draft while offline');
      evidence.providerUnavailable = await snapshot();
      expect(evidence.providerUnavailable).toMatchObject({ placeholder: 'Chat is currently unavailable', unavailableBanner: true, sendDisabled: true, draft: 'Draft while offline' });
      expect(errors).toEqual([]);
      await writeFile(path.join(output, 'composer-evidence.json'), JSON.stringify(evidence, null, 2));
      return;
    }
    const namedCopy = "I've named your collection Team Spirit Essentials. Would you like me to show you some products?";
    const assertBrowseTurn = async () => {
      const rows = await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message__body'), el => el.innerText)`);
      const index = rows.findIndex(row => row.trim() === 'Yes');
      expect(index).toBeGreaterThan(0);
      expect(rows.filter(row => row.trim() === 'Yes')).toHaveLength(1);
      expect(rows.filter(row => row.includes(namedCopy))).toHaveLength(1);
      expect(rows[index - 1]).toContain(namedCopy);
      expect(rows[index + 1]).toContain('Here are some products you can customize.');
    };
    async function selectInPlace(label, selected, count, { delayed = false, viewport } = {}) {
      const selector = `[aria-label="${label}"]`;
      await poll(`!!document.querySelector(${JSON.stringify(selector)})`);
      await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});
        const grid = button.closest('.sm-copilot-products--swag');
        const scroll = document.querySelector('.sm-copilot-messages');
        scroll.scrollTop = Math.max(0, scroll.scrollTop - 32);
        button.focus({ preventScroll: true });
        const disconnected = [];
        const nodes = [grid, ...grid.querySelectorAll('.sm-copilot-product--selectable')];
        const observer = new MutationObserver(records => records.forEach(record => record.removedNodes.forEach(node => {
          if (nodes.some(watched => node === watched || node.contains(watched))) disconnected.push(node);
        })));
        observer.observe(document.querySelector('.sm-copilot-transcript'), { childList: true, subtree: true });
        window.selectionProbe = { grid, button, nodes, disconnected, observer, scroll, top: scroll.scrollTop,
          peakDelta: 0, documentId: window.__swagRevisionDocument, messages: document.querySelectorAll('.sm-copilot-message').length };
        const probe = window.selectionProbe;
        probe.measureScroll = () => { probe.peakDelta = Math.max(probe.peakDelta, Math.abs(scroll.scrollTop - probe.top)); };
        scroll.addEventListener('scroll', probe.measureScroll);
      })()`);
      const requestStart = requests.length;
      delaySelection = delayed;
      await evaluate(`(() => { const button = window.selectionProbe.button; button.click(); ${delayed ? 'button.click();' : ''} })()`);
      if (delayed) {
        await vi.waitFor(() => expect(releaseSelection).toBeTypeOf('function'), { timeout: 10000 });
        await poll(`window.selectionProbe.button.matches('[aria-busy="true"]')`);
        expect(await evaluate(`window.selectionProbe.button.getAttribute('aria-pressed')`)).toBe(String(!selected));
        expect(await evaluate(`window.selectionProbe.grid.querySelectorAll('.sm-swag-product-add[aria-busy="true"]').length`)).toBe(1);
        expect(await evaluate(`window.selectionProbe.grid.querySelectorAll('.sm-swag-product-add:disabled').length`)).toBe(0);
        if (cardBaselinePath) expect(await evaluate(`document.querySelector('#copilot-input').placeholder`)).toBe('Ask ShelfMerch Copilot…');
        const previousCount = selected ? count - 1 : count + 1;
        expect(await evaluate(`window.selectionProbe.grid.querySelector('.sm-swag-selected strong').textContent`)).toBe(`${previousCount} product${previousCount === 1 ? '' : 's'} selected`);
        releaseSelection(); releaseSelection = undefined;
      }
      await poll(`window.selectionProbe.button.getAttribute('aria-pressed') === '${selected}' && !window.selectionProbe.button.hasAttribute('aria-busy')`);
      await pause(100);
      const result = await evaluate(`(() => {
        const probe = window.selectionProbe;
        probe.observer.disconnect();
        probe.measureScroll();
        probe.scroll.removeEventListener('scroll', probe.measureScroll);
        return { sameDocument: probe.documentId === window.__swagRevisionDocument,
          stableNodes: probe.nodes.every(node => node.isConnected) && probe.disconnected.length === 0,
          unchangedMessages: probe.messages === document.querySelectorAll('.sm-copilot-message').length,
          scrollDelta: Math.abs(probe.scroll.scrollTop - probe.top), peakScrollDelta: probe.peakDelta, scrollStart: probe.top,
          count: probe.grid.querySelector('.sm-swag-selected strong').textContent };
      })()`);
      expect(result).toMatchObject({ sameDocument: true, stableNodes: true, unchangedMessages: true, count: `${count} product${count === 1 ? '' : 's'} selected` });
      expect(result.peakScrollDelta).toBeLessThanOrEqual(3);
      const triggered = requests.slice(requestStart);
      expect(triggered.filter(request => request.method === 'POST' && request.path.endsWith('/swag'))).toHaveLength(1);
      expect(triggered.filter(request => request.method === 'GET' && /\/conversations\/[^/]+$/.test(request.path))).toHaveLength(0);
      selectionChecks.push({ viewport, label, delayed, ...result });
    }
    const cardEvidence = {};
    async function checkCards(viewport) {
      const activeGrid = `document.querySelector('.sm-copilot-products--swag:has(> .sm-swag-catalog-footer)')`;
      const probe = `(() => { const grid=${activeGrid}, card=grid.querySelector('[aria-label="Add Corporate Polo"]').closest('.sm-copilot-product--selectable'), photo=card.querySelector('.sm-copilot-product__img'), img=photo.querySelector('img');
        const name=card.querySelector('strong'), price=card.querySelector('.sm-swag-product-price'), action=card.querySelector('button');
        return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, width:card.offsetWidth, height:card.offsetHeight, radius:getComputedStyle(card).borderRadius, photoWidth:photo.offsetWidth, photoHeight:photo.offsetHeight,
          nameSize:parseFloat(getComputedStyle(name).fontSize), priceSize:parseFloat(getComputedStyle(price).fontSize), priceWeight:getComputedStyle(price).fontWeight,
          photoFit:getComputedStyle(img).objectFit, price:price.textContent, stock:card.querySelector('.sm-swag-product-availability').textContent,
          details:card.querySelector('a').getAttribute('href'), buttonHeight:action.offsetHeight, overflow:document.documentElement.scrollWidth>innerWidth}; })()`;
      await evaluate(`${activeGrid}.scrollIntoView({block:'start'})`);
      await poll(`${activeGrid}.querySelector('img')?.naturalWidth>0`);
      if (viewport === 'desktop') {
        const style = `document.querySelector('style[data-vite-dev-id$="/copilot.css"]')`;
        const current = await evaluate(`${style}.textContent`);
        const baseline = await readFile(cardBaselinePath, 'utf8');
        await evaluate(`${style}.textContent=${JSON.stringify(baseline)}`);
        cardEvidence.before = await evaluate(probe);
        await capture('02-copilot-before-desktop', false);
        await evaluate(`${style}.textContent=${JSON.stringify(current)}`);
        await evaluate(`${activeGrid}.scrollIntoView({block:'start'})`);
      }
      const metrics = await evaluate(probe);
      cardEvidence[viewport] = metrics;
      expect(metrics.columns).toBeGreaterThanOrEqual(viewport === 'desktop' ? 2 : 1);
      expect(metrics.columns).toBeLessThanOrEqual(viewport === 'desktop' ? 3 : 2);
      expect(metrics).toMatchObject({ photoFit: 'contain', price: '₹500 incl. GST', stock: 'In stock', details: `/ai-test/catalog/${products[0]._id}`, overflow: false });
      expect(metrics.radius).toBe('0px');
      expect(Math.abs(metrics.photoWidth * 4 / 5 - metrics.photoHeight)).toBeLessThanOrEqual(1);
      expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.nameSize).toBeGreaterThanOrEqual(14);
      expect(metrics.priceWeight).toBe('700');
      expect(await evaluate(`(() => { const card=Array.from(${activeGrid}.querySelectorAll('.sm-copilot-product--selectable')).find(card=>card.textContent.includes(${JSON.stringify(longProductName)})), name=card.querySelector('strong');
        return name.textContent===${JSON.stringify(longProductName)} && name.scrollHeight===name.clientHeight && name.clientHeight>parseFloat(getComputedStyle(name).lineHeight) && card.textContent.includes('Out of stock'); })()`)).toBe(true);
      await capture(`03-copilot-after-${viewport}`, false);
      if (viewport === 'mobile') {
        await call('Emulation.setDeviceMetricsOverride', { width:320, height:844, deviceScaleFactor:1, mobile:true });
        cardEvidence.narrowMobile = await evaluate(probe);
        expect(cardEvidence.narrowMobile).toMatchObject({ columns: 1, overflow: false });
        await call('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
        return;
      }
      expect(metrics.photoWidth).toBeGreaterThanOrEqual(cardEvidence.before.photoWidth);
      expect(metrics.priceSize).toBeGreaterThanOrEqual(cardEvidence.before.priceSize);
      if (metrics.width === cardEvidence.before.width) expect(metrics.height).toBeLessThan(cardEvidence.before.height);
      const card = `${activeGrid}.querySelector('.sm-copilot-product--selectable')`;
      const photo = `${card}.querySelector('img')`;
      const restingCard = await evaluate(`(() => { const style=getComputedStyle(${card}); return [style.borderColor, style.boxShadow]; })()`);
      const point = await evaluate(`(()=>{const r=${card}.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+35};})()`);
      await call('Input.dispatchMouseEvent', { type:'mouseMoved', ...point });
      await poll(`${card}.matches(':hover') && getComputedStyle(${photo}).transform === 'matrix(1.04, 0, 0, 1.04, 0, 0)'`);
      expect(await evaluate(`(() => { const style=getComputedStyle(${card}); return [style.borderColor, style.boxShadow]; })()`)).toEqual(restingCard);
      await capture('04-copilot-hovered', false);
      await evaluate(`${card}.querySelector('a').focus({preventScroll:true})`);
      await call('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
      await call('Input.dispatchKeyEvent', { type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
      expect(await evaluate(`document.activeElement.matches('.sm-swag-product-add:focus-visible') && getComputedStyle(document.activeElement).outlineStyle==='solid'`)).toBe(true);
      await call('Emulation.setEmulatedMedia', { features:[{ name:'prefers-reduced-motion', value:'reduce' }] });
      expect(await evaluate(`getComputedStyle(${card}).transitionDuration`)).toBe('0s');
      expect(await evaluate(`getComputedStyle(${photo}).transform`)).toBe('none');
      await call('Emulation.setEmulatedMedia', { features:[] });
      await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:5, y:5 });
    }
    async function nameAndBrowse(viewport) {
      await send('I want to design swag');
      await poll(`document.body.innerText.includes('What would you like to name your swag collection?')`);
      await send('Team Spirit Essentials');
      await poll(`document.body.innerText.includes(${JSON.stringify(namedCopy)})`);
      expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message__body')).find(row => row.innerText.includes(${JSON.stringify(namedCopy)})).querySelectorAll('button, input, select, textarea, form, [role="button"]').length`)).toBe(0);
      expect(await evaluate(`document.querySelectorAll('.sm-copilot-product--selectable').length`)).toBe(0);
      expect(await evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      await capture(`post-naming-${viewport}`);
      await send('Yes');
      await poll(`!!document.querySelector('[aria-label="Add Corporate Polo"]')`);
      await assertBrowseTurn();
      const footer = `document.querySelector('.sm-swag-catalog-footer')`;
      expect(await evaluate(`${footer}.querySelector('.sm-swag-footer-continue').disabled`)).toBe(true);
      expect(await evaluate(`${footer}.querySelector('.sm-swag-selected strong').textContent`)).toBe('0 products selected');
      if (cardBaselinePath) await checkCards(viewport);
      await selectInPlace('Add Corporate Polo', true, 1, { delayed: true, viewport });
      await poll(`!!document.querySelector('[aria-label="Remove Corporate Polo"][aria-pressed="true"]')`);
      const footerBounds = await evaluate(`(() => {
        const footer = ${footer}, [more, next] = footer.querySelectorAll('.sm-swag-footer-action');
        const grid = footer.parentElement.getBoundingClientRect(), bounds = footer.getBoundingClientRect();
        const left = more.getBoundingClientRect(), right = next.getBoundingClientRect();
        return { enabled: !next.disabled, moreHeight:left.height, continueHeight:right.height, edgeDelta:Math.max(Math.abs(left.left-grid.left),Math.abs(right.right-grid.right),Math.abs(bounds.width-grid.width)), overflow:right.right>innerWidth };
      })()`);
      expect(footerBounds).toMatchObject({ enabled: true, overflow: false });
      expect(footerBounds.moreHeight).toBe(footerBounds.continueHeight);
      expect(footerBounds.moreHeight).toBeGreaterThanOrEqual(viewport === 'mobile' ? 44 : 40);
      expect(footerBounds.edgeDelta).toBeLessThan(1);
      await capture(`product-footer-${viewport}`);
      if (cardBaselinePath) {
        await evaluate(`document.querySelector('[aria-label="Remove Corporate Polo"]').closest('.sm-copilot-product').scrollIntoView({block:'center'})`);
        await capture(`05-copilot-selected-${viewport}`, false);
        await click('View selection', footer);
        await poll(`!!${footer}.querySelector('.sm-swag-selected img')`);
        await click('Hide selection', footer);
      }
      if (viewport === 'desktop') {
        await evaluate(`${footer}.querySelector('.sm-swag-more').focus()`);
        await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        expect(await evaluate(`document.activeElement.matches('.sm-swag-footer-continue:focus-visible') && getComputedStyle(document.activeElement).outlineStyle === 'solid'`)).toBe(true);
        const more = await evaluate(`(() => { const button = ${footer}.querySelector('.sm-swag-more'), rect = button.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, background: getComputedStyle(button).backgroundColor }; })()`);
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: more.x, y: more.y });
        await poll(`getComputedStyle(${footer}.querySelector('.sm-swag-more')).backgroundColor !== ${JSON.stringify(more.background)}`);
        await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        expect(await evaluate(`getComputedStyle(${footer}.querySelector('.sm-swag-more')).transitionDuration`)).toBe('0s');
        await call('Emulation.setEmulatedMedia', { features: [] });
      }
      const catalogRequests = requests.filter(request => request.path.endsWith('/swag/catalog')).length;
      await click('Explore more', footer);
      await poll(`!!document.querySelector('[aria-label="Add Zip Hoodie"]')`);
      expect(requests.filter(request => request.path.endsWith('/swag/catalog'))).toHaveLength(catalogRequests + 1);
      expect(await evaluate(`${footer}.querySelector('.sm-swag-selected strong').textContent`)).toBe('1 product selected');
      expect(await evaluate(`!!${footer}.querySelector('.sm-swag-more')`)).toBe(false);
      expect(await evaluate(`document.querySelectorAll('[aria-label="Add Zip Hoodie"]').length`)).toBe(1);
      const rows = await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message__body'), el => el.innerText)`);
      const pageTurn = rows.findIndex(row => row.trim() === 'Show more products');
      expect(pageTurn).toBeGreaterThan(0);
      expect(rows.filter(row => row.trim() === 'Show more products')).toHaveLength(1);
      expect(rows[pageTurn + 1]).toContain('Zip Hoodie');
      await selectInPlace('Add Zip Hoodie', true, 2, { viewport });
      if (viewport === 'desktop') {
        const current = await CopilotConversation.findOne({ tenantId: tenant._id, userId: account.user._id });
        await reloadPage(); await open(String(current._id));
        await poll(`!!document.querySelector('[aria-label="Remove Zip Hoodie"][aria-pressed="true"]')`);
        expect(await evaluate(`${footer}.querySelector('.sm-swag-selected strong').textContent`)).toBe('2 products selected');
      }
      await selectInPlace('Remove Zip Hoodie', false, 1, { delayed: true, viewport });
      checks.push(`${viewport} aligned footer with one persisted pagination turn and retained selection`);
      await noConflicts();
    }
    await nameAndBrowse('desktop');
    if (cardBaselinePath) {
      await click('Continue', `document.querySelector('.sm-swag-catalog-footer')`);
      await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
      await evaluate(`document.querySelector('[aria-label="New chat"]').click()`);
      await call('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
      await nameAndBrowse('mobile');
      await click('Continue', `document.querySelector('.sm-swag-catalog-footer')`);
      await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
      expect(errors).toEqual([]);
      await writeFile(path.join(output,'product-card-evidence.json'), JSON.stringify({ cardEvidence, selectionChecks, checks, errors }, null, 2));
      return;
    }
    await send('Add Ceramic Mug');await poll(`document.querySelector('.sm-swag-selected strong')?.textContent.includes('2 products selected')`);
    await click('Continue',`document.querySelector('.sm-swag-interaction')`);await poll(`!!document.querySelector('[data-swag-step=artwork]')`);
    await call('Page.setInterceptFileChooserDialog',{enabled:true});await evaluate(`document.querySelector('[aria-label="Add attachment"]').click()`);
    await poll(`!!Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork'))`);
    await evaluate(`Array.from(document.querySelectorAll('[role=menuitem]')).find(b=>b.textContent.includes('Swag design artwork')).click()`);
    const root=await call('DOM.getDocument'),input=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#copilot-attach-swag_artwork'});
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[logoPath]});await send('');await poll(`!!document.querySelector('[data-swag-step=design]')`);
    await capture('01-upload-before-refresh');await noConflicts();
    const first=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id});const initialState=JSON.stringify(first.swag),firstId=String(first._id),initialEvents=first.messages.filter(m=>m.uiEventId?.startsWith('swag:state:')).map(m=>m.uiEventId);
    await reloadPage();await open(firstId);await poll(`!!document.querySelector('[data-swag-step=design]')`);await noConflicts();
    await assertBrowseTurn();
    checks.push('desktop naming has no controls; typed Yes shows cards once and conversation order survives reload');
    expect(await evaluate(`document.body.innerText.includes("I've received your logo.")`)).toBe(true);
    let reloaded=await CopilotConversation.findOne({_id:firstId,tenantId:tenant._id,userId:account.user._id});expect(JSON.stringify(reloaded.swag)).toBe(initialState);
    expect(reloaded.messages.filter(m=>m.uiEventId?.startsWith('swag:state:')).map(m=>m.uiEventId)).toEqual(initialEvents);
    await capture('02-reopened-upload');checks.push('card and natural-language selection, upload and immediate reload without state or step mutation');
    await send('Yes');await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled)`);await noConflicts();
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);const prepared=await McpWriteConfirmation.findOne({tenantId:tenant._id,operation:'swag.collection',status:'pending'});
    await reloadPage();await open(firstId);await poll(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Confirm Apply'&&!b.disabled)`);
    expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id,status:'pending'})).toBe(1);await capture('03-continued-existing-approval');
    await begin('Slow original explanation');await vi.waitFor(()=>expect(slowRequests).toHaveLength(1),{timeout:10000});
    await evaluate(`document.querySelector('[aria-label="New chat"]').click()`);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await nameAndBrowse('mobile');
    await click('Continue',`document.querySelector('.sm-swag-interaction')`);await poll(`!!document.querySelector('[data-swag-step=artwork]')`);await noConflicts();
    checks.push('mobile naming has no controls; typed Yes shows cards once, and product selection continues to artwork');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const second=await CopilotConversation.findOne({tenantId:tenant._id,userId:account.user._id,_id:{$ne:firstId}});
    expect(second.swag).toMatchObject({name:'Team Spirit Essentials',revision:6,artwork:null});expect(second.swag.artworkAttachmentId).toBeNull();
    slowRequests[0].release();await vi.waitFor(async()=>expect((await CopilotConversation.findOne({_id:firstId,tenantId:tenant._id})).messages.some(m=>m.content==='Late original conversation response')).toBe(true),{timeout:15000});
    await pause(150);expect(await evaluate(`document.body.innerText.includes('Late original conversation response')`)).toBe(false);await noConflicts();await capture('04-new-chat-during-old-response');
    checks.push('different conversation starts, names and continues while original response is pending; late response is stored only in its own history');
    await open(firstId);await poll(`document.body.innerText.includes('Late original conversation response')`);
    await begin('Slow refresh explanation');await vi.waitFor(()=>expect(slowRequests).toHaveLength(2),{timeout:10000});
    await reloadPage();await open(firstId);await poll(`!!document.getElementById('copilot-input')`);
    await send('Tell me the current design status');await poll(`document.body.innerText.includes('Your logo is still uploaded. No artwork has been applied.')`);
    slowRequests[1].release();await pause(500);await noConflicts();
    const finalFirst=await CopilotConversation.findOne({_id:firstId,tenantId:tenant._id});expect(JSON.stringify(finalFirst.swag)).toBe(initialState);
    expect(finalFirst.messages.some(m=>m.content==='Obsolete pre-refresh response')).toBe(false);
    expect(finalFirst.messages.at(-1).content).toBe('Your logo is still uploaded. No artwork has been applied.');
    const ids=finalFirst.messages.flatMap(m=>m.uiEventId?[m.uiEventId]:[]);expect(new Set(ids).size).toBe(ids.length);
    expect(finalFirst.messages.filter(m=>m.uiEventId?.startsWith('swag:state:')).map(m=>m.uiEventId)).toEqual(initialEvents);
    expect((await McpWriteConfirmation.findOne({tenantId:tenant._id,confirmationId:prepared.confirmationId})).status).toBe('pending');
    await capture('05-refresh-during-delayed-response');checks.push('refresh during a slow provider response; a newer post-refresh request supersedes old prose, with unchanged revision, attachment and single pending approval');
    await reloadPage();await open(firstId);await poll(`document.body.innerText.includes('Your logo is still uploaded. No artwork has been applied.')`);await noConflicts();
    expect(await evaluate(`Array.from(document.querySelectorAll('.sm-copilot-message--assistant')).every(m=>m.querySelector('.sm-copilot-message__body').innerText.replace('ShelfMerch Copilot','').trim().length>0)`)).toBe(true);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});expect(await evaluate('document.documentElement.scrollWidth<=window.innerWidth')).toBe(true);await capture('06-mobile-recovered-conversation');
    expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);expect(requests.filter(r=>r.path.endsWith('/execute'))).toHaveLength(0);expect(responses.filter(r=>r.status===409)).toEqual([]);expect(errors).toEqual([]);
    await writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({actualBrowser:'Microsoft Edge headless',widths:[1440,390],backend:'real controllers and MongoMemoryReplSet; local upload and actual renderer inspection',provider:'mocked with controlled delays',liveCustomerData:false,collections:0,executeRequests:0,conversationIds:[firstId,String(second._id)],firstRevision:finalFirst.swag.revision,secondRevision:second.swag.revision,pendingApprovals:1,selectionChecks,checks,errors},null,2));

  } catch (error) {
    await writeFile(path.join(output, 'browser-debug.json'), JSON.stringify({ checks, errors, requests, responses, origin, cwd: process.cwd(), viteExitCode: vite.exitCode }, null, 2));
    const pageText = evaluate ? await evaluate('document.body.innerText').catch(() => '') : '';
    await writeFile(path.join(output, 'browser-failure.txt'), `${error.stack}\n${pageText}`);
    throw error;
  } finally {
    releaseSelection?.();
    if (call) await call('Browser.close').catch(() => {}); socket?.close(); edge.kill(); vite.kill();
    closeSync(viteLog);
    await new Promise(resolve => api.close(resolve));
    if (path.dirname(artworkFolder) === LOCAL_UPLOAD_DIR) await rm(artworkFolder, { recursive: true, force: true });
    const tenantFolder = path.join(LOCAL_UPLOAD_DIR, String(tenant._id));
    if (path.dirname(tenantFolder) === LOCAL_UPLOAD_DIR) await rm(tenantFolder, { recursive: true, force: true });
  }
}, 180000);
