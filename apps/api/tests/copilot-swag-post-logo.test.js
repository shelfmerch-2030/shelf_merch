import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { streamAssistantTurn, getConversation } from '../src/modules/copilot/copilotChat.service.js';
import { streamOpenAiCompletion } from '../src/modules/copilot/providers/openaiChatAdapter.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotAttachment } from '../src/modules/copilot/copilotAttachment.model.js';
import { McpWriteConfirmation } from '../src/modules/mcp/mcpWriteConfirmation.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { configureSwagForCaller } from '../src/modules/copilot/swagDesignWorkflow.js';
import { swagGuidance } from '../src/modules/copilot/swagTimeline.js';
import { prepareArtworkApplication } from '../src/modules/copilot/swagArtwork.service.js';

vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js', async original => ({ ...await original(), createOpenAiClient:vi.fn(()=>({})),streamOpenAiCompletion:vi.fn() }));
// Conversation routing tests stub only inspection. Actual inspection, rendering,
// upload and confirmed execution run separately in browser/renderer acceptance.
vi.mock('../src/modules/copilot/swagArtwork.service.js', async original=>({...await original(),prepareArtworkApplication:vi.fn()}));
const previous={provider:env.COPILOT_AI_PROVIDER,key:env.OPENAI_API_KEY,flag:env.EMBEDDED_COPILOT_WRITE_COLLECTIONS,renderer:process.env.SWAG_RENDERER_EXECUTABLE};
beforeAll(connectTestDb);
afterAll(async()=>{Object.assign(env,{COPILOT_AI_PROVIDER:previous.provider,OPENAI_API_KEY:previous.key,EMBEDDED_COPILOT_WRITE_COLLECTIONS:previous.flag});
  if(previous.renderer===undefined)delete process.env.SWAG_RENDERER_EXECUTABLE;else process.env.SWAG_RENDERER_EXECUTABLE=previous.renderer;await disconnectTestDb();});
