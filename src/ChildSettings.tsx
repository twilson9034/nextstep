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
const groups=[['ACCOUNT & ACCESS',sections.slice(0,1)],['PERSONALIZATION',sections.slice(1,5)],['MANAGEMENT & SECURITY',sections.slice(5)]] as const;
const descriptions=['Link an account or authorize a device','Individual support needs','Motivation and learning preferences','How to provide guidance','Available features and support levels','Access and permissions','Manage or revoke access'];
const colors=['#60A5FA','#A78BFA','#E9C46A','#5EEAD4','#60A5FA','#E895A7','#5EEAD4'];
const icons=['M15 4a5 5 0 1 0 4 8l3 3-2 2-2-2-2 2-3-3a5 5 0 0 0 2-10z','M12 5c-4-5-10 1-7 5-4 3-1 9 3 8 1 4 4 2 4 0V5zm0 0c4-5 10 1 7 5 4 3 1 9-3 8-1 4-4 2-4 0','M12 2l2 7 7 3-7 2-2 8-2-8-7-2 7-3z','M12 2v20M4 5h12l4 4-4 4H4z','M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z','M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6','M3 3h12v18H3zM17 8h4v13h-4z'];
function ChildIcon({index}:{index:number}){return <svg className="child-menu-icon" viewBox="0 0 24 24" stroke={colors[index]} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[index]}/></svg>}
const editors: Partial<Record<Section,string>> = {
  'Brain Style':'My Brain Style',Strengths:'My Strengths','Decision-Making Support':'Decision-Making Support','Modules & Assistance':'My Assistance'
};

export function ChildSettings({client,child,refresh,back}:{client:SupabaseClient<Database>;child:Child;refresh:()=>Promise<void>;back:()=>void}) {
  const [section,setSection]=useState<Section|null>(null);const [access,setAccess]=useState('');
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
    setDraft({});setSection(next);setAccess('');setStatus('');
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
    <button className="child-back" disabled={busy} onClick={()=>section?navigate(null):back()}>← {section?'Child settings':'Managed children'}</button>
    <h2>{section||"Child settings"}</h2><div className="child-identity"><span className="child-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg></span><div><strong>{child.display_name}</strong><small>{child.age_group.replace("_"," ")} · Managed profile</small><small className="child-link-status">{child.linked_user?"Email account linked":child.invite_email?"Email invitation pending":"No linked email account"}</small></div></div>
    {!section&&groups.map(([label,items])=><div key={label} className="child-menu-group"><small>{label}</small><div className="child-settings-menu">{items.map(s=>{const i=sections.indexOf(s);return <button key={s} onClick={()=>navigate(s)}><ChildIcon index={i}/><span className="child-menu-text"><strong>{s}</strong><small>{descriptions[i]}</small></span><span aria-hidden="true">›</span></button>})}</div></div>)}
    {section==='Set up child access'&&<><p>Choose how your child accesses their existing profile.</p>{[['device','Without email','Pair a tablet, phone or shared device.'],['email','With email','Link your child’s own account.']].map(([id,title,desc])=><button key={id} className="child-access-card" aria-pressed={access===id} onClick={()=>setAccess(id)}><ChildIcon index={id==='device'?6:0}/><span className="child-menu-text"><strong>{title}</strong><small>{desc}</small></span><span>{access===id?'✓':'○'}</span></button>)}{access==='device'&&<ManageDevices client={client} profile={child.id} expanded/>}{access==='email'&&<ChildInvite client={client} child={child} refresh={refresh} expanded/>}</>}
    {section==='Connected devices'&&<ManageDevices client={client} profile={child.id} listOnly/>}
    {section==='Parental Controls'&&<label className="toggle"><input type="checkbox" checked={child.may_edit_setup} disabled={busy} onChange={async e=>{
      setBusy(true);
      try{
        const r=await client.from('ns_children').update({may_edit_setup:e.target.checked}).eq('id',child.id).select('id').single();
        if(r.error)throw r.error;await refresh();setStatus('Permission saved');
      }catch(err){setStatus((err as Error).message)}finally{setBusy(false)}
    }}/>Allow {child.display_name} to edit personalization</label>}
    {editor&&snapshot&&<fieldset disabled={busy}>
      {section==='Modules & Assistance'&&<label className="toggle"><input type="checkbox" checked={(value.modules??['Tasks']).includes('Tasks')} onChange={e=>change({modules:e.target.checked?['Tasks']:[]})}/>Show assigned tasks on all child devices</label>}
      <Personalization managedChild section={editor} value={value} modules={['Tasks']} enabled={value.modules??['Tasks']} setEnabled={modules=>change({modules})} change={change}/>
      <button disabled={!Object.keys(draft).length} onClick={()=>void save()}>Save changes</button>
    </fieldset>}
    {status&&<p role="status">{status}</p>}
    {editor&&(!snapshot||status.includes('Reload'))&&<button onClick={()=>{setStatus('');void load()}}>Reload settings</button>}
  </section>;
}
