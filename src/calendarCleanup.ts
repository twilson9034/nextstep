// Earlier one-time ICS imports used deterministic UUID v8 IDs.
// Manual events use random UUID v4; subscription events use separate IDs.
export type CleanupEvent={id:string;creator_id:string;subscription_id?:string|null;source_key?:string|null;source_name?:string|null;title:string;event_date:string;start_time:string|null;end_time:string|null;location:string;notes:string;household_id:string|null;child_id:string|null;revision:number;created_at:string};
export function isOneTimeImport(event:CleanupEvent,owner:string){
 return event.creator_id===owner&&!event.subscription_id&&/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id);
}
export type Candidate<T extends CleanupEvent>={event:T;matches:T[];recommended:boolean};
export async function findImportCopies<T extends CleanupEvent>(events:T[],owner:string,legacyId:(owner:string,key:string)=>Promise<string>):Promise<Candidate<T>[]>{
 const matched=new Map<string,T[]>();
 await Promise.all(events.filter(e=>e.creator_id===owner&&e.subscription_id&&e.source_key).map(async e=>{const id=await legacyId(owner,e.source_key!);matched.set(id,[...(matched.get(id)||[]),e])}));
 return events.filter(e=>isOneTimeImport(e,owner)).map(event=>{
  const matches=matched.get(event.id)||[];
  // Only preselect an unedited copy when a matching linked occurrence has identical sharing.
  const recommended=event.revision===0&&matches.some(m=>m.household_id===event.household_id&&m.child_id===event.child_id);
  return {event,matches,recommended};
 }).sort((a,b)=>Number(b.recommended)-Number(a.recommended)||Number(b.matches.length>0)-Number(a.matches.length>0)||a.event.event_date.localeCompare(b.event.event_date)||a.event.title.localeCompare(b.event.title));
}
