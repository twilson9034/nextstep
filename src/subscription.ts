export type Provider='crossbar'|'icloud';
export function normalizeSubscriptionLink(input:string):{provider:Provider;url:string}{
 const u=new URL(input.trim().replace(/^webcal:\/\//i,'https://'));
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href.length>4096)throw Error('Use an HTTPS or webcal feed link.');
 if(/^p[0-9]{1,4}-caldav\.icloud\.com$/.test(u.hostname)&&/^\/published\/[0-9]+\/[A-Za-z0-9_~.=%+-]+\/?$/.test(u.pathname))return {provider:'icloud',url:u.href};
 if(/^\/calendar\/ical\/[0-9]+\/?$/.test(u.pathname))return {provider:'crossbar',url:new URL(u.pathname.replace(/\/$/,'')+u.search,'https://accounts.crossbar.org').href};
 throw Error('Saved subscriptions currently support Crossbar and published iCloud feeds.');
}
export function dueForRefresh(last:string|null,now=Date.now()){return !last||now-Date.parse(last)>=15*60*1000}
export function completeSnapshot(p:{events:unknown[];warnings:string[];skipped:number}){return p.events.length<500&&p.warnings.length===0&&p.skipped===0}
export function dateInZone(date:Date,timezone:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const v=(key:string)=>parts.find(p=>p.type===key)?.value||'';return {day:v('year')+'-'+v('month')+'-'+v('day'),time:v('hour')+':'+v('minute')}}
