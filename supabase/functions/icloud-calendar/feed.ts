// Only Apple's published calendar endpoints are permitted; never forward arbitrary hosts.
export const maxBytes=2*1024*1024;
export function icloudUrl(input:string,base?:URL):URL{
 if(typeof input!=='string'||input.length>4096)throw Error('Invalid iCloud link.');
 let u:URL;try{u=new URL(input.trim().replace(/^webcal:\/\//i,'https://'),base)}catch{throw Error('Invalid iCloud link.')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!/^p[0-9]{1,4}-caldav\.icloud\.com$/.test(u.hostname)||!/^\/published\/[0-9]+\/[A-Za-z0-9_~.=%+-]+\/?$/.test(u.pathname))throw Error('Use an Apple iCloud published calendar link.');
 return u;
}
export async function readICloud(input:string,fetcher:typeof fetch=fetch):Promise<string>{
 let url=icloudUrl(input);
 const signal=AbortSignal.timeout(12000);
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetcher(url,{method:'GET',redirect:'manual',signal,headers:{Accept:'text/calendar, application/ics, */*;q=0.1'}});
  if([301,302,303,307,308].includes(response.status)){
   const loc=response.headers.get('location');await response.body?.cancel();if(!loc||attempt===3)throw Error('iCloud returned too many redirects.');url=icloudUrl(loc,url);continue;
  }
  if(!response.ok||!response.body)throw Error('iCloud did not return a calendar. Check that the existing published calendar link is still active.');
  if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body.cancel();throw Error('Calendar exceeds 2 MB.')}
  const reader=response.body.getReader(),decoder=new TextDecoder();let total=0,ics='';
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw Error('Calendar exceeds 2 MB.')}ics+=decoder.decode(value,{stream:true})}ics+=decoder.decode()}finally{reader.releaseLock()}
  if(!/^\s*(?:\uFEFF)?BEGIN:VCALENDAR(?:\r?\n|$)/i.test(ics)||!/\r?\nEND:VCALENDAR\s*$/i.test(ics))throw Error('iCloud returned a page rather than a calendar. Copy the calendar feed link, not the calendar page.');
  return ics;
 }
 throw Error('Unable to read iCloud calendar.');
}
