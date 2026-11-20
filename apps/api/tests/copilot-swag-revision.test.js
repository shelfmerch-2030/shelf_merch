import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {connectTestDb,clearTestDb,disconnectTestDb} from './setup.js';
import {makeTenant,makeUser} from './helpers.js';
import {env} from '../src/config/env.js';
import {streamAssistantTurn,getConversation} from '../src/modules/copilot/copilotChat.service.js';
import {streamOpenAiCompletion} from '../src/modules/copilot/providers/openaiChatAdapter.js';
import {CopilotConversation} from '../src/modules/copilot/copilotConversation.model.js';
import {configureSwagForCaller} from '../src/modules/copilot/swagDesignWorkflow.js';
import {Collection} from '../src/modules/collections/collection.model.js';
import {CatalogProduct} from '../src/modules/catalog/catalogProduct.model.js';
import {CopilotAttachment} from '../src/modules/copilot/copilotAttachment.model.js';
import {appendSwagResponse} from '../src/modules/copilot/swagTimeline.js';
import {prepareSwag} from '../src/modules/copilot/swagDesignWorkflow.js';
import {executeCopilotWrite} from '../src/modules/copilot/copilotWrites.service.js';
vi.mock('../src/modules/copilot/providers/openaiChatAdapter.js',async original=>({...await original(),createOpenAiClient:vi.fn(()=>({})),streamOpenAiCompletion:vi.fn()}));
const previous={provider:env.COPILOT_AI_PROVIDER,key:env.OPENAI_API_KEY,flag:env.EMBEDDED_COPILOT_WRITE_COLLECTIONS};
beforeAll(connectTestDb);afterAll(async()=>{Object.assign(env,{COPILOT_AI_PROVIDER:previous.provider,OPENAI_API_KEY:previous.key,EMBEDDED_COPILOT_WRITE_COLLECTIONS:previous.flag});await disconnectTestDb();});
let tenant,user,conversation,ctx,fixture;
beforeEach(async()=>{
 await clearTestDb();vi.restoreAllMocks();vi.mocked(streamOpenAiCompletion).mockReset();
 Object.assign(env,{COPILOT_AI_PROVIDER:'openai',OPENAI_API_KEY:'synthetic-no-provider',EMBEDDED_COPILOT_WRITE_COLLECTIONS:'true'});
 tenant=await makeTenant();({user}=await makeUser(tenant,'company_admin'));conversation=await CopilotConversation.create({tenantId:tenant._id,userId:user._id});
 ctx={authInfo:{extra:{tenantId:String(tenant._id),userId:String(user._id),role:'company_admin'}},copilotConversationId:String(conversation._id)};
 fixture={tenantId:tenant._id,userId:user._id,role:'company_admin',conversationId:String(conversation._id),toolCtx:ctx};
});
const answer=text=>({text,finishReason:'stop',usage:{},toolCalls:[]});
const tool=(args,id='state')=>({text:'',finishReason:'tool_calls',usage:{},toolCalls:[{id,name:'swag_configure',arguments:JSON.stringify(args)}]});
const turn=content=>streamAssistantTurn({...fixture,content,onEvent:vi.fn()});
it('a read-only initial Swag tool returns a normal response without requiring a persisted revision zero',async()=>{
 vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(tool({})).mockResolvedValueOnce(answer('What would you like to name your collection?'));
 const result=await turn('Design swag for new employees.');
 expect(result.messages.at(-1).content).toContain('name');
 const saved=await CopilotConversation.findById(conversation._id);
 expect(saved.swag).toBeUndefined();expect(saved.messages.filter(m=>m.content==='What would you like to name your collection?')).toHaveLength(1);
 expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('a presentation append overtaken by a newer UI transition reconciles without a false user-facing revision error',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'Original'});
 vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Old draft recommendations.'));
 const update=CopilotConversation.updateOne.bind(CopilotConversation);let injected=false;
 vi.spyOn(CopilotConversation,'updateOne').mockImplementation(async(filter,change,...rest)=>{
  if(!injected&&filter['swag.revision']!==undefined&&change.$push?.messages?.$each?.some(m=>m.role==='assistant')){
   injected=true;await configureSwagForCaller({...ctx,swagTimeline:true},{revision:1,name:'Latest selection'});
  }
  return update(filter,change,...rest);
 });
 await turn('Tell me about this collection');expect(injected).toBe(true);
 const saved=await getConversation(fixture);expect(saved.swag.name).toBe('Latest selection');
 expect(saved.messages.at(-1).content).not.toBe('Old draft recommendations.');
 expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('initializes a new named Swag conversation normally and keeps one originating request and response',async()=>{
 await turn('I want to design swag.');
 vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(tool({revision:1,name:'Winter'})).mockResolvedValueOnce(answer('Name saved.'));
 await turn('Winter');const saved=await getConversation(fixture);
 expect(saved.swag).toMatchObject({name:'Winter',revision:2});expect(saved.messages.filter(m=>m.role==='user'&&m.content==='Winter')).toHaveLength(1);
 expect(saved.messages.filter(m=>m.uiEventId?.startsWith('swag:reply:'))).toHaveLength(2);
});
it('accepts two authorized tool revisions in its own turn without confusing them with external edits',async()=>{
 vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce({text:'',finishReason:'tool_calls',usage:{},toolCalls:[...tool({revision:0,reset:true},'initialize').toolCalls,...tool({revision:1,name:'Named upfront'},'name').toolCalls]}).mockResolvedValueOnce(answer('Named upfront is ready for selection.'));
 await turn('Design swag called Named upfront');const saved=await getConversation(fixture);
 expect(saved.swag).toMatchObject({revision:2,name:'Named upfront'});expect(saved.messages.filter(m=>m.uiEventId?.startsWith('swag:request:'))).toHaveLength(1);
 expect(saved.messages.filter(m=>m.uiEventId?.startsWith('swag:reply:'))).toHaveLength(1);expect(saved.messages.at(-1).artifacts.at(-1).swag.revision).toBe(2);
});
it('does not mutate uploaded artwork state or duplicate workflow events on repeated history reads',async()=>{
 const product=await CatalogProduct.create({sku:'REV-POLO',name:'Polo',status:'active',basePriceInr:500});
 const attachment=await CopilotAttachment.create({tenantId:tenant._id,userId:user._id,conversationId:conversation._id,kind:'swag_artwork',status:'uploaded',fileUrl:'/uploads/revision-logo.png',originalName:'logo.png',mimeType:'image/png',expiresAt:new Date(Date.now()+3600000)});
 await configureSwagForCaller({...ctx,swagTimeline:true},{revision:0,name:'Logo test',addProductIds:[String(product._id)],artworkAttachmentId:String(attachment._id)});
 const before=await getConversation(fixture);
 for(let i=0;i<3;i++){await configureSwagForCaller(ctx,{});await getConversation(fixture);}
 const after=await getConversation(fixture);expect(after.swag).toEqual(before.swag);expect(after.messages.map(m=>m.uiEventId)).toEqual(before.messages.map(m=>m.uiEventId));
});
it('reconciles a same-request presentation race using fresh state without replaying its old prose or artifacts',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'First'});vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Outdated draft prose.'));
 const update=CopilotConversation.updateOne.bind(CopilotConversation);let injected=false;
 vi.spyOn(CopilotConversation,'updateOne').mockImplementation(async(filter,change,...rest)=>{
  if(!injected&&filter['swag.revision']===1&&change.$push?.messages?.$each){injected=true;await configureSwagForCaller(ctx,{revision:1,name:'Current'});}
  return update(filter,change,...rest);
 });
 await turn('Describe this draft');const saved=await getConversation(fixture);expect(saved.swag.revision).toBe(2);expect(saved.messages.at(-1).content).not.toBe('Outdated draft prose.');
 expect(saved.messages.at(-1).artifacts.at(-1).swag.revision).toBe(2);expect(saved.messages.filter(m=>m.uiEventId?.startsWith('swag:reply:'))).toHaveLength(1);
});
it('keeps genuine stale state-changing requests rejected',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'Current'});
 await expect(configureSwagForCaller(ctx,{revision:0,name:'Stale replacement'})).rejects.toMatchObject({code:'CONFIRMATION_STALE',status:409});
 expect((await getConversation(fixture)).swag.name).toBe('Current');
});
it('does not let a delayed tool change a design after a newer user action even if it supplied the newer revision',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'Original'});let release;const gate=new Promise(resolve=>{release=resolve;});
 vi.mocked(streamOpenAiCompletion).mockImplementationOnce(async()=>{await gate;return tool({revision:2,name:'Late overwrite'});});
 const pending=turn('Rename this later');await vi.waitFor(()=>expect(streamOpenAiCompletion).toHaveBeenCalled());
 await configureSwagForCaller({...ctx,swagTimeline:true},{revision:1,name:'Latest choice'});release();await pending;
 const saved=await getConversation(fixture);expect(saved.swag).toMatchObject({revision:2,name:'Latest choice'});expect(saved.messages.at(-1).uiEventId).toBe(`swag:state:${conversation._id}:2`);
 expect(streamOpenAiCompletion).toHaveBeenCalledTimes(1);
});
it('binds delayed responses to their original conversation while a different conversation is created',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'First chat'});let release;const gate=new Promise(resolve=>{release=resolve;});
 vi.mocked(streamOpenAiCompletion).mockImplementationOnce(async()=>{await gate;return answer('First chat reply');});
 const pending=turn('Explain first chat');await vi.waitFor(()=>expect(streamOpenAiCompletion).toHaveBeenCalled());
 const other=await CopilotConversation.create({tenantId:tenant._id,userId:user._id});
 await streamAssistantTurn({...fixture,conversationId:String(other._id),content:'I want to design swag.',onEvent:vi.fn()});
 release();await pending;const first=await getConversation(fixture),second=await getConversation({...fixture,conversationId:String(other._id)});
 expect(first.messages.at(-1).content).toBe('First chat reply');expect(JSON.stringify(second.messages)).not.toContain('First chat reply');expect(second.swag.revision).toBe(1);
});
it('idempotently appends a response once and never creates state while reconciling it',async()=>{
 const requestId='swag:request:duplicate';await CopilotConversation.updateOne({_id:conversation._id},{$push:{messages:{role:'user',content:'Name?',uiEventId:requestId}}});
 const state=await configureSwagForCaller(ctx,{});const options={conversation,requestId,state,readState:()=>configureSwagForCaller(ctx,{}),messages:[{role:'assistant',content:'What name?',artifacts:[]}]};
 await appendSwagResponse(options);await appendSwagResponse(options);const saved=await getConversation(fixture);
 expect(saved.messages.filter(m=>m.uiEventId===`swag:reply:${requestId}`)).toHaveLength(1);expect(saved.swag).toBeUndefined();
});
it('does not disguise an archived or inaccessible conversation as harmless presentation recovery',async()=>{
 await CopilotConversation.updateOne({_id:conversation._id},{$set:{archivedAt:new Date()}});
 await expect(appendSwagResponse({conversation,requestId:'missing',state:{revision:0},messages:[],readState:()=>configureSwagForCaller(ctx,{})})).rejects.toMatchObject({status:404});
});
it('rejects cross-actor and cross-tenant state access while fixing presentation conflicts',async()=>{
 const other=await makeUser(tenant,'company_admin');const foreign={...ctx,authInfo:{extra:{...ctx.authInfo.extra,userId:String(other.user._id)}}};
 await expect(configureSwagForCaller(foreign,{})).rejects.toMatchObject({code:'NOT_FOUND'});
 const otherTenant=await makeTenant();await expect(configureSwagForCaller({...ctx,authInfo:{extra:{...ctx.authInfo.extra,tenantId:String(otherTenant._id)}}},{})).rejects.toMatchObject({status:403});
});
it('fences a tool mutation atomically when a newer user turn arrives after its preliminary ownership check',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'Original'});
 vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(tool({revision:1,name:'Late overwrite'})).mockResolvedValueOnce(answer('Obsolete acknowledgement'));
 const update=CopilotConversation.updateOne.bind(CopilotConversation);let injected=false;
 vi.spyOn(CopilotConversation,'updateOne').mockImplementation(async(filter,change,...rest)=>{
  if(!injected&&change.$set?.swag?.name==='Late overwrite'){
   injected=true;await update({_id:conversation._id},{$push:{messages:{role:'user',content:'Newer request',uiEventId:'swag:request:newer'}}});
  }
  return update(filter,change,...rest);
 });
 await turn('Rename this later');const saved=await getConversation(fixture);expect(injected).toBe(true);expect(saved.swag).toMatchObject({revision:1,name:'Original'});
 expect(saved.messages.at(-1).content).toBe('Newer request');expect(saved.messages.some(m=>m.content==='Obsolete acknowledgement')).toBe(false);
});
it('surfaces read-only reload recovery when repeated state changes prevent bounded presentation reconciliation',async()=>{
 await configureSwagForCaller(ctx,{revision:0,name:'First'});vi.mocked(streamOpenAiCompletion).mockResolvedValueOnce(answer('Obsolete response'));
 const update=CopilotConversation.updateOne.bind(CopilotConversation);let conflicts=0;
 vi.spyOn(CopilotConversation,'updateOne').mockImplementation(async(filter,change,...rest)=>{
  if(conflicts<2&&(change.$push?.messages?.$each||change.$push?.messages?.uiEventId?.startsWith('swag:reply:'))){
   ++conflicts;await configureSwagForCaller(ctx,{revision:conflicts,name:`Current ${conflicts}`});
  }
  return update(filter,change,...rest);
 });
 await expect(turn('Describe the draft')).rejects.toMatchObject({code:'SWAG_REPLY_RELOAD_REQUIRED',message:'Your latest design is saved. Reload this conversation to continue.'});
 expect(conflicts).toBe(2);expect((await getConversation(fixture)).swag).toMatchObject({revision:3,name:'Current 2'});expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(0);
});
it('keeps a completed authoritative receipt last when an older explanation finishes',async()=>{
 const product=await CatalogProduct.create({sku:'REV-SAVE',name:'Polo',status:'active',basePriceInr:500});
 await configureSwagForCaller(ctx,{revision:0,name:'Saved safely',addProductIds:[String(product._id)],artwork:'none'});
 const input={conversationId:String(conversation._id),revision:1,action:'save'};const prepared=await prepareSwag({tenantId:tenant._id,actorUserId:user._id,input});
 await CopilotConversation.updateOne({_id:conversation._id},{$push:{messages:{role:'assistant',content:'Review saving',artifacts:[{kind:'confirmation',operation:'swag.collection',status:'pending',confirmationId:prepared.confirmationId,request:input,preview:prepared.preview}]}}});
 let release;const gate=new Promise(resolve=>{release=resolve;});vi.mocked(streamOpenAiCompletion).mockImplementationOnce(async()=>{await gate;return answer('Old explanation');});
 const pending=turn('Explain the design');await vi.waitFor(()=>expect(streamOpenAiCompletion).toHaveBeenCalled());
 await executeCopilotWrite({tenantId:tenant._id,user:{userId:user._id,role:'company_admin',scopeType:'tenant'}},'swag.collection',{...input,confirmationId:prepared.confirmationId,idempotencyKey:`revision:${prepared.confirmationId}`});
 release();await pending;const saved=await getConversation(fixture);expect(saved.messages.at(-1).uiEventId).toBe(`swag:receipt:${prepared.confirmationId}`);
 expect(saved.messages.filter(m=>m.uiEventId===`swag:receipt:${prepared.confirmationId}`)).toHaveLength(1);expect(saved.messages.some(m=>m.content==='Old explanation')).toBe(false);expect(await Collection.countDocuments({tenantId:tenant._id})).toBe(1);
});
