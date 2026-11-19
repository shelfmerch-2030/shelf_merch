// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useSwagConversation} from './useSwagConversation';
import * as api from './swagApi';
import type {SwagState} from './swagApi';
vi.mock('./swagApi',()=>({getSwagState:vi.fn(),configureSwagState:vi.fn(),prepareSwagReview:vi.fn()}));
const base:SwagState={conversationId:'a',revision:2,active:true,name:'Team',step:'design',artwork:'upload',artworkStatus:'Uploaded',productIds:['p'],products:[{id:'p',name:'Polo'}],shopIds:[],stores:[],designs:[],designReady:false,persisted:false,hasUnsavedChanges:true};
afterEach(cleanup);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.getSwagState).mockImplementation(async id=>({state:{...base,conversationId:id}}));vi.mocked(api.configureSwagState).mockResolvedValue({state:{...base,revision:3}});});
it('hydration and focus read saved changes without advancing revision or appending metadata steps',async()=>{
 vi.mocked(api.getSwagState).mockResolvedValue({state:{...base,canRefreshSavedDesign:true}});
 const hook=renderHook(()=>useSwagConversation('a',true));await waitFor(()=>expect(hook.result.current.state).not.toBeNull());
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 expect(api.configureSwagState).not.toHaveBeenCalled();expect(hook.result.current.state?.revision).toBe(2);expect(api.prepareSwagReview).not.toHaveBeenCalled();
});
it('ignores an old mutation failure after switching a to b to a',async()=>{
 let reject!:(error:Error)=>void;vi.mocked(api.configureSwagState).mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));
 const hook=renderHook(({id})=>useSwagConversation(id,true),{initialProps:{id:'a'}});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('a'));
 let pending!:Promise<unknown>;act(()=>{pending=hook.result.current.change({name:'Old name'});});
 hook.rerender({id:'b'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('b'));
 hook.rerender({id:'a'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('a'));
 await act(async()=>{reject(new Error('The design changed while this reply was being prepared.'));await pending;});
 expect(hook.result.current.error).toBeNull();expect(hook.result.current.state?.name).toBe('Team');
});
it('allows the new conversation to act while an earlier conversation mutation is pending',async()=>{
 let release!:(value:{state:SwagState})=>void;vi.mocked(api.configureSwagState).mockImplementationOnce(()=>new Promise(r=>{release=r;})).mockResolvedValueOnce({state:{...base,conversationId:'b',revision:3,name:'New B'}});
 const hook=renderHook(({id})=>useSwagConversation(id,true),{initialProps:{id:'a'}});await waitFor(()=>expect(hook.result.current.state).not.toBeNull());
 let pending!:Promise<unknown>;act(()=>{pending=hook.result.current.change({name:'Old A'});});
 hook.rerender({id:'b'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('b'));
 expect(hook.result.current.busy).toBe(false);await act(async()=>{await hook.result.current.change({name:'New B'});});
 expect(api.configureSwagState).toHaveBeenCalledTimes(2);expect(hook.result.current.state?.name).toBe('New B');
 await act(async()=>{release({state:{...base,revision:3,name:'Old A'}});await pending;});expect(hook.result.current.state?.name).toBe('New B');
});
it('does not replace acknowledged state with an older in-flight null hydration response',async()=>{
 let release!:(value:{state:SwagState|null})=>void;
 const hook=renderHook(()=>useSwagConversation('a',true));await waitFor(()=>expect(hook.result.current.state).not.toBeNull());
 vi.mocked(api.getSwagState).mockImplementationOnce(()=>new Promise(r=>{release=r;}));let hydration!:Promise<unknown>;act(()=>{hydration=hook.result.current.refresh();});
 await act(async()=>{await hook.result.current.change({name:'Acknowledged'});});
 await act(async()=>{release({state:null});await hydration;});expect(hook.result.current.state?.revision).toBe(3);
});
it('retains an actionable genuine mutation conflict and reads state once without retrying it',async()=>{
 vi.mocked(api.configureSwagState).mockRejectedValueOnce(Object.assign(new Error('The selection changed. Review it again.'),{code:'CONFIRMATION_STALE'}));
 const hook=renderHook(()=>useSwagConversation('a',true));await waitFor(()=>expect(hook.result.current.state).not.toBeNull());
 await act(async()=>{await hook.result.current.change({name:'Stale'});});
 expect(hook.result.current.errorCode).toBe('CONFIRMATION_STALE');expect(hook.result.current.error).toMatch(/selection changed/);expect(api.configureSwagState).toHaveBeenCalledTimes(1);expect(api.getSwagState).toHaveBeenCalledTimes(2);
});
it('rejects a callback from an earlier visit even after returning to the same conversation',async()=>{
 const hook=renderHook(({id})=>useSwagConversation(id,true),{initialProps:{id:'a'}});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('a'));const old=hook.result.current.change;
 hook.rerender({id:'b'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('b'));hook.rerender({id:'a'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('a'));
 await act(async()=>{await old({name:'Old callback'});});expect(api.configureSwagState).not.toHaveBeenCalled();
});
it('ignores a failed hydration from a previous conversation',async()=>{
 let reject!:(error:Error)=>void;vi.mocked(api.getSwagState).mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));
 const hook=renderHook(({id})=>useSwagConversation(id,true),{initialProps:{id:'a'}});hook.rerender({id:'b'});await waitFor(()=>expect(hook.result.current.state?.conversationId).toBe('b'));
 await act(async()=>{reject(new Error('Old history failed'));});expect(hook.result.current.error).toBeNull();
});
