import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { ApiError } from '../../utils/errors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const directory = path.join(root, 'apps/api/renderer');
const profileRoot = path.resolve(os.tmpdir());
const unavailable = message => new ApiError(503, message, 'SWAG_RENDERER_UNAVAILABLE');
let active = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export const rendererConfigured = () => Boolean(process.env.SWAG_RENDERER_EXECUTABLE);
export async function rendererVersion() {
  if (!rendererConfigured()) throw unavailable('Automatic artwork is not configured. You can use the existing designer.');
  let manifest, bundle;
  try { [manifest, bundle] = await Promise.all([fs.readFile(path.join(directory, 'manifest.json'), 'utf8').then(JSON.parse), fs.readFile(path.join(directory, 'swag-renderer.js'))]); }
  catch { throw unavailable('Build the private Swag renderer before enabling automatic artwork.'); }
  const hash = crypto.createHash('sha256').update(bundle).digest('hex');
  if (manifest.bundleHash !== hash) throw unavailable('The Swag renderer bundle changed. Rebuild it before continuing.');
  // Development must not accidentally use an old build after editing the designer.
  if (process.env.NODE_ENV !== 'production') for (const [file, expected] of Object.entries(manifest.sources)) {
    if (crypto.createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex') !== expected) throw unavailable('Designer sources changed. Rebuild the private renderer.');
  }
  return { hash, bundle: bundle.toString('utf8') };
}

/** One bounded, API-owned browser job. No UI, customer session or remote URL. */
export async function withSwagRenderer(run, { signal } = {}) {
  const version = await rendererVersion();
  if (active) throw new ApiError(503, 'Artwork rendering is busy. Your saved design has not changed.', 'SWAG_RENDERER_BUSY');
  active = true;
  let child, socket, profile, deadline, exit, command, abort, diagnostics = '';
  const pending = new Map(); let sequence = 0, stopped = false;
  const close = error => { stopped = true; for (const row of pending.values()) { clearTimeout(row.timer); row.reject(error || unavailable('Renderer stopped')); } pending.clear(); };
  try {
    profile = await fs.mkdtemp(path.join(profileRoot, 'shelfmerch-render-'));
    child = spawn(process.env.SWAG_RENDERER_EXECUTABLE, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', bytes => { if (diagnostics.length < 4000) diagnostics += String(bytes).slice(0, 4000 - diagnostics.length); });
    child.once('error', error => { exit = error; close(error); });
    child.once('exit', () => { exit = unavailable('Renderer exited before completion'); close(exit); });
    deadline = setTimeout(() => { close(unavailable('Artwork rendering timed out')); child.kill(); }, 60_000);
    abort = () => { close(unavailable('Artwork rendering cancelled')); child.kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    let port;
    for (let i = 0; i < 300; i++) {
      if (exit || signal?.aborted) throw exit || unavailable('Rendering cancelled');
      try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(50); }
    }
    if (!port) { const error = unavailable('The configured browser could not start with its sandbox enabled.'); error.cause = new Error(diagnostics); throw error; }
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(3000) }).then(response => response.json());
    if (!target.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`)) throw unavailable('Invalid rendering connection');
    socket = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 40 * 1024 * 1024, perMessageDeflate: false });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      if (stopped || signal?.aborted) { reject(unavailable('Rendering stopped')); return; }
      const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(unavailable(`Renderer timeout: ${method}`)); }, 25_000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    command = call;
    socket.on('message', bytes => {
      const message = JSON.parse(String(bytes)), row = pending.get(message.id);
      if (row) { pending.delete(message.id); clearTimeout(row.timer); message.error ? row.reject(unavailable(message.error.message)) : row.resolve(message.result); }
      if (message.method === 'Fetch.requestPaused') void call('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    socket.on('error', close); socket.on('close', () => close());
    await call('Page.enable'); await call('Runtime.enable');
    // Data URLs are supplied as validated bytes, not fetched. Block every network
    // protocol, websocket and future navigation, even if the bundle regresses.
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'file://*', 'ftp://*', 'ws://*', 'wss://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: 'http://*' }, { urlPattern: 'https://*' }, { urlPattern: 'file://*' }] });
    await call('Runtime.evaluate', { expression: `let seed=7321; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};\n${version.bundle}` });
    const evaluate = async (operation, args) => {
      if (!['inspect', 'render'].includes(operation)) throw unavailable('Invalid renderer operation');
      const result = await call('Runtime.evaluate', { expression: `ShelfMerchSwagRenderer.${operation}(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new ApiError(422, 'The artwork could not be rendered. Your saved design has not changed.', 'SWAG_RENDER_FAILED');
      if (!result.result || !('value' in result.result)) throw unavailable('Renderer returned no result');
      return result.result.value;
    };
    const engine = await call('Browser.getVersion');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ bundle: version.hash,
      product: engine.product, javascript: engine.jsVersion, executable: path.resolve(process.env.SWAG_RENDERER_EXECUTABLE) })).digest('hex');
    return await run({ evaluate, version: fingerprint });
  } catch (error) {
    if (!error.cause && diagnostics) error.cause = new Error(diagnostics);
    throw error;
  } finally {
    clearTimeout(deadline); signal?.removeEventListener('abort', abort);
    if (command && !stopped) await Promise.race([command('Browser.close').catch(() => {}), delay(1000)]);
    close(); socket?.close(); child?.kill();
    if (child && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]);
    // This is only the exact, mkdtemp-created profile owned by this job.
    if (profile && path.dirname(profile) === profileRoot && path.basename(profile).startsWith('shelfmerch-render-')) {
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }).catch(() => {});
    }
    active = false;
  }
}
