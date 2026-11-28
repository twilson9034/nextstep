import {dateInZone} from './subscription.ts';
import ICAL from 'ical.js';
import {dayKey,shiftDay} from './calendar.ts';
type Time=InstanceType<typeof ICAL.Time>;
type Event=InstanceType<typeof ICAL.Event>;
export const MAX_ICS_BYTES=2*1024*1024;
export type ImportEvent={key:string;title:string;event_date:string;start_time:string|null;end_time:string|null;location:string;notes:string};
export type ImportPreview={events:ImportEvent[];warnings:string[];skipped:number};
const pad=(n:number)=>String(n).padStart(2,'0');
function civil(t:Time,timezone?:string){
 if(t.isDate||t.zone.tzid==='floating')return {day:t.year+'-'+pad(t.month)+'-'+pad(t.day),time:t.isDate?null:pad(t.hour)+':'+pad(t.minute)};
 const d=t.toJSDate();if(!Number.isFinite(d.getTime()))throw Error('Invalid date');
 return timezone?dateInZone(d,timezone):{day:dayKey(d),time:pad(d.getHours())+':'+pad(d.getMinutes())};
}
export function normalizeFeedUrl(value:string){
 const u=new URL(value.trim().replace(/^webcal:\/\//i,'https://'));
 if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Use an HTTPS or webcal calendar link without embedded credentials.');
 return u.href;
}
export async function fetchCalendarFile(value:string){
 const url=normalizeFeedUrl(value);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:controller.signal});
  if(!r.ok||!r.body)throw Error('Unable to read calendar link.');
  if(Number(r.headers.get('content-length')||0)>MAX_ICS_BYTES)throw Error('Calendar exceeds 2 MB.');
  const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_ICS_BYTES){await reader.cancel();throw Error('Calendar exceeds 2 MB.')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength}return new TextDecoder().decode(bytes)
 }finally{clearTimeout(timeout)}
}
export async function importId(owner:string,key:string){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['nextstep-ics-v1',owner,key]))));
 bytes[6]=(bytes[6]&15)|0x80;bytes[8]=(bytes[8]&63)|0x80;
 const h=Array.from(bytes.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)
}
export function parseCalendar(text:string,today=dayKey(new Date()),timezone?:string):ImportPreview{
 if(new TextEncoder().encode(text).length>MAX_ICS_BYTES)throw Error('Calendar exceeds 2 MB.');
 const root=new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/,'')));
 if(root.name!=='vcalendar')throw Error('Expected an iCalendar (.ics) file.');
 const warnings=new Set<string>(),events=new Map<string,ImportEvent>();let skipped=0,iterations=0;
 const skip=(message:string)=>{skipped++;warnings.add(message)};
 const lower=shiftDay(today,-31),upper=shiftDay(today,365);
 const parts=root.getAllSubcomponents('vevent');
 if(parts.length>5000)throw Error('Calendar has too many events. Export a smaller calendar.');
 ICAL.TimezoneService.reset();
 try{
  for(const comp of root.getAllSubcomponents('vtimezone')){const tz=new ICAL.Timezone(comp);ICAL.TimezoneService.register(tz)}
  const groups=new Map<string,typeof parts>();
  for(const p of parts){const uid=String(p.getFirstPropertyValue('uid')||'');if(!uid){skip('Events without a unique ID were skipped.');continue}const g=groups.get(uid)||[];g.push(p);groups.set(uid,g)}
  const supportedZones=(comp:typeof parts[number])=>['dtstart','dtend','recurrence-id','rdate','exdate'].every(n=>comp.getAllProperties(n).every(p=>{const z=p.getParameter('tzid');return !z||typeof z==='string'&&ICAL.TimezoneService.has(z)}));
  function add(event:Event,start:Time,end:Time,key:string){
   if(String(event.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED')return;
   const a=civil(start,timezone),b=civil(end,timezone);
   if(a.day<lower||a.day>upper)return;
   if(start.isDate!==end.isDate||start.isDate&&b.day!==a.day&&b.day!==shiftDay(a.day,1)||!start.isDate&&b.day!==a.day){skip('Multi-day and overnight events were skipped; the native calendar currently supports single-day events.');return}
   const title=String(event.summary||'Untitled event').trim().slice(0,200)||'Untitled event';
   if(events.size>=500&&!events.has(key)){warnings.add('Preview limited to 500 occurrences. Export a smaller date range for the remainder.');return}
   events.set(key,{key,title,event_date:a.day,start_time:a.time,end_time:a.time&&b.time&&b.time>a.time?b.time:null,location:String(event.location||'').slice(0,300),notes:String(event.description||'').slice(0,2000)});
  }
  for(const [uid,group] of groups){
   if(events.size>=500){warnings.add('Preview limited to 500 occurrences.');break}
   try{
    if(group.some(p=>!supportedZones(p))){skip('An event used a time zone without a supplied definition. Export with time zone data to avoid incorrect times.');continue}
    const masters=group.filter(p=>!p.hasProperty('recurrence-id'));
    if(masters.length!==1){skip('Unmatched or duplicate recurring event definitions were skipped.');continue}
    const comp=masters[0],event=new ICAL.Event(comp);
    if(!comp.hasProperty('dtstart')){skip('Events without a start date were skipped.');continue}
    if(String(comp.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED')continue;
    if(!event.isRecurring()){add(event,event.startDate,event.endDate,JSON.stringify([uid]));continue}
    const rule=comp.getFirstPropertyValue('rrule') as {freq?:string}|null;
    if(rule?.freq&&!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(rule.freq)){skip('High-frequency recurrence was skipped.');continue}
    const exceptions=group.filter(p=>p.hasProperty('recurrence-id'));
    if(exceptions.some(p=>p.getFirstProperty('recurrence-id')?.getParameter('range'))){skip('Recurring series with range changes were skipped.');continue}
    for(const exception of exceptions)event.relateException(new ICAL.Event(exception));
    const iterator=event.iterator();let next:Time|null;
    // Limit work for old and pathological recurring series.
    while((next=iterator.next())){
     if(++iterations>20000){warnings.add('Recurrence expansion limit reached. Export a smaller date range.');break}
     if(civil(next,timezone).day>shiftDay(upper,7))break;
     const occurrence=event.getOccurrenceDetails(next);
     add(occurrence.item,occurrence.startDate,occurrence.endDate,JSON.stringify([uid,next.toString()]));
     if(events.size>=500)break;
    }
    if(iterations>20000)break;
   }catch{skip('One or more invalid or unsupported event definitions were skipped.')}
  }
 }finally{ICAL.TimezoneService.reset()}
 return {events:[...events.values()].sort((a,b)=>a.event_date.localeCompare(b.event_date)||(a.start_time||'').localeCompare(b.start_time||'')||a.title.localeCompare(b.title)),warnings:[...warnings],skipped}
}
