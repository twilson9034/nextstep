import React, {useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, Json} from './database.types';
import {ChildInvite} from './ChildAccount';
import {ManageDevices} from './ManagedDevice';
import {defaults, Personalization, type Preferences} from './Personalization';

type Child = Database['public']['Tables']['ns_children']['Row'];
type Settings = Partial<Preferences> & {modules?:string[]};
type Snapshot = {preferences:Settings; revision:number};
const sections = ['Set up child access','Brain Style','Strengths','Decision-Making Support','Modules & Assistance','Parental Controls','Connected devices'] as const;
type Section = typeof sections[number];
const editors: Partial<Record<Section,string>> = {
  'Brain Style':'My Brain Style',Strengths:'My Strengths','Decision-Making Support':'Decision-Making Support','Modules & Assistance':'My Assistance'
};

export function ChildSettings({client,child,refresh,back}:{client:SupabaseClient<Database>;child:Child;refresh:()=>Promise<void>;back:()=>void}) {
  const [section,setSection]=useState<Section|null>(null);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Settings>({});
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  async function load(){
    const result=await client.rpc('ns_parent_child_setup',{profile:child.id});
    if(result.error){setStatus(result.error.message);return}
    setSnapshot(result.data as unknown as Snapshot);setDraft({});
  }
  useEffect(()=>{void load()},[client,child.id]);
  function change(patch:Settings){setDraft(old=>({...old,...patch}));setStatus('Unsaved changes')}
  function navigate(next:Section|null){
    if(Object.keys(draft).length&&!confirm('Discard unsaved changes?'))return;
    setDraft({});setSection(next);setStatus('');
  }
  async function save(){
    if(!snapshot)return;
    setBusy(true);
    try{
      const result=await client.rpc('ns_parent_child_setup',{profile:child.id,changes:draft as Json,expected_revision:snapshot.revision});
      if(result.error)throw result.error;
      setSnapshot(result.data as unknown as Snapshot);setDraft({});setStatus('Settings saved');
    }catch(e){setStatus((e as Error).message)}finally{setBusy(false)}
  }
  const value={...defaults(),...snapshot?.preferences,...draft};
  const editor=section&&editors[section];
  return <section className="child-settings">
    <button disabled={busy} onClick={()=>section?navigate(null):back()}>← {section?child.display_name:'Managed children'}</button>
    <h2>{section||child.display_name}</h2>
    <p>{section?child.display_name+' · ':''}{child.age_group.replace('_',' ')} · {child.linked_user?'Email account linked':child.invite_email?'Email invitation pending':'No linked email account'}</p>
    {!section&&<div className="child-settings-menu">{sections.map(s=><button key={s} onClick={()=>navigate(s)}>{s}<span aria-hidden="true">›</span></button>)}</div>}
    {section==='Set up child access'&&<><ManageDevices client={client} profile={child.id}/><ChildInvite client={client} child={child} refresh={refresh}/></>}
    {section==='Connected devices'&&<ManageDevices client={client} profile={child.id} listOnly/>}
    {section==='Parental Controls'&&<label className="toggle"><input type="checkbox" checked={child.may_edit_setup} disabled={busy} onChange={async e=>{
      setBusy(true);
      try{
        const r=await client.from('ns_children').update({may_edit_setup:e.target.checked}).eq('id',child.id).select('id').single();
        if(r.error)throw r.error;await refresh();setStatus('Permission saved');
      }catch(err){setStatus((err as Error).message)}finally{setBusy(false)}
    }}/>Allow {child.display_name} to edit personalization</label>}
    {editor&&snapshot&&<fieldset disabled={busy}>
      {section==='Modules & Assistance'&&<label className="toggle"><input type="checkbox" checked={(value.modules??['Tasks']).includes('Tasks')} onChange={e=>change({modules:e.target.checked?['Tasks']:[]})}/>Show assigned tasks on paired devices</label>}
      <Personalization section={editor} value={value} modules={['Tasks']} enabled={value.modules??['Tasks']} setEnabled={modules=>change({modules})} change={change}/>
      <button disabled={!Object.keys(draft).length} onClick={()=>void save()}>Save settings</button>
    </fieldset>}
    {status&&<p role="status">{status}</p>}
    {editor&&(!snapshot||status.includes('Reload'))&&<button onClick={()=>{setStatus('');void load()}}>Reload settings</button>}
  </section>;
}
