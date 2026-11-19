import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { readStoredFile, uploadBuffer, LOCAL_UPLOAD_DIR } from '../../services/storage.service.js';
import { validateArtworkBytes } from '../../utils/artworkValidation.js';
import { withSwagRenderer, rendererVersion } from './swagRenderer.service.js';

const fail = message => { throw new ApiError(422, message, 'SWAG_ARTWORK_INVALID'); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export async function readArtwork(tenantId, attachment) {
  if (!attachment?.storageKey?.startsWith(`${tenantId}/`) || !attachment.storageDriver) fail('Upload your PNG logo again before applying it.');
  const bytes = await boundedBytes(await readStoredFile({ key: attachment.storageKey, driver: attachment.storageDriver }), 5 * 1024 * 1024);
  validateArtworkBytes(bytes);
  if (bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16_000_000) fail('This artwork is too large for automatic application. Use the designer.');
  return bytes;
}
async function boundedBytes(stream, maximum = 10 * 1024 * 1024) {
  const parts = []; let size = 0;
  for await (const part of stream) { const bytes = Buffer.from(part); size += bytes.length; if (size > maximum) fail('Image exceeds the permitted size.'); parts.push(bytes); }
  return Buffer.concat(parts);
}

/** Uses the same allowlist/redirect policy as the existing canvas proxy. */
export async function readProductImage(src) {
  if (src?.startsWith('/uploads/')) {
    const file = path.resolve(LOCAL_UPLOAD_DIR, src.slice(9)), relative = path.relative(LOCAL_UPLOAD_DIR, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes('\0')) fail('Invalid product image path.');
    const stat = await fs.stat(file); if (stat.size > 10 * 1024 * 1024) fail('Product image exceeds the permitted size.');
    return raster(await fs.readFile(file));
  }
  let url; try { url = new URL(src); } catch { fail('This product image needs the visual designer.'); }
  const bases = ['https://cdn.shopify.com/', 'https://cdn.shopifycdn.net/', env.S3_PUBLIC_BASE_URL,
    env.S3_BUCKET_NAME && env.AWS_REGION && `https://s3.${env.AWS_REGION}.amazonaws.com/${env.S3_BUCKET_NAME}/`,
    env.S3_BUCKET_NAME && env.AWS_REGION && `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/`,
    env.R2_ENDPOINT && env.R2_BUCKET && `${env.R2_ENDPOINT.replace(/\/$/, '')}/${env.R2_BUCKET}/`].filter(Boolean);
  const allowed = url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
    && (url.hostname.endsWith('.myshopify.com') && url.pathname.startsWith('/cdn/') || bases.some(base => {
      const target = new URL(base.endsWith('/') ? base : `${base}/`); return url.hostname === target.hostname && url.pathname.startsWith(target.pathname);
    }));
  if (!allowed) fail('This product image is not supported by automatic application. Use the designer.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers.get('content-type') || '')) fail('The product image could not be verified.');
  return raster(await boundedBytes(response.body));
}
function raster(bytes) {
  // Only raster bytes enter the browser. SVG/HTML/URLs cannot load external assets.
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 ? 'jpeg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!type) fail('The product image must be a supported raster image.');
  if (type === 'png' && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16_000_000) fail('The product image is too large.');
  return { bytes, type, hash: digest(bytes) };
}

// Explicit allowlist: no internal supplier/cost data enters the rendering process.
export function renderingProducts(products) {
  const fields = ['_id', 'name', 'brand', 'group', 'category', 'printAreas', 'physicalDimensions', 'dpi', 'primaryImageUrl', 'imageUrls',
    'maskImageUrl', 'baseImageUrl', 'maskBackImageUrl', 'baseBackImageUrl', 'maskLeftImageUrl', 'baseLeftImageUrl', 'maskRightImageUrl', 'baseRightImageUrl'];
  return products.map(product => Object.fromEntries(fields.filter(key => product[key] !== undefined).map(key => [key, product[key]])));
}
export async function prepareArtworkApplication({ tenantId, state, products, collection, attachment }) {
  const selected = new Set(state.artworkProductIds || state.productIds);
  if (!selected.size || [...selected].some(id => !state.productIds.includes(id))) fail('Choose at least one product from the current selection.');
  const requested = products.filter(product => selected.has(String(product._id))), preserved = [], candidates = [];
  for (const product of requested) {
    const saved = collection?.productRefs.find(ref => String(ref.catalogProductId) === String(product._id));
    if (saved && (saved.mockupUrl || saved.designOnlyImageUrl || saved.placements?.length) && state.replaceArtwork !== true) preserved.push({ productId: String(product._id), name: product.name });
    else candidates.push(product);
  }
  const bundle = await rendererVersion();
  const inspectedJob = candidates.length ? await withSwagRenderer(async renderer => ({ version: renderer.version,
    inspected: await renderer.evaluate('inspect', [renderingProducts(candidates)]) })) : { version: bundle.hash, inspected: [] };
  const { inspected, version } = inspectedJob;
  const artworkHash = digest(await readArtwork(tenantId, attachment)), targets = [], manual = [];
  for (const row of inspected) {
    if (!row.supported) { manual.push(row); continue; }
    // Bind mutable catalog URLs to actual approved source bytes, too.
    try { const image = await readProductImage(row.baseUrl); targets.push({ ...row, baseHash: image.hash }); }
    catch (error) { manual.push({ ...row, supported: false, reason: error.code === 'SWAG_ARTWORK_INVALID' ? error.message : 'The product image is unavailable. Use Edit in Designer.' }); }
  }
  return { version, artworkHash, targets, manual, preserved, replace: state.replaceArtwork === true,
    requestedProductIds: [...selected], requestedAll: selected.size === state.productIds.length };
}

/** All files are staged outside Mongo. A fenced transaction alone exposes refs. */
export async function stageArtworkApplication({ tenantId, state, products, collection, attachment, application, assertOwnership }) {
  await assertOwnership();
  const artwork = await readArtwork(tenantId, attachment);
  if (digest(artwork) !== application.artworkHash) fail('Your logo changed. Review it again before applying it.');
  const refs = new Map((collection?.productRefs || []).map(ref => [String(ref.catalogProductId), ref.toObject ? ref.toObject() : structuredClone(ref)]));
  await assertOwnership();
  const artworkUrl = (await uploadBuffer({ tenantId, kind: 'artwork', buffer: artwork, filename: 'approved-logo.png', contentType: 'image/png' })).url;
  await assertOwnership();
  await withSwagRenderer(async renderer => {
    if (renderer.version !== application.version) fail('The renderer changed. Review this artwork application again.');
    for (const target of application.targets) {
      await assertOwnership();
      const image = await readProductImage(target.baseUrl);
      if (image.hash !== target.baseHash) fail('The product image changed. Review this artwork application again.');
      const raw = renderingProducts([products.find(product => String(product._id) === target.productId)])[0];
      const result = await renderer.evaluate('render', [raw, `data:image/png;base64,${artwork.toString('base64')}`,
        { [target.baseUrl]: `data:image/${image.type};base64,${image.bytes.toString('base64')}` }]);
      if (result.target.areaKey !== target.areaKey || result.catalogProductId !== target.productId || !result.placements?.length) fail('The saved design could not be verified.');
      const store = async (data, kind) => {
        await assertOwnership();
        if (!/^data:image\/png;base64,/.test(data || '')) fail('The renderer returned an incomplete image.');
        const buffer = Buffer.from(data.split(',')[1], 'base64');
        if (buffer.length > 20 * 1024 * 1024 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 16_000_000) fail('Rendered image exceeds the permitted size.');
        return (await uploadBuffer({ tenantId, kind, buffer, filename: `${target.productId}.png`, contentType: 'image/png' })).url;
      };
      refs.set(target.productId, { catalogProductId: target.productId, name: raw.name, brand: raw.brand || '', group: raw.group || '', inheritArtwork: false,
        mockupUrl: await store(result.dataUrl, 'mockup'), mockupBackUrl: result.backDataUrl ? await store(result.backDataUrl, 'mockup') : '',
        designOnlyImageUrl: await store(result.designOnlyDataUrl, 'production'), printSpec: result.printSpec, placement: result.placement,
        placements: result.placements.map(({ artworkDataUrl: _source, ...placement }) => ({ ...placement, artworkUrl })) });
    }
  });
  const targets = new Set(application.targets.map(target => target.productId));
  const preservesLegacySharedArt = collection?.productRefs.some(ref => !targets.has(String(ref.catalogProductId))
    && state.productIds.includes(String(ref.catalogProductId)) && ref.inheritArtwork !== false && !ref.placements?.some(placement => placement.artworkUrl));
  return { artworkUrl, sharedArtworkUrl: preservesLegacySharedArt ? collection.artworkUrl || '' : artworkUrl,
    refs: products.map(product => refs.get(String(product._id)) || { catalogProductId: product._id, name: product.name,
      brand: product.brand || '', group: product.group || '', inheritArtwork: false }) };
}