let tenant,user,conversation,ctx,fixture,products;
beforeEach(async()=>{
  await clearTestDb(); vi.mocked(streamOpenAiCompletion).mockReset(); vi.mocked(prepareArtworkApplication).mockReset();
  Object.assign(env,{COPILOT_AI_PROVIDER:'openai',OPENAI_API_KEY:'synthetic-no-network',EMBEDDED_COPILOT_WRITE_COLLECTIONS:'true'});
  process.env.SWAG_RENDERER_EXECUTABLE='controlled-test-inspection-only';
  tenant=await makeTenant();({user}=await makeUser(tenant,'company_admin'));
  conversation=await CopilotConversation.create({tenantId:tenant._id,userId:user._id});
  ctx={authInfo:{extra:{tenantId:String(tenant._id),userId:String(user._id),role:'company_admin'}},copilotConversationId:String(conversation._id)};
  fixture={tenantId:tenant._id,userId:user._id,role:'company_admin',conversationId:String(conversation._id),toolCtx:ctx};
  products=await CatalogProduct.create(['Corporate Polo','Ceramic Mug'].map((name,index)=>({sku:`POST-${index}`,name,status:'active',basePriceInr:500})));
  const attachment=await CopilotAttachment.create({tenantId:tenant._id,userId:user._id,conversationId:conversation._id,kind:'swag_artwork',fileUrl:'/uploads/logo.png',storageKey:`${tenant._id}/artwork/logo.png`,storageDriver:'local',originalName:'MCP_QA_Artwork_600_DPI.png',mimeType:'image/png',expiresAt:new Date(Date.now()+3600000)});
  await configureSwagForCaller(ctx,{revision:0,name:'Team Swag',addProductIds:products.map(p=>String(p._id)),artworkAttachmentId:String(attachment._id)});
  vi.mocked(prepareArtworkApplication).mockImplementation(async({state})=>({version:'test-inspection',artworkHash:'test-logo',targets:products.filter(p=>(state.artworkProductIds||state.productIds).includes(String(p._id))).map(p=>({productId:String(p._id),name:p.name,areaKey:'front',areaLabel:'Front',baseHash:'test-base'})),manual:[],preserved:[],requestedProductIds:state.artworkProductIds||state.productIds,requestedAll:!state.artworkProductIds||state.artworkProductIds.length===state.productIds.length,replace:false}));
});
const turn=content=>streamAssistantTurn({...fixture,content,onEvent:vi.fn()});
const current=()=>configureSwagForCaller(ctx,{});
const last=result=>result.messages.at(-1);
const cards=result=>last(result).artifacts.filter(a=>a.kind==='confirmation');
async function ready(){const state=await current();return configureSwagForCaller(ctx,{revision:state.revision,artwork:'none',step:'design'});}
it('acknowledges a configured upload truthfully and projects automatic approval rather than the old editor route',async()=>{
  const state=await current(); expect(state).toMatchObject({automaticArtworkAvailable:true,nextStep:'approve_artwork',artwork:'upload',designReady:false});
  expect(swagGuidance(state)).toBe("I've received your logo. Would you like me to apply it to your selected products?");
  expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0); expect(prepareArtworkApplication).not.toHaveBeenCalled();
});
it('reproduces the missing-executable fallback without blaming product eligibility',async()=>{
  delete process.env.SWAG_RENDERER_EXECUTABLE; const state=await current();
  expect(state.automaticArtworkAvailable).toBe(false);expect(state.nextStep).toBe('save_then_editor');
  expect(swagGuidance(state)).toMatch(/isn't available in this workspace/);expect(swagGuidance(state)).not.toMatch(/Review a draft/);
});
it.each(['Yes.','Okay.','Yes, apply the logo.','Apply it.','Apply to all.','Apply it to both.','Go ahead.'])('%s prepares exactly one real approval without applying or publishing',async content=>{
  const result=await turn(content); expect(cards(result)).toHaveLength(1);expect(cards(result)[0]).toMatchObject({status:'pending',request:{action:'apply'},preview:{application:{targets:expect.any(Array)}}});
  expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);expect(streamOpenAiCompletion).not.toHaveBeenCalled();
  const loaded=await getConversation(fixture);expect(loaded.messages.filter(m=>m.uiEventId?.startsWith('swag:receipt:'))).toHaveLength(0);
});
it('repeated typed approvals reuse the bound pending approval and never execute',async()=>{
  const first=await turn('Yes'),second=await turn('Yes');expect(cards(second)[0].confirmationId).toBe(cards(first)[0].confirmationId);
  expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id,status:'pending'})).toBe(1);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it.each(['Only apply it to the polo.', 'Apply it only to the polo.'])('scopes %s to the verified polo without removing other selections',async phrase=>{
  const result=await turn(phrase);expect(cards(result)[0].preview.application.targets.map(t=>t.productId)).toEqual([String(products[0]._id)]);
  expect((await current()).productIds).toEqual(products.map(p=>String(p._id)));expect((await current()).artworkProductIds).toEqual([String(products[0]._id)]);
});
it('acknowledges Send with optional text and leaves replacement artwork unapplied', async () => {
  const original = await current();
  const second = await CopilotAttachment.create({ tenantId: tenant._id, userId: user._id, conversationId: conversation._id,
    kind: 'swag_artwork', fileUrl: '/uploads/replacement.png', originalName: 'replacement.png', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600000) });
  expect((await current()).artworkAttachmentId).toBe(original.artworkAttachmentId);
  const reply = await streamAssistantTurn({ ...fixture, content: 'Use my new logo', attachmentIds: [String(second._id)], onEvent: vi.fn() });
  expect(last(reply).content).toBe("I've received your logo. Would you like me to apply it to your selected products?");
  expect(cards(reply)).toHaveLength(0);
  const loaded = await getConversation(fixture);
  expect(loaded.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
  expect(loaded.messages.find(message => message.role === 'user').attachments[0].id).toBe(String(second._id));
  expect((await current()).artworkAttachmentId).toBe(String(second._id));
  expect(prepareArtworkApplication).not.toHaveBeenCalled();
  expect(await Collection.countDocuments({ tenantId: tenant._id })).toBe(0);
  const separate = await CopilotConversation.create({ tenantId: tenant._id, userId: user._id });
  await expect(streamAssistantTurn({ ...fixture, conversationId: String(separate._id), content: '', attachmentIds: [String(second._id)] })).rejects.toMatchObject({ code: 'ATTACHMENT_FORBIDDEN' });
});
it('clarifies ambiguous artwork targets rather than guessing or preparing',async()=>{
  const state=await current();const extra=await CatalogProduct.create({sku:'POST-OTHER',name:'Summer Polo',status:'active',basePriceInr:400});
  await configureSwagForCaller(ctx,{revision:state.revision,addProductIds:[String(extra._id)],step:'design'});
  const result=await turn('Only apply it to the polo');expect(last(result).content).toMatch(/Which selected product/);expect(cards(result)).toHaveLength(0);expect(prepareArtworkApplication).not.toHaveBeenCalled();
});
it('identifies unsupported products in an explicit partial-application approval',async()=>{
  vi.mocked(prepareArtworkApplication).mockResolvedValueOnce({version:'fixture',artworkHash:'logo',targets:[{productId:String(products[0]._id),name:products[0].name,areaLabel:'Front'}],manual:[{productId:String(products[1]._id),name:products[1].name,reason:'Its decoration area needs manual placement.'}],preserved:[],requestedProductIds:products.map(p=>String(p._id)),requestedAll:true});
  const result=await turn('Yes');expect(last(result).content).toMatch(/1 of the 2/);expect(last(result).content).toContain('Ceramic Mug');
  expect(cards(result)[0].preview.application.manual).toHaveLength(1);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('explains the real unsupported-area reason and offers manual mode only after failed eligibility',async()=>{
  vi.mocked(prepareArtworkApplication).mockResolvedValueOnce({targets:[],manual:products.map(p=>({productId:String(p._id),name:p.name,reason:'A supported rectangular print area is missing.'})),preserved:[]});
  const result=await turn('Yes');expect(last(result).content).toMatch(/rectangular print area/);expect(cards(result)).toHaveLength(0);
  expect(last(result).artifacts.find(a=>a.kind==='swag_step').swag.mode).toBe('manual');
});
it('keeps transient renderer failure distinct from unsupported products',async()=>{
  vi.mocked(prepareArtworkApplication).mockRejectedValueOnce(Object.assign(new Error('busy'),{code:'SWAG_RENDERER_BUSY'}));
  const result=await turn('Yes');expect(last(result).content).toMatch(/busy right now/);expect(last(result).artifacts.at(-1).swag.mode).toBeUndefined();expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('does not replay an unverified consumed approval on yes',async()=>{
  const first=await turn('Yes');await McpWriteConfirmation.updateOne({tenantId:tenant._id,confirmationId:cards(first)[0].confirmationId},{$set:{status:'consumed'}});
  const result=await turn('Yes');expect(last(result).content).toMatch(/unverified|verified|status/i);expect(cards(result)).toHaveLength(0);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('asks publishing scope after a saved-design looks good without advancing or writing',async()=>{
  const collection=await Collection.create({tenantId:tenant._id,code:'POST-LOGO-SAVED',name:'Team Swag',productRefs:products.map(p=>({catalogProductId:p._id,name:p.name,mockupUrl:'/uploads/actual-saved.png',placements:[{key:'front',artworkUrl:'/uploads/logo.png'}]})),status:'ready'});
  const state=await current();await configureSwagForCaller(ctx,{revision:state.revision,collectionId:String(collection._id)});
  const result=await turn('Looks good.');expect(last(result).content).toMatch(/entire collection or only a selected product/);expect(cards(result)).toHaveLength(0);expect((await current()).step).toBe('design');
});
it('prepares the entire collection directly for a clear full-collection and exact-store request',async()=>{
  await ready();const store=await Shop.create({tenantId:tenant._id,name:'AI Store',slug:'post-logo-ai-store',status:'draft'});
  const result=await turn('Publish my collection to AI Store.');expect(cards(result)).toHaveLength(1);expect(cards(result)[0]).toMatchObject({request:{action:'publish'},preview:{products:expect.any(Array),stores:[{id:String(store._id),name:'AI Store',status:'draft'}]}});
  expect(cards(result)[0].preview.products).toHaveLength(2);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);expect(streamOpenAiCompletion).not.toHaveBeenCalled();
});
it('asks for a verified store when clear full-collection intent lacks one',async()=>{await ready();const result=await turn('Publish the collection');expect(last(result).content).toMatch(/Which store/);expect(cards(result)).toHaveLength(0);expect((await current()).step).toBe('stores');});
it.each(['Publish only the polo.','Publish just one product.','Publish the polo.'])('%s never drops other products or prepares full publication',async content=>{
  await ready();const before=await current();const result=await turn(content);expect(last(result).content).toMatch(/separate one-product collection/);expect(cards(result)).toHaveLength(0);expect((await current()).productIds).toEqual(before.productIds);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('guards a later provider attempt to publish everything after a subset request',async()=>{
  await ready();await turn('Publish only the polo');const state=await current();
  vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({text:'',finishReason:'tool_calls',usage:{},toolCalls:[{id:'unsafe-publish',name:'swag_prepare_collection',arguments:JSON.stringify({conversationId:String(conversation._id),revision:state.revision,action:'publish'})}]}).mockResolvedValueOnce({text:'Please clarify the collection to publish.',finishReason:'stop',toolCalls:[],usage:{}});
  const result=await turn('AI Store');expect(last(result).artifacts.some(a=>a.kind==='confirmation')).toBe(false);expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id})).toBe(0);expect((await current()).productIds).toHaveLength(2);
});
it.each(['AI Store','Publish to AI Store'])('keeps the subset clarification through Next and %s instead of silently preparing everything',async storeChoice=>{
  await ready();await Shop.create({tenantId:tenant._id,name:'AI Store',slug:'guarded-subset-store',status:'draft'});
  await turn('Publish only the polo');await turn('Next');const result=await turn(storeChoice);
  expect(last(result).content).toMatch(/separate one-product collection/);expect(cards(result)).toHaveLength(0);
  expect(await McpWriteConfirmation.countDocuments({tenantId:tenant._id})).toBe(0);expect((await current()).productIds).toHaveLength(2);
});
it.each(['Change the logo.','I want to change my logo.'])('retains logo replacement via %s without any write',async content=>{const result=await turn(content);expect(last(result).content).toMatch(/replacement logo using \+/);expect(cards(result)).toHaveLength(0);expect((await current()).artwork).toBe('upload');});
it('retains conversational product changes without losing the upload or selection',async()=>{const before=await current();await turn('Add another product');const state=await current();expect(state.step).toBe('products');expect(state.productIds).toEqual(before.productIds);expect(state.artworkAttachmentId).toBe(before.artworkAttachmentId);});
it('Save for later prepares only save and keeps the uploaded logo unapplied',async()=>{const result=await turn('Save it for later');expect(cards(result)[0].request.action).toBe('save');expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);expect((await current()).artwork).toBe('upload');});
it('open designer uses the existing confirmed save and never writes or opens an unsaved collection',async()=>{const result=await turn('Open the designer');expect(cards(result)[0].request.action).toBe('save');expect(last(result).content).toMatch(/Confirm saving/);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);});
it('opens an unchanged saved design through its authorized link without another persisted-write confirmation',async()=>{
  const collection=await Collection.create({tenantId:tenant._id,code:'EXISTING-DESIGNER',name:'Team Swag',status:'ready',productRefs:products.map(p=>({catalogProductId:p._id,name:p.name,mockupUrl:'/uploads/saved.png'}))});
  const state=await current();await configureSwagForCaller(ctx,{revision:state.revision,collectionId:String(collection._id)});
  const result=await turn('Open the designer');expect(cards(result)).toHaveLength(0);expect(last(result).artifacts.at(-1).swag.mode).toBe('designer');expect(last(result).content).toMatch(/Open the designer below/);
  expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(1);expect(streamOpenAiCompletion).not.toHaveBeenCalled();
});
it.each(['Not now.','Skip the logo.'])('%s uses the existing no-artwork path without publishing',async content=>{await turn(content);expect((await current()).artwork).toBe('none');expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);});
