import QRCode from 'qrcode';
import {ChildRewards,RewardPreview,type RewardPreviewSnapshot} from './Rewards';
import {Achievements,ChildChallenges,type Achievement,type Challenge} from './FamilyChallenges';
import {AdventureBanner,AdventureEditor,defaultAdventure,type Adventure} from './Adventure';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, Json} from './database.types';
import {defaults, Personalization, type Preferences} from './Personalization';

type Client = SupabaseClient<Database>;
type Device = {id:string; label:string; paired:boolean};
type Setup = Preferences & {modules?:string[]};
type Engagement={gamification_enabled:boolean;rewards_enabled:boolean;xp:number;reward_points:number;level:number;completed_awards:number};
type Snapshot = {reward_preview?:RewardPreviewSnapshot;age_group?:string;achievements?:Achievement[];family_challenges?:Challenge[];family_challenges_allowed?:boolean;adventure?:Adventure;engagement?:Engagement;show_support:boolean;show_completed_tasks:boolean;may_edit_setup:boolean;name:string; preferences:Partial<Setup>; revision:number; tasks:{id:string;title:string;done:boolean;revision:number;definition_of_done:string;subtasks:unknown;reward_points?:number}[]};
export const deviceKey = 'nextstep:managed-device';
const modules = ['Tasks'];

async function pair(client:Client, code:string) {
  const {data,error}=await client.rpc('ns_pair_device',{code:code.replace(/[\s-]/g,'').toLowerCase()});
  if(error || !data) throw new Error(error?.message || 'Unable to link device.');
  localStorage.setItem(deviceKey,data);
  if(new URLSearchParams(location.hash.slice(1)).has('pair'))history.replaceState(null,'',location.pathname+location.search);
  location.reload();
}

export function PairDevice({client}:{client:Client}) {
  const [code,setCode]=useState(()=>{const p=new URLSearchParams(location.hash.slice(1));return p.get('pair')||''}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <details open={code?true:undefined}><summary>Connect a child device</summary>
    <form onSubmit={async e=>{
      e.preventDefault();setBusy(true);
      try {await pair(client,code)} catch(error){setMessage((error as Error).message);setBusy(false)}
    }}>
      <label>Code from parent<input required autoCapitalize="none" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label>
      <button disabled={busy}>Link this device</button><p role="status">{message}</p>
    </form></details>;
}

export function ManageDevices({client,profile,listOnly=false,expanded=false}:{client:Client;profile:string;listOnly?:boolean;expanded?:boolean}) {
  const [devices,setDevices]=useState<Device[]>([]),[label,setLabel]=useState(''),[pin,setPin]=useState('');
  const [code,setCode]=useState(''),[qr,setQr]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;setQr('');if(code)void QRCode.toDataURL(location.origin+location.pathname+'#pair='+encodeURIComponent(code),{width:240,margin:3,errorCorrectionLevel:'M'}).then(url=>{if(alive)setQr(url)}).catch(()=>{if(alive)setStatus('QR unavailable; use the manual code.')});return()=>{alive=false}},[code]);
  const list=useCallback(async()=>{
    const {data,error}=await client.rpc('ns_manage_device',{profile_id:profile,action:'list'});
    if(error)throw new Error(error.message);
    setDevices(data as unknown as Device[]);
  },[client,profile]);
  async function run(work:()=>Promise<void>) {
    setBusy(true);setStatus('');
    try {await work()} catch(error){setStatus((error as Error).message)} finally {setBusy(false)}
  }
  return <details open={listOnly||expanded||undefined} onToggle={e=>{if(e.currentTarget.open)void run(list)}}><summary>{listOnly?'Device list':'Set up child access without email'}</summary>
    {!listOnly&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const {data,error}=await client.rpc('ns_manage_device',{profile_id:profile,action:'issue',label,pin});
      if(error)throw new Error(error.message);
      setCode(data as string);setPin('');await list();
    })}}>
      <label>Device name<input required maxLength={60} placeholder="Kitchen tablet" value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Parent PIN for this device<input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)}/></label>
      <small>Use six digits. The PIN lets you leave child mode on this device.</small>
      <button disabled={busy}>Create pairing QR code</button>
    </form>}
    {listOnly&&!devices.length&&!busy&&<p>No devices listed.</p>}
    {code&&<section className="pair-qr"><h3>Scan with your child’s camera</h3>{qr&&<img src={qr} alt="One-time child device pairing QR code" width={240} height={240}/>}<p>Open the scanned link while signed out and confirm the connection. The code works once and expires in 15 minutes.</p><details><summary>Enter code manually instead</summary><p><code>{code.match(/.{4}/g)?.join('-')}</code></p></details>
      <button disabled={busy} onClick={()=>{if(confirm('Sign out of your account on this device and open the child workspace?'))void run(async()=>{
        const result=await client.auth.signOut({scope:'local'});if(result.error)throw result.error;
        try {await pair(client,code)}catch(error){window.alert((error as Error).message)}
      })}}>Use this device for child mode</button></section>}
    {devices.map(d=><p key={d.id}>{d.label} · {d.paired?'Connected':'Awaiting pairing'} <button disabled={busy} onClick={()=>void run(async()=>{
      const {error}=await client.rpc('ns_manage_device',{profile_id:profile,action:'revoke',device_id:d.id});
      if(error)throw error;setCode('');await list();
    })}>Revoke {d.label}</button></p>)}
    <p role="status">{status}</p>
  </details>;
}

