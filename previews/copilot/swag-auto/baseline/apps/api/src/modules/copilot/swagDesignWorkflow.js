import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { rolesForTenantArea } from '../../middleware/tenantAccess.middleware.js';
import { objectId } from '../users/users.validation.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { catalogProductMongoFilter, catalogProductEligibilityFilters, toCatalogProductDetail } from '../mcp/catalogRead.js';
import { Collection } from '../collections/collection.model.js';
import { isCollectionLinkedToAnyShop, isCollectionLinkedToShop } from '../collections/collectionQueries.js';
import { createCollectionDesign, updateCollectionDesign } from '../collections/collectionDesign.service.js';
import { Shop } from '../shops/shop.model.js';
import { publishCollectionToShop } from '../shops/shopCatalogSync.js';
import { listingKeysFromCollection } from '../shops/listingKeys.js';
import { loadMcpActor, prepareMcpWrite, executeMcpWrite } from '../mcp/mcpWriteSafety.js';
import { McpWriteConfirmation } from '../mcp/mcpWriteConfirmation.model.js';
import { McpWriteIdempotency } from '../mcp/mcpWriteIdempotency.model.js';
import { employeeReaderFromContext } from '../mcp/employeesRead.js';
import { CopilotConversation } from './copilotConversation.model.js';
import { CopilotAttachment } from './copilotAttachment.model.js';
import { searchCatalog, catalogSearchInputSchema } from '../mcp/catalogSearch.js';

const OPERATION = 'swag.collection';
const nameSchema = z.string().trim().min(1).max(160);
export const swagConfigureSchema = z.object({
  revision: z.number().int().nonnegative().optional(), reset: z.boolean().optional(),
  name: nameSchema.optional(), addProductIds: z.array(objectId).max(50).optional(),
  removeProductIds: z.array(objectId).max(50).optional(), collectionId: objectId.optional(),
  addProductNames: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  removeProductNames: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  productReference: z.string().trim().min(1).max(200).optional(),
  step: z.enum(['name', 'products', 'artwork', 'design', 'stores', 'review']).optional(),
  artwork: z.enum(['none', 'saved', 'upload']).optional(), artworkAttachmentId: objectId.optional(),
  shopIds: z.array(objectId).max(20).optional(), listSaved: z.boolean().optional(),
}).strict();
export const swagPrepareSchema = z.object({
  conversationId: objectId, revision: z.number().int().nonnegative(), action: z.enum(['save', 'publish']),
}).strict();
export const swagExecuteSchema = swagPrepareSchema.extend({
  confirmationId: z.string().min(20).max(200), idempotencyKey: z.string().min(8).max(200),
});

export const SWAG_RULES = 'Product selection accepts addProductNames/removeProductNames (exact names) or productReference for an unambiguous recent card. Never ask the user for an internal ID. Buttons and conversation share the same revision-checked selections. Use step name/products/artwork/design/stores/review for Next and Back; preserve other selections. Prefer six catalog results per page and preserve query/category filters on subsequent pages. Winter collections can browse real hoodie or jacket results; users can choose any category. For designing swag, start with swag_configure (empty input reads the current conversation selection). Ask for the collection name first, then use real catalog_search/catalog_get_product cards for product selection, then ask whether to upload artwork or continue without it. Do not ask all details at once. Persist each requested selection/name/removal using swag_configure with its current revision. This only saves conversational selections, not a Collection. Products are catalog families with all enabled variants, as in the dashboard; variant subsets are not persisted by the designer. Use the + attachment menu Swag design artwork for PNG uploads. Uploaded artwork is associated on Save Design but must be placed/baked in the existing visual editor before publishing; never claim it is applied. Use the returned editor link after saving, then load that saved collection again with swag_configure collectionId to verify its actual product-specific placements and mockups. Remove/replace individual placements using that editor, not invented chat placement APIs. Artwork none clears all design artwork at the next confirmed save/publish. Artwork saved keeps verified saved settings; new products need artwork applied in the editor if requested. Save for later uses swag_prepare_collection action save and NEVER publishes. For publish, resolve real stores using shops_list and set exact shopIds, then use swag_prepare_collection action publish for ONE final Confirm & Publish card. EXECUTE is UI-only. Never create a store implicitly. Completed outcomes supersede previews. Reply briefly and never revive completed confirmations on okay/reload. To start another collection explicitly use reset with the current revision.';

