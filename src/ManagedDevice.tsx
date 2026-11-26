import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, Json} from './database.types';
import {defaults, Personalization, type Preferences} from './Personalization';

type Client = SupabaseClient<Database>;
type Device = {id:string; label:string; paired:boolean};
type Setup = Preferences & {modules?:string[]};
type Snapshot = {name:string; preferences:Partial<Setup>; revision:number; tasks:{id:string;title:string;done:boolean}[]};
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

export function ManageDevices({client,profile}:{client:Client;profile:string}) {
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
  return <details onToggle={e=>{if(e.currentTarget.open)void run(list)}}><summary>Set up child access without email</summary>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const {data,error}=await client.rpc('ns_manage_device',{profile_id:profile,action:'issue',label,pin});
      if(error)throw new Error(error.message);
      setCode(data as string);setPin('');await list();
    })}}>
      <label>Device name<input required maxLength={60} placeholder="Kitchen tablet" value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Parent PIN for this device<input required type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)}/></label>
      <small>Use six digits. The PIN lets you leave child mode on this device.</small>
      <button disabled={busy}>Create device code</button>
    </form>
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

export function DeviceWorkspace({client,token}:{client:Client;token:string}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Partial<Setup>>({});
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[pin,setPin]=useState(''),[ended,setEnded]=useState(false);
  const [section,setSection]=useState('');
  function exit(){localStorage.removeItem(deviceKey);location.reload()}
  const load=useCallback(async()=>{
    const {data,error}=await client.rpc('ns_device_workspace',{token});
    if(error){if(error.code==='42501'){setEnded(true);setSnapshot(null)}setStatus(error.message);return}
    setSnapshot(data as unknown as Snapshot);
  },[client,token]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);window.addEventListener('focus',load);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',load)}},[load]);
  const [base,setBase]=useState<number|null>(null);
  const saving=useRef(false);
  async function save(){
    if(base===null || saving.current)return;
    saving.current=true;
    setBusy(true);
    const {data,error}=await client.rpc('ns_device_workspace',{token,changes:draft as Json,expected_revision:base});
    if(error){setStatus(error.message);if(error.code==='42501'){setEnded(true);setSnapshot(null)}}
    else{setSnapshot(data as unknown as Snapshot);setDraft({});setBase(null);setStatus('Progress saved')}
    saving.current=false;setBusy(false);
  }
  useEffect(()=>{
    if(base===null || busy || !snapshot || snapshot.revision!==base)return;
    const timer=setTimeout(()=>void save(),900);
    return ()=>clearTimeout(timer);
  },[draft,base]);
  function change(p:Partial<Setup>){if(!snapshot)return;setBase(old=>old??snapshot.revision);setDraft(old=>({...old,...p}));setStatus('Changes ready to save')}
  const value={...defaults(),...snapshot?.preferences,...draft};
  return <main><h1>{snapshot?.name || 'Child workspace'}</h1>
    {snapshot&&<>{(value.modules??modules).includes('Tasks')&&<section><h2>My assigned tasks</h2>{snapshot.tasks.length?snapshot.tasks.map(t=><p key={t.id}>{t.title}{t.done?' · Completed':''}</p>):<p>No assigned tasks.</p>}</section>}
      <fieldset disabled={busy}><Personalization value={value} change={change} modules={modules} enabled={value.modules??modules} setEnabled={modules=>change({modules})} section={section||undefined}/>
      {['My Brain Style','My Strengths','Decision-Making Support','My Assistance'].map(s=><button key={s} onClick={()=>setSection(s)}>{s}</button>)}
      <button onClick={()=>setSection('')}>Return to setup</button>
      <button disabled={base===null} onClick={()=>void save()}>Save progress</button>
      {base!==null&&snapshot.revision!==base&&<button onClick={()=>{setDraft({});setBase(null);setStatus('Loaded latest settings')}}>Discard my edits and load latest settings</button>}
      </fieldset></>}
    <p role="status">{status}</p>
    {ended?<button onClick={exit}>Return to sign-in</button>:<details><summary>Parent controls</summary>
      <form onSubmit={async e=>{e.preventDefault();const {data,error}=await client.rpc('ns_leave_device',{token,pin});
        if(data===true)exit();else setStatus(error?.message||'PIN unavailable. Check the PIN and try again later.');setPin('')}}>
        <label>Parent PIN<input type="password" required pattern="[0-9]{6}" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)}/></label>
        <button>Disconnect and return to sign-in</button></form></details>}
  </main>;
}