export function DeviceWorkspace({client,token,onSignOut,parentPreview,onClosePreview}:{client:Client;token?:string;onSignOut?:()=>void;parentPreview?:string;onClosePreview?:()=>void}) {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Partial<Setup>>({}),[base,setBase]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[pin,setPin]=useState(''),[ended,setEnded]=useState(false),[section,setSection]=useState('');
 const pending=useRef(false),sequence=useRef(0);
 const args=token?{token}:{};
 function exit(){localStorage.removeItem(deviceKey);location.reload()}
 const load=useCallback(async()=>{if(pending.current)return;const seq=++sequence.current;try{
  const {data,error}=parentPreview?await client.rpc('ns_parent_child_preview',{profile:parentPreview}):await client.rpc('ns_child_progress',token?{token}:{});
  if(seq!==sequence.current)return;
  if(error){setSnapshot(null);setStatus(error.message);if(error.code==='42501')setEnded(true);return}
  setSnapshot(data as unknown as Snapshot);setEnded(false);
 }catch{setSnapshot(null);setStatus('Connect to the internet to use your child workspace.')}},[client,token,parentPreview]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),10000);const offline=()=>{sequence.current++;setSnapshot(null);setStatus('Child workspace requires an internet connection.')};window.addEventListener('offline',offline);window.addEventListener('online',load);window.addEventListener('focus',load);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',load);window.removeEventListener('focus',load)}},[load]);
 function change(p:Partial<Setup>){if(parentPreview||!snapshot?.may_edit_setup)return;setBase(old=>old??snapshot.revision);setDraft(old=>({...old,...p}));setStatus('Unsaved changes')}
 async function write(extra:{changes?:Json;expected_revision?:number;task_id?:string;task_revision?:number;step_id?:string;step_done?:boolean},saved:string){if(parentPreview||pending.current)return;pending.current=true;sequence.current++;setBusy(true);try{
   const {data,error}=await client.rpc('ns_child_progress',{...args,...extra});if(error)throw error;
   setSnapshot(data as unknown as Snapshot);if(extra.changes){setDraft({});setBase(null)}setStatus(saved);
 }catch(e){setStatus((e as Error).message||'Unable to save');if((e as {code?:string}).code==='42501'){setSnapshot(null);setStatus('Access or permission changed. Refresh to check.')}}finally{pending.current=false;setBusy(false)}}
 function navigate(next:string){if(base!==null&&!confirm('Discard unsaved changes?'))return;setDraft({});setBase(null);setSection(next);setStatus('')}
 const value={...defaults(),...snapshot?.preferences,...draft};
 const [tab,setTab]=useState('Today'),[menu,setMenu]=useState(false);
 useEffect(()=>{if(snapshot&&!snapshot.show_support&&section&&section!=='Adventure'){setSection('');setDraft({});setBase(null)}},[snapshot?.show_support,section]);
 const next=snapshot?.tasks.find(t=>!t.done);
 const steps=(t:Snapshot['tasks'][number])=>Array.isArray(t.subtasks)?(t.subtasks as {id:string;title:string;done:boolean}[]).filter(s=>typeof s.id==='string'&&typeof s.title==='string'):[];
 const nextSteps=next?steps(next):[],suggested=nextSteps.find(s=>!s.done),assistance=value.overrides.Tasks||value.assistance;
 const complete=(t:Snapshot['tasks'][number])=>{if(steps(t).some(s=>!s.done))return;if(t.definition_of_done&&!confirm('Is the task good enough? '+t.definition_of_done))return;void write({task_id:t.id,task_revision:t.revision},'Great work! Task completed.')};
 const toggle=(t:Snapshot['tasks'][number],s:{id:string;done:boolean})=>void write({task_id:t.id,task_revision:t.revision,step_id:s.id,step_done:!s.done},s.done?'Step reopened':'Great work! Step completed.');
 const list=snapshot?.tasks.filter(t=>tab==='Progress'?t.done:!t.done)||[];
 const icons:Record<string,string>={Rewards:'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C4 8 5 1 9 3c2 1 3 5 3 5s1-4 3-5c4-2 5 5-3 5z',Today:'M3 10 12 3l9 7v10H15v-7H9v7H3z','My Tasks':'m3 6 2 2 4-4M11 6h10M3 13l2 2 4-4M11 13h10M3 20l2 2 4-4M11 20h10',Progress:'M8 3h8v5c0 5-8 5-8 0zM8 5H3v2c0 4 3 5 5 5m8-7h5v2c0 4-3 5-5 5m-4 0v6m-5 3h10M9 18h6',Menu:'M3 5h18M3 12h18M3 19h18'};
 const icon=(n:string)=><svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[n]}/></svg>;
 const support=snapshot?.show_support===true,showProgress=snapshot?.show_completed_tasks===true;const engagement=snapshot?.engagement;const gamified=engagement?.gamification_enabled===true;const rewards=engagement?.rewards_enabled===true;const showEngagement=gamified||rewards;const challenges=snapshot?.family_challenges_allowed?snapshot.family_challenges||[]:[];const hasChallenges=challenges.length>0;const adventure=snapshot?.adventure||defaultAdventure;const canCustomize=!!snapshot&&(!!parentPreview||(gamified&&adventure.allowed));
 useEffect(()=>{if(section==='Adventure'&&!canCustomize)setSection('')},[section,canCustomize]);
 async function saveAdventure(next:Adventure){
 if(!canCustomize||pending.current)throw new Error('Appearance cannot be changed right now');
 pending.current=true;sequence.current++;setBusy(true);
 try{
  if(parentPreview){
   const r=await client.from('ns_children').update({adventure_theme:next.theme,adventure_avatar:next.avatar,adventure_color:next.color,avatar_design:(next.design||{}) as Json,world_design:(next.world||{}) as Json}).eq('id',parentPreview).eq('archived',false).eq('adventure_revision',next.revision).select('adventure_revision').maybeSingle();
   if(r.error)throw new Error(r.error.message);if(!r.data)throw new Error('Appearance changed or access ended. Reload and try again.');
   const revision=r.data.adventure_revision;
   setSnapshot(old=>old?{...old,adventure:{...next,revision}}:old);
  }else{
   const r=await client.rpc('ns_child_world_studio',{...args,theme:next.theme,avatar:next.avatar,color:next.color,design:(next.design||{}) as Json,world:(next.world||{}) as Json,expected_revision:next.revision});
   if(r.error)throw new Error(r.error.message);
   setSnapshot(old=>old?{...old,adventure:r.data as unknown as Adventure}:old);
  }
  setSection('');setStatus('Adventure updated!');
 }finally{pending.current=false;setBusy(false);void load()}
}
 useEffect(()=>{if((tab==='Progress'&&!showProgress&&!showEngagement&&!hasChallenges)||(tab==='Rewards'&&!rewards))setTab('Today')},[tab,showProgress,showEngagement,rewards,hasChallenges]);
 const Content=parentPreview?'div':'main';const Navigation=parentPreview?'div':'nav';
 return <>{parentPreview?<div className="parent-preview-bar"><button type="button" onClick={onClosePreview}>← Child settings</button><small>Parent preview · Appearance editable</small></div>:<header><div className="brand-lockup"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#06B6D4"/><path d="M9 30V23H17V16H25V9H32 M25 9H32V16" fill="none" stroke="#080D17" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg><strong>Next<span>Step</span></strong></div><button className="menu-toggle" aria-label="Child menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}>{icon('Menu')}</button></header>}<Content className="child-dashboard">
 {snapshot&&<><h1>Hi, {snapshot.name}!</h1><p>One step at a time.</p>{parentPreview&&section!=='Adventure'&&<button type="button" className="reward-primary" disabled={busy} onClick={()=>navigate('Adventure')}>Open Avatar Studio</button>}</>}
 {menu&&<section className="child-settings-menu">{canCustomize&&<button onClick={()=>{navigate('Adventure');setMenu(false)}}>Customize my adventure<span>›</span></button>}{support&&['My Brain Style','My Strengths','Decision-Making Support','My Assistance'].map(s=><button key={s} onClick={()=>{navigate(s);setMenu(false)}}>{({'My Brain Style':'What helps me','My Strengths':'Things I like','Decision-Making Support':'Help me choose','My Assistance':'How much help?'} as Record<string,string>)[s]||s}<span>›</span></button>)}{token?<details><summary>Parent controls</summary><form onSubmit={async e=>{e.preventDefault();const {data,error}=await client.rpc('ns_leave_device',{token,pin});if(data===true)exit();else setStatus(error?.message||'PIN unavailable. Check the PIN and try again later.');setPin('')}}><label>Parent PIN<input type="password" required pattern="[0-9]{6}" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)}/></label><button>Disconnect and return to sign-in</button></form></details>:<button onClick={onSignOut}>Sign out</button>}</section>}
 {snapshot&&<>{section==='Adventure'&&canCustomize?<section className="adventure-settings"><button className="child-back" onClick={()=>navigate('')}>← Today</button><h2>{parentPreview?'Customize child adventure':'Customize my adventure'}</h2>{parentPreview&&<p>Changes will update this child’s saved appearance. Tasks and rewards remain read-only.</p>}<AdventureEditor value={adventure} initialTab={parentPreview?'avatar':'world'} onSave={saveAdventure} onCancel={()=>navigate('')}/></section>:section&&support?<section><button className="child-back" onClick={()=>navigate('')}>← Today</button><fieldset disabled={busy||!snapshot.may_edit_setup}><Personalization childAudience="child" ageGroup={snapshot.age_group} value={value} change={change} modules={modules} enabled={value.modules??modules} setEnabled={()=>{}} section={section}/><button disabled={base===null||base!==snapshot.revision} onClick={()=>void write({changes:draft as Json,expected_revision:base!},'Settings saved')}>Save changes</button></fieldset>{!snapshot.may_edit_setup&&<p>Your parent manages these settings.</p>}{base!==null&&snapshot.revision!==base&&<button onClick={()=>{setDraft({});setBase(null)}}>Discard edits and load latest settings</button>}</section>:<>
 {(tab==='Today'||tab==='Progress')&&showEngagement&&engagement&&<section className="engagement-hero">{gamified&&<><AdventureBanner value={adventure} level={engagement.level} edit={canCustomize?()=>navigate('Adventure'):undefined}/><div className="engagement-meter"><span>Level progress</span><strong>{engagement.xp%100}/100 XP</strong></div><progress aria-label="Level progress" max={100} value={engagement.xp%100}/></>}<div className="engagement-stats">{gamified&&<div><small>EXPERIENCE</small><strong>{engagement.xp} XP</strong><span>Lifetime progress</span></div>}{rewards&&<div><small>REWARD POINTS</small><strong>{engagement.reward_points}</strong><span>Available to spend</span></div>}</div></section>}
 {tab==='Today'&&assistance!=='Independent'&&value.behaviors['Show one next step']!==false&&<section className="next-recommendation child-next"><small>YOUR NEXT STEP</small>{next?<><p>{next.title}</p><h2>{suggested?.title||(nextSteps.length?'Review your finished task':next.title)}</h2>{nextSteps.length>0&&<><small>{nextSteps.filter(s=>s.done).length} of {nextSteps.length} steps complete</small><progress max={nextSteps.length} value={nextSteps.filter(s=>s.done).length}/></>}{!suggested&&next.definition_of_done&&<p>Good enough when: {next.definition_of_done}</p>}<button className="child-primary" disabled={!!parentPreview||busy} onClick={()=>suggested?toggle(next,suggested):complete(next)}>{suggested?'Complete this step':'Finish task'} ✓</button></>:<h2>You're all caught up!</h2>}</section>}
 {tab==='Today'&&<ChildChallenges items={challenges} preview/>}
 {tab==='Progress'&&<>{gamified&&<Achievements items={snapshot.achievements||[]} adventure={adventure}/>}<ChildChallenges items={challenges}/></>}
 {tab==='Rewards'&&rewards&&(parentPreview?(snapshot.reward_preview?<RewardPreview data={snapshot.reward_preview}/>:<p>Rewards unavailable.</p>):<ChildRewards client={client} token={token} refresh={()=>void load()}/>)}
 {tab!=='Rewards'&&(tab!=='Progress'||showProgress)&&<section className="child-task-list"><h2>{tab==='Progress'?'Completed tasks':gamified?'My missions':'My tasks'}</h2>{(value.modules??modules).includes('Tasks')?(list.length?list.map(t=>{const all=steps(t);const upcoming=all.find(s=>!s.done);return <article className="child-task" key={t.id}><h3>{t.title}</h3>{!t.done&&showEngagement&&<small className="engagement-award">{gamified?'★ +10 XP on finish':''}{gamified&&rewards&&(t.reward_points??0)>0?' · ':''}{rewards&&(t.reward_points??0)>0?'+'+t.reward_points+' reward points':''}</small>}{all.length>0&&<><small>{all.filter(s=>s.done).length} of {all.length} steps complete</small><progress max={all.length} value={all.filter(s=>s.done).length}/>{all.map(s=><button key={s.id} disabled={!!parentPreview||busy||t.done} className={'child-step '+(s.id===upcoming?.id?'child-step-next':'')} aria-pressed={s.done} onClick={()=>toggle(t,s)}><span className="child-step-check">{s.done?'✓':'○'}</span><span className={s.done?'child-step-done':''}>{s.title}</span>{s.id===upcoming?.id&&<small>{gamified?'Next · XP':'Next'}</small>}</button>)}</>}{t.definition_of_done&&<div className="child-done-definition"><small>GOOD ENOUGH WHEN</small><p>{t.definition_of_done}</p></div>}{t.done?<small>✓ Completed</small>:<button className="child-primary" disabled={!!parentPreview||busy||all.some(s=>!s.done)} onClick={()=>complete(t)}>Finish task</button>}</article>}):<p>{tab==='Progress'?'Your finished tasks will appear here.':'No unfinished tasks.'}</p>):<p>Your parent has turned off Tasks.</p>}</section>}
 </>}</>}
 {!snapshot&&!ended&&<button onClick={()=>void load()}>Retry connection</button>}{ended&&token&&<button onClick={exit}>Return to sign-in</button>}<p role="status">{status}</p>
 </Content><Navigation className={parentPreview?'parent-preview-tabs':'main-tabbar'} aria-label="Child navigation">{['Today','My Tasks',...(showProgress||showEngagement||hasChallenges?['Progress']:[]),...(rewards?['Rewards']:[])].map(n=><button key={n} aria-current={!section&&tab===n?'page':undefined} onClick={()=>{if(base!==null&&!confirm('Discard unsaved changes?'))return;setDraft({});setBase(null);setSection('');setTab(n);setMenu(false)}}>{icon(n)}<span>{n==='My Tasks'&&gamified?'Missions':n}</span></button>)}</Navigation></>;
}
