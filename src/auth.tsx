import {useEffect,useState,type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {backend,signedPhoto} from './backend';

function authMessage(error: unknown) {
  const text=error instanceof Error?error.message:String(error);
  if(text.includes('Invalid login credentials')) return '邮箱或密码不正确。如果还没设置简练密码，请点“首次使用 / 忘记密码”。';
  if(text.includes('Failed to fetch')) return '连接登录服务失败，请检查网络后重试。';
  if(text.includes('Email rate limit exceeded')||text.includes('For security purposes')) return '邮件发送过于频繁，请稍后再试，也可以使用已设置的密码登录。';
  return text;
}

function PasswordForm({hasPassword,onDone,onCancel}:{hasPassword:boolean;onDone:()=>void;onCancel:()=>void}) {
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  async function savePassword() {
    if(password!==confirmation){setNotice('两次输入的密码不一致');return;}
    setBusy(true);setNotice('');
    try {
      const result=await backend.auth.updateUser({password,data:{jianlian_password_set:true}});
      if(result.error) throw result.error;
      setPassword('');setConfirmation('');onDone();
    } catch(error) {setNotice(authMessage(error));} finally {setBusy(false);}
  }
  return <section className="card password-card"><h2>{hasPassword?'修改登录密码':'设置简练登录密码'}</h2><p>设置一次后，其他浏览器和手机可直接用邮箱与此密码登录，无需每次打开邮件。</p><form onSubmit={event=>{event.preventDefault();void savePassword();}}><label className="field">新密码（至少 8 位）<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label className="field">再输入一次新密码<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label><div className="actions"><button className="primary" disabled={busy}>{busy?'正在保存…':'保存登录密码'}</button><button className="text-button" type="button" disabled={busy} onClick={onCancel}>稍后设置</button></div></form>{notice&&<p className="callout" role="status">{notice}</p>}</section>;
}

export function AuthGate({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [passwordMode,setPasswordMode]=useState(true);
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    backend.auth.getSession().then(({data,error})=>{setSession(data.session);setReady(true);if(data.session&&!data.session.user.user_metadata.jianlian_password_set)setShowPassword(true);if(error)setNotice(authMessage(error));}).catch(()=>{setReady(true);setNotice('登录状态读取失败，请刷新重试。');});
    const {data:{subscription}}=backend.auth.onAuthStateChange((event,next)=>{
      setSession(next);
      if(event==='PASSWORD_RECOVERY'||(event==='SIGNED_IN'&&next&&!next.user.user_metadata.jianlian_password_set))setShowPassword(true);
      if(event==='SIGNED_OUT'){setPassword('');setNotice('');}
    });
    return ()=>subscription.unsubscribe();
  },[]);
  async function login() {
    setBusy(true);setNotice('');
    try {
      const result=passwordMode ? await backend.auth.signInWithPassword({email:email.trim(),password}) : await backend.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,location.origin).href}});
      if(result.error) throw result.error;
      setPassword('');
      if(!passwordMode)setNotice('邮件已发送。打开邮件中的登录链接后，在简练页面设置登录密码。以后可直接用邮箱和密码登录。');
    } catch(error) {setNotice(authMessage(error));} finally {setBusy(false);}
  }
  if(!ready) return <main className="auth-screen"><section className="card">正在读取登录状态…</section></main>;
  if(session) return <><div className="account-bar"><span>私人云端保存</span><button onClick={()=>{setShowPassword(!showPassword);setNotice('');}}>设置登录密码</button><button onClick={()=>backend.auth.signOut()}>退出登录</button></div>{showPassword&&<div className="password-wrap"><PasswordForm hasPassword={Boolean(session.user.user_metadata.jianlian_password_set)} onDone={()=>{setShowPassword(false);setNotice('密码已设置。以后直接打开网址，用邮箱和密码登录即可。');}} onCancel={()=>setShowPassword(false)}/></div>}{notice&&<p className="account-notice" role="status">{notice}</p>}{children}</>;
  return <main className="auth-screen"><section className="card"><span className="eyebrow">简练</span><h1>你的私人训练空间</h1><p>使用邮箱和简练密码登录，手机和电脑共用训练记录。</p><p className="fine">同一浏览器会保留登录状态。微信内置浏览器、Chrome 和邮箱打开的浏览器，各自保存自己的登录状态。</p><form onSubmit={event=>{event.preventDefault();void login();}}><label className="field">邮箱<input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label>{passwordMode&&<label className="field">简练密码<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>}<button className="primary" disabled={busy}>{busy?'正在连接…':passwordMode?'登录':'发送设置密码邮件'}</button></form><button className="text-button" onClick={()=>{setPasswordMode(!passwordMode);setPassword('');setNotice('');}}>{passwordMode?'首次使用 / 忘记密码':'返回邮箱密码登录'}</button>{!passwordMode&&<p className="fine">先通过邮箱确认本人身份，进入简练后设置新密码；之后不必再通过邮件打开。</p>}{notice&&<p role="status" className="callout">{notice}</p>}</section></main>;
}
export function PrivatePhoto({photoKey,alt}:{photoKey:string;alt:string}) {
  const [url,setUrl]=useState('');const [error,setError]=useState(false);
  useEffect(()=>{let alive=true;async function load(){try{const result=await signedPhoto(photoKey);if(alive){setUrl(result);setError(false);}}catch{if(alive)setError(true);}}void load();const timer=setInterval(load,50*60*1000);return()=>{alive=false;clearInterval(timer);};},[photoKey]);
  return url&&!error?<img src={url} alt={alt} onError={()=>setError(true)}/>:<span className="fine">{error?'照片读取失败':'正在读取照片…'}</span>;
}
