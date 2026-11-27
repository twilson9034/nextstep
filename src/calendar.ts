export type CalendarEvent={id:string;title:string;event_date:string;start_time:string|null;end_time:string|null;location:string;notes:string};
export type DueTask={id:string;title:string;due_date?:string|null;done:boolean};
export type CalendarItem={id:string;title:string;day:string;time:string|null;end:string|null;kind:'event'|'task';location:string;notes:string};
export function dayKey(d:Date){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export function parseDay(s:string){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
export function shiftDay(s:string,days:number){const d=parseDay(s);d.setDate(d.getDate()+days);return dayKey(d)}
export function shiftMonth(s:string,n:number){const d=parseDay(s);return dayKey(new Date(d.getFullYear(),d.getMonth()+n,1,12))}
export function monthCells(s:string){const d=parseDay(s),first=dayKey(new Date(d.getFullYear(),d.getMonth(),1,12));const start=shiftDay(first,-parseDay(first).getDay());return Array.from({length:42},(_,i)=>shiftDay(start,i))}
export function itemsFor(events:CalendarEvent[],tasks:DueTask[]):CalendarItem[]{return [...events.map(e=>({id:e.id,title:e.title,day:e.event_date,time:e.start_time,end:e.end_time,kind:'event' as const,location:e.location,notes:e.notes})),...tasks.filter(t=>!t.done&&t.due_date).map(t=>({id:t.id,title:t.title,day:t.due_date!,time:null,end:null,kind:'task' as const,location:'',notes:''}))].sort((a,b)=>a.day.localeCompare(b.day)||(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title))}
export function upcoming(items:CalendarItem[],today:string,days=7){return items.filter(i=>i.day>=today&&i.day<=shiftDay(today,days-1))}
export function validTimes(start:string,end:string){return !end||!!start&&end>start}
export function timeLabel(t:string|null){if(!t)return 'All day';const [h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM')}
