import {readCrossbar} from './feed.ts';
const cors={'Access-Control-Allow-Origin':'https://twilson9034.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
// Bounded per-isolate throttling; platform-level JWT verification also enabled.
const recent=new Map<string,number>();
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const auth=req.headers.get('authorization');
 if(!auth?.startsWith('Bearer '))return reply({error:'Sign in to NextStep first.'},401);
 try{
  const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const headers={Authorization:auth,apikey:key};
  const check=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(5000)});
  if(!check.ok)return reply({error:'Sign in to NextStep first.'},401);
  const user=await check.json();if(!user.id||user.is_anonymous)return reply({error:'Sign in to NextStep first.'},401);
  const connections=await fetch(base+'/rest/v1/rpc/ns_child_connections',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
  if(!connections.ok)return reply({error:'Unable to verify account access.'},403);
  const profiles=await connections.json();if(!Array.isArray(profiles)||profiles.some(p=>p.linked))return reply({error:'An adult account must import calendars.'},403);
  const now=Date.now();for(const [id,time] of recent)if(now-time>60000)recent.delete(id);
  if(recent.size>=2000||now-(recent.get(user.id)||0)<5000)return reply({error:'Please try again in a few seconds.'},429);
  recent.set(user.id,now);
  const reader=req.body?.getReader();if(!reader)return reply({error:'Calendar link required.'},400);
  let bytes=0,body='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return reply({error:'Request too large.'},413)}body+=decoder.decode(value,{stream:true})}body+=decoder.decode()}finally{reader.releaseLock()}
  const {url}=JSON.parse(body);
  // No credentials, tokens or URLs are logged by the application.
  const ics=await readCrossbar(url);
  return reply({ics});
 }catch(e){const message=e instanceof Error&&/^(Invalid Crossbar|Use the Crossbar|Crossbar returned|Crossbar did not|Calendar exceeds|Unable to read Crossbar)/.test(e.message)?e.message:'Unable to fetch Crossbar calendar. Check the feed link and try again.';return reply({error:message},400)}
});
