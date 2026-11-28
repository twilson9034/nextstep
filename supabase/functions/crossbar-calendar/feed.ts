// Crossbar only: never make an arbitrary user-supplied host a server-side destination.
const allowedHosts=new Set(['accounts.crossbar.org','www.accounts.crossbar.org']);
export const maxBytes=2*1024*1024;
export function crossbarUrl(input:string):URL{
 if(typeof input!=='string'||input.length>4096)throw Error('Invalid Crossbar link.');
 const u=new URL(input.trim().replace(/^webcal:\/\//i,'https://'));
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!/^\/calendar\/ical\/[0-9]+\/?$/.test(u.pathname))throw Error('Use the Crossbar Family Calendar Feed link.');
 // The user explicitly selected Crossbar. Club-branded links use the same feed path.
 return new URL(u.pathname+u.search,'https://accounts.crossbar.org');
}
export function redirectTarget(current:URL,location:string):URL{
 const u=new URL(location,current);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!allowedHosts.has(u.hostname)||!/^\/calendar\/ical\/[0-9]+\/?$/.test(u.pathname))throw Error('Crossbar returned an unsupported redirect.');
 return u;
}
export async function readCrossbar(input:string,fetcher:typeof fetch=fetch):Promise<string>{
 let url=crossbarUrl(input);
 const signal=AbortSignal.timeout(12000);
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetcher(url,{method:'GET',redirect:'manual',signal,headers:{Accept:'text/calendar, application/ics, */*;q=0.1'}});
  if([301,302,303,307,308].includes(response.status)){
   const loc=response.headers.get('location');await response.body?.cancel();if(!loc||attempt===3)throw Error('Crossbar returned too many redirects.');url=redirectTarget(url,loc);continue;
  }
  if(!response.ok||!response.body)throw Error('Crossbar did not return a calendar. Check the link in Crossbar.');
  if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body.cancel();throw Error('Calendar exceeds 2 MB.')}
  const reader=response.body.getReader(),decoder=new TextDecoder();let total=0,ics='';
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw Error('Calendar exceeds 2 MB.')}ics+=decoder.decode(value,{stream:true})}ics+=decoder.decode()}finally{reader.releaseLock()}
  if(!/^\s*(?:\uFEFF)?BEGIN:VCALENDAR(?:\r?\n|$)/i.test(ics)||!/\r?\nEND:VCALENDAR\s*$/i.test(ics))throw Error('Crossbar returned a page rather than a calendar. Copy the calendar feed link, not the calendar page.');
  return ics;
 }
 throw Error('Unable to read Crossbar calendar.');
}
