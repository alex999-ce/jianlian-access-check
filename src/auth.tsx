import {useEffect,useState,type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {backend,signedPhoto} from './backend';

export function AuthGate({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [passwordMode,setPasswordMode]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    backend.auth.getSession().then(({data,error})=>{setSession(data.session);setReady(true);if(error)setNotice(error.message);}).catch(()=>{setReady(true);setNotice('登录状态读取失败，请刷新重试。');});
    const {data:{subscription}}=backend.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  },[]);
  async function login() {
    setBusy(true);setNotice('');
    try {
      const result=passwordMode ? await backend.auth.signInWithPassword({email:email.trim(),password}) : await backend.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,location.origin).href}});
      if(result.error) throw result.error;
      if(!passwordMode)setNotice('登录邮件已发送。请在这台设备的浏览器中打开邮件里的登录链接。');
    } catch(error) {setNotice(error instanceof Error ? error.message : '登录失败，请重试');} finally {setBusy(false);}
  }
  if(!ready) return <main className="auth-screen"><section className="card">正在读取登录状态…</section></main>;
  if(session) return <><div className="account-bar"><span>私人云端保存</span><button onClick={()=>backend.auth.signOut()}>退出登录</button></div>{children}</>;
  return <main className="auth-screen"><section className="card"><span className="eyebrow">简练</span><h1>你的私人训练空间</h1><p>使用邮箱登录，手机和电脑共用训练记录。</p><p className="fine">不需要 ChatGPT 登录。训练记录和照片仅对你自己的账号开放。</p><form onSubmit={event=>{event.preventDefault();void login();}}><label className="field">邮箱<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>{passwordMode&&<label className="field">密码<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>}<button className="primary" disabled={busy}>{busy?'正在连接…':passwordMode?'登录':'发送登录邮件'}</button></form><button className="text-button" onClick={()=>{setPasswordMode(!passwordMode);setNotice('');}}>{passwordMode?'改用邮箱登录链接':'已有简练密码？使用密码登录'}</button>{notice&&<p role="status" className="callout">{notice}</p>}<p className="fine">首次迁移尚未完成时，登录后可能暂时没有旧记录。</p></section></main>;
}
export function PrivatePhoto({photoKey,alt}:{photoKey:string;alt:string}) {
  const [url,setUrl]=useState('');const [error,setError]=useState(false);
  useEffect(()=>{let alive=true;async function load(){try{const result=await signedPhoto(photoKey);if(alive){setUrl(result);setError(false);}}catch{if(alive)setError(true);}}void load();const timer=setInterval(load,50*60*1000);return()=>{alive=false;clearInterval(timer);};},[photoKey]);
  return url&&!error?<img src={url} alt={alt} onError={()=>setError(true)}/>:<span className="fine">{error?'照片读取失败':'正在读取照片…'}</span>;
}
