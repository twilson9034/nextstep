import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, Json} from './database.types';
import {defaults, Personalization, type Preferences} from './Personalization';

type Client = SupabaseClient<Database>;
type Device = {id:string; label:string; paired:boolean};
type Setup = Preferences & {modules?:string[]};
type Snapshot = {may_edit_setup:boolean;name:string; preferences:Partial<Setup>; revision:number; tasks:{id:string;title:string;done:boolean;revision:number;definition_of_done:string;subtasks:unknown}[]};
export const deviceKey = 'nextstep:managed-device';
const modules = ['Tasks'];

async function pair(client:Client, code:string) {
  const {data,error}=await client.rpc('ns_pair_device',{code:code.replace(/[\s-]/g,'').toLowerCase()});
  if(error || !data) throw new Error(error?.message || 'Unable to link device.');
  localStorage.setItem(deviceKey,data);
  location.reload();
}

export function PairDevice({client}:{client:Client}) {
  const [code,setCode]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <details><summary>Use a child device code</summary>
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
  const [code,setCode]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
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
      <button disabled={busy}>Create device code</button>
    </form>}
    {listOnly&&!devices.length&&!busy&&<p>No devices listed.</p>}
    {code&&<section><p>On the child’s device, open NextStep while signed out and select <strong>Use a child device code</strong>. This code works once and expires in 15 minutes.</p>
      <p><code>{code.match(/.{4}/g)?.join('-')}</code></p>
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

export function DeviceWorkspace({client,token,onSignOut}:{client:Client;token?:string;onSignOut?:()=>void}) {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Partial<Setup>>({}),[base,setBase]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[pin,setPin]=useState(''),[ended,setEnded]=useState(false),[section,setSection]=useState('');
 const pending=useRef(false),sequence=useRef(0);
 const args=token?{token}:{};
 function exit(){localStorage.removeItem(deviceKey);location.reload()}
 const load=useCallback(async()=>{if(pending.current)return;const seq=++sequence.current;try{
  const {data,error}=await client.rpc('ns_child_workspace',token?{token}:{});
  if(seq!==sequence.current)return;
  if(error){setSnapshot(null);setStatus(error.message);if(error.code==='42501')setEnded(true);return}
  setSnapshot(data as unknown as Snapshot);setEnded(false);
 }catch{setSnapshot(null);setStatus('Connect to the internet to use your child workspace.')}},[client,token]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),10000);const offline=()=>{sequence.current++;setSnapshot(null);setStatus('Child workspace requires an internet connection.')};window.addEventListener('offline',offline);window.addEventListener('online',load);window.addEventListener('focus',load);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',load);window.removeEventListener('focus',load)}},[load]);
 function change(p:Partial<Setup>){if(!snapshot?.may_edit_setup)return;setBase(old=>old??snapshot.revision);setDraft(old=>({...old,...p}));setStatus('Unsaved changes')}
 async function write(extra:{changes?:Json;expected_revision?:number;task_id?:string;task_revision?:number},saved:string){if(pending.current)return;pending.current=true;sequence.current++;setBusy(true);try{
   const {data,error}=await client.rpc('ns_child_workspace',{...args,...extra});if(error)throw error;
   setSnapshot(data as unknown as Snapshot);if(extra.changes){setDraft({});setBase(null)}setStatus(saved);
 }catch(e){setStatus((e as Error).message||'Unable to save');if((e as {code?:string}).code==='42501'){setSnapshot(null);setStatus('Access or permission changed. Refresh to check.')}}finally{pending.current=false;setBusy(false)}}
 function navigate(next:string){if(base!==null&&!confirm('Discard unsaved changes?'))return;setDraft({});setBase(null);setSection(next);setStatus('')}
 const value={...defaults(),...snapshot?.preferences,...draft};const next=snapshot?.tasks.find(t=>!t.done);const nextSteps=Array.isArray(next?.subtasks)?next.subtasks as {title:string;done:boolean}[]:[];const suggested=nextSteps.find(s=>!s.done);const assistance=value.overrides.Tasks||value.assistance;
 return <><header><strong>Next<span>Step</span></strong><small>Child workspace</small></header><main className="child-settings"><h1>{snapshot?.name||'Child workspace'}</h1>
 {snapshot&&<>{!section?<>{next&&assistance!=='Independent'&&value.behaviors['Show one next step']!==false&&<section className="next-recommendation"><small>YOUR NEXT STEP</small><h2>{next.title}</h2>{suggested&&<p>{suggested.title}</p>}{next.definition_of_done&&<p>Good enough when: {next.definition_of_done}</p>}{value.decisions.includes('Give me a practical default so I can get started')&&<p>Start with the stated action. Improvements can wait.</p>}{value.strengths.includes('Seeing visible progress')&&nextSteps.length>0&&<p>{nextSteps.filter(s=>s.done).length} of {nextSteps.length} steps complete.</p>}</section>}<section><h2>My assigned tasks</h2>{(value.modules??modules).includes('Tasks')?(snapshot.tasks.length?snapshot.tasks.map(t=><div className="child-task" key={t.id}><strong>{t.title}</strong>{Array.isArray(t.subtasks)&&t.subtasks.length>0&&<ul>{(t.subtasks as {id:string;title:string;done:boolean}[]).map(s=><li key={s.id}>{s.done?'✓ ':''}{s.title}</li>)}</ul>}{t.definition_of_done&&<small>Good enough when: {t.definition_of_done}</small>}{t.done?<small>✓ Completed</small>:<button disabled={busy} onClick={()=>{if((t.definition_of_done||Array.isArray(t.subtasks)&&t.subtasks.some((s:{done?:boolean})=>!s.done))&&!confirm('Have you finished the required steps and outcome?'))return;void write({task_id:t.id,task_revision:t.revision},'Task completed')}}>Complete task</button>}</div>):<p>No assigned tasks yet.</p>):<p>Your parent has turned off Tasks.</p>}</section><section><h2>My support</h2><div className="child-settings-menu">{['My Brain Style','My Strengths','Decision-Making Support','My Assistance'].map(s=><button key={s} onClick={()=>navigate(s)}>{s}<span>›</span></button>)}</div></section></>:<section><button className="child-back" onClick={()=>navigate('')}>← My support</button><fieldset disabled={busy||!snapshot.may_edit_setup}><Personalization value={value} change={change} modules={modules} enabled={value.modules??modules} setEnabled={()=>{}} section={section}/><button disabled={base===null||base!==snapshot.revision} onClick={()=>void write({changes:draft as Json,expected_revision:base!},'Settings saved')}>Save changes</button></fieldset>{!snapshot.may_edit_setup&&<p>Your parent manages these settings.</p>}{base!==null&&snapshot.revision!==base&&<button onClick={()=>{setDraft({});setBase(null);setStatus('Loaded latest settings')}}>Discard my edits and load latest settings</button>}</section>}</>}
 {!snapshot&&!ended&&<button onClick={()=>void load()}>Retry connection</button>}<p role="status">{status}</p>
 {token?(ended?<button onClick={exit}>Return to sign-in</button>:<details><summary>Parent controls</summary><form onSubmit={async e=>{e.preventDefault();const {data,error}=await client.rpc('ns_leave_device',{token,pin});if(data===true)exit();else setStatus(error?.message||'PIN unavailable. Check the PIN and try again later.');setPin('')}}><label>Parent PIN<input type="password" required pattern="[0-9]{6}" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)}/></label><button>Disconnect and return to sign-in</button></form></details>):<button onClick={onSignOut}>Sign out</button>}
 </main></>;
}
