import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),listener:null as null|((event:string,session:unknown)=>void)}));
vi.mock('../src/backend',()=>({backend:{auth:{getSession:mocked.getSession,onAuthStateChange:mocked.onAuthStateChange}},signedPhoto:vi.fn()}));
import {AuthGate} from '../src/auth';
let container:HTMLDivElement;let root:Root;
const session=(configured=false)=>({user:{id:'test-user',user_metadata:configured?{jianlian_password_set:true}:{}}});
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,'','/jianlian-access-check/');
  mocked.getSession.mockReset();mocked.onAuthStateChange.mockReset();mocked.listener=null;
  mocked.onAuthStateChange.mockImplementation(listener=>{mocked.listener=listener;return {data:{subscription:{unsubscribe:vi.fn()}}};});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function mount(value:unknown){mocked.getSession.mockResolvedValue({data:{session:value},error:null});await act(async()=>root.render(<AuthGate><p>训练主页</p></AuthGate>));}
it('first authenticated visit shows the password form instead of burying it above the training page',async()=>{
  await mount(session());expect(container.textContent).toContain('设置简练登录密码');expect(container.querySelectorAll('input[type=password]')).toHaveLength(2);expect(container.textContent).not.toContain('训练主页');
});
it('explicit password link opens the form even for an account previously marked configured',async()=>{
  window.history.replaceState(null,'','/jianlian-access-check/?account=password');await mount(session(true));expect(container.textContent).toContain('修改登录密码');expect(container.querySelectorAll('input[type=password]')).toHaveLength(2);expect(container.textContent).not.toContain('训练主页');
});
it('email recovery callback opens the form for an existing configured account',async()=>{
  await mount(session(true));expect(container.textContent).toContain('训练主页');await act(async()=>mocked.listener?.('PASSWORD_RECOVERY',session(true)));expect(container.textContent).toContain('修改登录密码');expect(container.textContent).not.toContain('训练主页');
});
it('deferring setup returns to training and the permanent entry reopens the form',async()=>{
  await mount(session());let button=Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='稍后设置')!;await act(async()=>button.click());expect(container.textContent).toContain('训练主页');button=Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='设置登录密码')!;await act(async()=>button.click());expect(container.querySelectorAll('input[type=password]')).toHaveLength(2);
});