function fail(message, code = 'VALIDATION', status = 400) { throw new ApiError(status, message, code); }
function stale() { fail('The design changed. Review the current design and prepare again.', 'CONFIRMATION_STALE', 409); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function caller(ctx) {
  const { tenantId, user } = employeeReaderFromContext(ctx);
  if (!tenantId || !user?.userId) throw new ForbiddenError('Design access is required');
  return { tenantId, actorUserId: user.userId };
}
function authorize(actor, publish = false) {
  if (!rolesForTenantArea('swag', 'write').includes(actor.user.role)
    || (publish && !rolesForTenantArea('shops', 'write').includes(actor.user.role))) {
    throw new ForbiddenError('Collection design or publishing is not available for this role');
  }
}
async function conversationFor({ tenantId, actorUserId }, conversationId, session = null) {
  const doc = await CopilotConversation.findOne({ _id: conversationId, tenantId, userId: actorUserId, archivedAt: null }).session(session);
  if (!doc) throw new NotFoundError('Conversation not found');
  return doc;
}
function initial() { return { revision: 0, name: '', productIds: [], shopIds: [], artwork: null, collectionId: null, artworkAttachmentId: null }; }
const normalizedName = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
function needsDesigner(state, value) {
  if (state.artwork === 'upload') return true;
  const collection = value.collection;
  const hasArtwork = collection && (collection.artworkUrl || collection.productRefs.some(ref => ref.mockupUrl || ref.designOnlyImageUrl || ref.placements?.length));
  const savedIds = new Set((collection?.productRefs || []).map(ref => String(ref.catalogProductId)));
  return Boolean(state.artwork === 'saved' && hasArtwork && (!collection.productRefs.some(ref => ref.mockupUrl || ref.designOnlyImageUrl)
    || state.productIds.some(id => !savedIds.has(id))));
}
function savedDesignChanged(state, value) {
  return Boolean(state.artwork === 'saved' && value.collection && state.savedUpdatedAt && state.savedUpdatedAt !== value.collection.updatedAt.toISOString());
}
function recentProducts(conversation) {
  for (const message of [...conversation.messages].reverse()) {
    const products = (message.artifacts || []).filter(a => a.kind === 'product' && a.product?.id).map(a => a.product);
    if (products.length) return [...new Map(products.map(p => [String(p.id), p])).values()];
    if ((message.artifacts || []).some(a => ['kit', 'curation', 'wallet_balance', 'department_budgets'].includes(a.kind)
      || (['confirmation', 'success'].includes(a.kind) && a.operation !== 'swag.collection'))) return [];
  }
  return [];
}
async function resolveProductNames(names, conversation, selected = null) {
  const ids = [];
  for (const name of names || []) {
    let matches = (selected || recentProducts(conversation)).filter(p => normalizedName(p.name) === normalizedName(name));
    if (!matches.length && !selected) {
      const escaped = normalizedName(name).split(' ').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const candidates = await CatalogProduct.find({ $and: [{ name: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }, ...catalogProductEligibilityFilters()] }).select('_id name').limit(2).lean();
      matches = candidates.map(candidate => ({ id: String(candidate._id), name: candidate.name }));
    }
    if (!matches.length) fail(`I couldn't find an eligible product named "${name}". Browse the catalog or choose a product card.`, 'PRODUCT_UNAVAILABLE', 422);
    if (matches.length !== 1) fail(`More than one product matches "${name}". Select the intended catalog card or refine the product name.`, 'PRODUCT_AMBIGUOUS', 409);
    ids.push(String(matches[0].id));
  }
  return ids;
}
async function ownedCollection(tenantId, id, session = null) {
  if (!id) return null;
  const row = await Collection.findOne({ tenantId, _id: id, status: { $ne: 'archived' } }).session(session);
  if (!row) throw new NotFoundError('Collection not found');
  return row;
}
async function resources(context, state, session = null, allowUnavailable = false) {
  const products = [];
  const invalidStoreIds = [];
  for (const id of state.productIds) {
    const product = await CatalogProduct.findOne(catalogProductMongoFilter(id)).session(session).lean();
    if (!product && !allowUnavailable) fail('A selected catalog product is unavailable', 'PRODUCT_UNAVAILABLE', 422);
    products.push(product || { _id: id, name: 'Unavailable selected product', unavailable: true });
  }
  const stores = [];
  for (const id of state.shopIds) {
    const store = await Shop.findOne({ tenantId: context.tenantId, _id: id }).session(session);
    if (!store && !allowUnavailable) throw new NotFoundError('Store not found');
    if (store) stores.push(store); else invalidStoreIds.push(String(id));
  }
  const collection = await ownedCollection(context.tenantId, state.collectionId, session);
  let attachment = null;
  if (state.artwork === 'upload') {
    attachment = await CopilotAttachment.findOne({ _id: state.artworkAttachmentId, tenantId: context.tenantId,
      userId: context.actorUserId, conversationId: context.conversationId, kind: 'swag_artwork', status: 'uploaded',
      expiresAt: { $gt: new Date() } }).session(session);
    if (!attachment && !allowUnavailable) throw new ForbiddenError('Swag artwork is expired or inaccessible in this conversation');
  }
  return { products, stores, collection, attachment, invalidStoreIds };
}
function refsFor(state, resources) {
  const saved = new Map((resources.collection?.productRefs || []).map(ref => [String(ref.catalogProductId), ref.toObject()]));
  return resources.products.map(product => state.artwork === 'saved' && saved.has(String(product._id))
    ? saved.get(String(product._id)) : { catalogProductId: product._id, name: product.name, brand: product.brand || '', group: product.group || '' });
}
function snapshot(state, value) {
  return { state, products: value.products.map(p => ({ id: String(p._id), updatedAt: p.updatedAt,
    status: p.status, name: p.name, basePriceInr: p.basePriceInr, variants: p.variants })),
    stores: value.stores.map(s => ({ id: String(s._id), name: s.name, status: s.status, updatedAt: s.updatedAt, keys: s.activeListingKeys })),
    collection: value.collection?.toObject() || null, attachment: value.attachment?.toObject() || null };
}
function publicState(context, state, value) {
  const refs = refsFor(state, value);
  return { conversationId: String(context.conversationId), ...state, persisted: Boolean(value.collection),
    active: !state.lastOutcome?.published,
    step: state.step || (!state.name ? 'name' : 'products'),
    designReady: Boolean(state.productIds.length && state.artwork && !value.products.some(p => p.unavailable) && !needsDesigner(state, value) && !savedDesignChanged(state, value)),
    invalidProductIds: value.products.filter(p => p.unavailable).map(p => String(p._id)), invalidStoreIds: value.invalidStoreIds || [],
    hasUnsavedChanges: !value.collection || value.collection.name !== state.name
      || JSON.stringify(value.collection.productRefs.map(ref => String(ref.catalogProductId))) !== JSON.stringify(state.productIds)
      || state.artwork === 'upload' || (state.artwork === 'none' && Boolean(value.collection.artworkUrl || value.collection.productRefs.some(ref => ref.mockupUrl || ref.designOnlyImageUrl))),
    savedDesignChanged: savedDesignChanged(state, value),
    savedStatus: value.collection?.status || null, published: Boolean(value.collection && isCollectionLinkedToAnyShop(value.collection)),
    products: value.products.map(p => p.unavailable ? { id: String(p._id), name: p.name, eligible: false } : { ...toCatalogProductDetail(p), eligible: true }),
    stores: value.stores.map(s => ({ id: String(s._id), name: s.name, status: s.status })),
    artworkStatus: state.artwork === 'upload' ? value.attachment ? 'Uploaded; placement in the existing editor is required' : 'Artwork expired or inaccessible; replace it or skip artwork'
      : state.artwork === 'saved' ? 'Saved design references (review product-specific previews)' : 'No artwork selected',
    artworkName: value.attachment?.originalName || (value.collection?.artworkUrl ? 'Saved artwork' : null),
    artworkPreviewUrl: value.attachment?.fileUrl || (state.artwork === 'saved' ? value.collection?.artworkUrl : null) || null,
    designs: refs.map(ref => ({ productId: String(ref.catalogProductId), mockupUrl: ref.mockupUrl || '',
      mockupBackUrl: ref.mockupBackUrl || '', placements: ref.placements || [], placement: ref.placement || null })),
    ...(value.collection ? { editorPath: `/swag/new?edit=${value.collection._id}` } : {}),
    nextStep: !state.name ? 'name' : !state.productIds.length ? 'products' : !state.artwork ? 'artwork'
      : state.artwork === 'upload' ? 'save_then_editor' : !state.shopIds.length ? 'stores_or_save' : 'review',
    variantPolicy: 'All enabled catalog variants; subset selection is not supported by collection persistence',
  };
}

/** Only conversation metadata changes here. No collections, files or publications are created. */
export async function configureSwagForCaller(ctx, args) {
  const input = swagConfigureSchema.parse(args || {});
  const context = { ...caller(ctx), conversationId: ctx.copilotConversationId };
  const actor = await loadMcpActor(context); authorize(actor);
  const conversation = await conversationFor(context, context.conversationId);
  const current = conversation.swag || initial();
  const changes = Object.keys(input).some(key => !['revision', 'listSaved'].includes(key));
  let state = structuredClone(current);
  if (changes) {
    if (input.revision !== current.revision) stale();
    if (input.reset) state = { ...initial(), revision: current.revision };
    if (input.collectionId) {
      const saved = await ownedCollection(context.tenantId, input.collectionId);
      state = { ...state, name: saved.name, productIds: saved.productRefs.map(ref => String(ref.catalogProductId)),
        collectionId: String(saved._id), artwork: 'saved', artworkAttachmentId: null, savedUpdatedAt: saved.updatedAt.toISOString() };
    }
    if (input.name !== undefined) state.name = input.name;
    const namedIds = await resolveProductNames(input.addProductNames, conversation);
    if (input.productReference) {
      const words = normalizedName(input.productReference).replace(/\b(?:this|that|one|the|product)\b/g, '').trim().split(/\s+/).filter(Boolean);
      const matches = recentProducts(conversation).filter(p => words.every(word => normalizedName(p.name).includes(word)));
      if (matches.length !== 1) fail('Please select the intended product card or tell me its product name; more than one product could match.', 'PRODUCT_AMBIGUOUS', 409);
      namedIds.push(String(matches[0].id));
    }
    const removedIds = input.removeProductNames?.length ? await resolveProductNames(input.removeProductNames, conversation,
      (await CatalogProduct.find({ _id: { $in: state.productIds } }).select('_id name').lean()).map(p => ({ id: String(p._id), name: p.name }))) : [];
    if (namedIds.length) state.productIds = [...new Set([...state.productIds, ...namedIds])];
    if (input.addProductIds) state.productIds = [...new Set([...state.productIds, ...input.addProductIds])];
    if (input.removeProductIds) state.productIds = state.productIds.filter(id => !input.removeProductIds.includes(id));
    if (removedIds.length) state.productIds = state.productIds.filter(id => !removedIds.includes(id));
    if (state.productIds.length > 50) fail('Select at most 50 catalog products');
    if (input.artwork !== undefined) state.artwork = input.artwork;
    if (input.artworkAttachmentId) { state.artworkAttachmentId = input.artworkAttachmentId; state.artwork = 'upload'; }
    if (input.shopIds) state.shopIds = [...new Set(input.shopIds)];
    if (state.artwork === 'saved' && !state.collectionId) fail('Select a saved collection first');
    if (input.name !== undefined || input.addProductIds || input.removeProductIds || namedIds.length || removedIds.length) state.step = 'products';
    if (input.artwork !== undefined || input.artworkAttachmentId || input.collectionId) state.step = 'design';
    if (input.step) state.step = input.step;
    const value = await resources(context, state);
    if (state.step && state.step !== 'name' && !state.name) fail('Name your collection first');
    if (['artwork', 'design', 'stores', 'review'].includes(state.step) && !state.productIds.length) fail('Select at least one product before continuing');
    if (['design', 'stores', 'review'].includes(state.step) && !state.artwork) fail('Upload artwork or choose Skip Artwork first');
    if (['stores', 'review'].includes(state.step) && (needsDesigner(state, value) || savedDesignChanged(state, value))) fail('Place and save your artwork in the existing designer, then reload the saved design.', 'DESIGN_REQUIRED', 422);
    if (state.step === 'review' && !state.shopIds.length) fail('Select at least one store');
    state.revision = current.revision + 1;
    const saved = await CopilotConversation.updateOne({ _id: conversation._id, tenantId: context.tenantId,
      userId: context.actorUserId, ...(conversation.swag ? { 'swag.revision': current.revision } : { swag: { $exists: false } }) }, { $set: { swag: state } });
    if (!saved.modifiedCount) stale();
  }
  const result = publicState(context, state, await resources(context, state, null, !changes));
  if (['stores', 'review'].includes(result.step)) result.storeOptions = (await Shop.find({ tenantId: context.tenantId }).sort({ name: 1 }))
    .map(s => ({ id: String(s._id), name: s.name, status: s.status }));
  if (result.storeOptions) result.storeOptions.push(...result.invalidStoreIds.map(id => ({ id, name: 'Unavailable selected store', status: 'unavailable' })));
  if (input.listSaved) result.savedCollections = (await Collection.find({ tenantId: context.tenantId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(50))
    .map(c => ({ id: String(c._id), name: c.name, status: c.status, published: isCollectionLinkedToAnyShop(c) }));
  return result;
}

async function plan(context, input, session = null) {
  const conversation = await conversationFor(context, input.conversationId, session);
  const state = conversation.swag || initial();
  if (state.revision !== input.revision) stale();
  nameSchema.parse(state.name);
  if (!state.productIds.length || !state.artwork) fail('Select products and choose artwork or no artwork first');
  const value = await resources({ ...context, conversationId: input.conversationId }, state, session);
  if (value.collection && isCollectionLinkedToAnyShop(value.collection)) fail('Published collections must be managed in the existing dashboard', 'COLLECTION_PUBLISHED', 409);
  if (input.action === 'publish') {
    if (savedDesignChanged(state, value)) stale();
    if (!state.shopIds.length) fail('Select at least one store');
    if (needsDesigner(state, value)) {
      fail('A selected product needs its artwork placed and saved in the existing designer.', 'DESIGN_REQUIRED', 422);
    }
  }
  return { state, value, hash: digest(snapshot(state, value)) };
}

export async function prepareSwag({ tenantId, actorUserId, input, now }) {
  input = swagPrepareSchema.parse(input);
  const context = { tenantId, actorUserId };
  let planned;
  const prepared = await prepareMcpWrite({ ...context, operation: OPERATION, payload: input, now,
    authorize: actor => authorize(actor, input.action === 'publish'), validate: async () => input,
    resourceState: async () => { planned = await plan(context, input); return planned.hash; },
  });
  const preview = publicState({ ...context, conversationId: input.conversationId }, planned.state, planned.value);
  return { ...prepared, preview: { ...preview, action: input.action,
    visibility: input.action === 'save' ? 'Saved design only; not published to any store'
      : 'Collection listings become active in the selected stores; draft stores remain draft' } };
}

export async function executeSwag({ tenantId, actorUserId, input, now }) {
  const parsed = swagExecuteSchema.parse(input);
  const { confirmationId, idempotencyKey, ...payload } = parsed;
  const context = { tenantId, actorUserId };
  const receipt = () => McpWriteConfirmation.findOne({ ...context, operation: OPERATION, confirmationId });
  return executeMcpWrite({ ...context, operation: OPERATION, confirmationId, idempotencyKey, payload, now,
    passExecutionContext: true,
    authorize: actor => authorize(actor, payload.action === 'publish'), validate: async () => payload,
    resourceState: async () => (await plan(context, payload)).hash,
    // Missing receipts are uncertain, never authorization to replay a publication.
    reconcile: async () => { const row = await receipt(); return row?.copilotOutcome?.state === 'completed'
      ? { outcome: 'completed', result: row.copilotOutcome.result } : { outcome: 'uncertain' }; },
    execute: async (_actor, execution) => {
      const session = await mongoose.startSession();
      let result;
      try {
        await session.withTransaction(async () => {
          const owned = await McpWriteIdempotency.updateOne({ _id: execution.reservationId, tenantId, actorUserId,
            status: 'pending', leaseOwner: execution.leaseOwner, fence: execution.fence,
            leaseExpiresAt: { $gt: new Date() } }, { $set: { leaseExpiresAt: new Date(Date.now() + 30000) } }, { session });
          if (!owned.matchedCount) fail('Execution ownership changed. Check the recorded outcome before preparing again.', 'IDEMPOTENCY_RECONCILIATION_REQUIRED', 409);
          const actor = await loadMcpActor({ ...context, session }); authorize(actor, payload.action === 'publish');
          const approval = await McpWriteConfirmation.findOne({ ...context, operation: OPERATION, confirmationId,
            status: 'consumed', 'copilotOutcome.state': { $ne: 'completed' } }).session(session);
          if (!approval) stale();
          if (approval.expiresAt <= new Date()) fail('This confirmation has expired', 'CONFIRMATION_EXPIRED', 409);
          const planned = await plan(context, payload, session);
          // prepareMcpWrite hashes the JSON string returned by resourceState.
          if (approval.resourceHash !== digest(planned.hash)) stale();
          const locked = await CopilotConversation.updateOne({ _id: payload.conversationId, tenantId, userId: actorUserId,
            'swag.revision': payload.revision }, { $inc: { 'swag.revision': 1 } }, { session });
          if (!locked.modifiedCount) stale();
          for (const product of planned.value.products) {
            // Force a write conflict if catalog eligibility/configuration changes during this transaction.
            await CatalogProduct.updateOne({ _id: product._id }, { $inc: { __v: 1 } }, { session, timestamps: false });
          }
          if (planned.value.attachment) await CopilotAttachment.updateOne({ _id: planned.value.attachment._id,
            tenantId, userId: actorUserId }, { $inc: { __v: 1 } }, { session, timestamps: false });
          let collection = planned.value.collection;
          const refs = refsFor(planned.state, planned.value);
          if (!collection) collection = await createCollectionDesign({ tenantId, createdBy: actorUserId, session,
            input: { name: planned.state.name, productRefs: refs, artworkUrl: planned.value.attachment?.fileUrl || '' } });
          else {
            updateCollectionDesign(collection, { name: planned.state.name, productRefs: refs, removeArtwork: planned.state.artwork !== 'saved' });
            if (planned.value.attachment) { collection.artworkUrl = planned.value.attachment.fileUrl; collection.status = 'ready'; }
            await collection.save({ session });
          }
          if (payload.action === 'publish') {
            for (const store of planned.value.stores) {
              const published = await publishCollectionToShop(store._id, tenantId, collection, { session });
              if (!published || !isCollectionLinkedToShop(collection, store._id)
                || listingKeysFromCollection(collection).some(key => !published.activeListingKeys.includes(key))) {
                fail('Publication could not be verified', 'PUBLICATION_UNVERIFIED', 409);
              }
            }
          }
          result = { id: String(collection._id), name: collection.name, status: collection.status,
            action: payload.action, published: payload.action === 'publish', productCount: collection.productRefs.length,
            products: planned.value.products.map(toCatalogProductDetail),
            designs: collection.productRefs.map(ref => ({ productId: String(ref.catalogProductId), mockupUrl: ref.mockupUrl || '',
              mockupBackUrl: ref.mockupBackUrl || '', placement: ref.placement || null, placements: ref.placements || [] })),
            stores: payload.action === 'publish' ? planned.value.stores.map(s => ({ id: String(s._id), name: s.name, status: s.status })) : [],
            editorPath: `/swag/new?edit=${collection._id}`, collectionPath: '/swag',
            artworkStatus: planned.state.artwork === 'upload' ? 'Uploaded; place artwork in the designer'
              : collection.productRefs.some(ref => ref.mockupUrl || ref.designOnlyImageUrl) ? 'Saved product-specific design' : 'Not applied',
          };
          // Receipts and MCP redaction must receive plain values, never Mongoose subdocuments.
          result = JSON.parse(JSON.stringify(result));
          await CopilotConversation.updateOne({ _id: payload.conversationId, tenantId, userId: actorUserId },
            { $set: { 'swag.collectionId': String(collection._id), 'swag.lastOutcome': result,
              'swag.savedUpdatedAt': collection.updatedAt.toISOString(),
              'swag.artwork': planned.state.artwork === 'upload' ? 'saved' : planned.state.artwork } }, { session });
          approval.copilotOutcome = { state: 'completed', result };
          await approval.save({ session });
        });
        return result;
      } finally { await session.endSession(); }
    },
  });
}

export const prepareSwagForCaller = (ctx, input) => {
  if (ctx.copilotConversationId && String(ctx.copilotConversationId) !== input.conversationId) throw new ForbiddenError('Use the current design conversation');
  return prepareSwag({ ...caller(ctx), input });
};
export const executeSwagForCaller = (ctx, input) => executeSwag({ ...caller(ctx), input });

export async function readSwagForCaller(ctx) {
  const context = caller(ctx);
  const actor = await loadMcpActor(context); authorize(actor);
  const conversation = await conversationFor(context, ctx.copilotConversationId);
  return conversation.swag ? configureSwagForCaller(ctx, {}) : null;
}

export async function browseSwagForCaller(ctx, query) {
  const state = await readSwagForCaller(ctx);
  if (!state?.active) fail('Start a Swag Design conversation first');
  const input = catalogSearchInputSchema.parse(query);
  const result = await searchCatalog({ ...input, limit: input.limit || 6 });
  // Ground later "add this" in the exact catalog results shown by this interaction.
  await CopilotConversation.updateOne({ _id: state.conversationId, ...{ tenantId: caller(ctx).tenantId, userId: caller(ctx).actorUserId } },
    { $push: { messages: { role: 'assistant', content: '', artifacts: [...result.items.map(product => ({ kind: 'product', product })),
      { kind: 'catalog_page', catalog: { query: { ...input, limit: input.limit || 6 }, pagination: result.pagination } }] } } });
  return result;
}
