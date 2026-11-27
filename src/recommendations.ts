import type {Database} from './database.types';
type Task=Database['public']['Tables']['ns_tasks']['Row'];
export function localDay(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export function rankTasks(tasks:Task[],userId:string|null,energy:string,mode:string,today=localDay(),limited=false){
const next=new Date(Number(today.slice(0,4)),Number(today.slice(5,7))-1,Number(today.slice(8,10))+7);const week=localDay(next);
return tasks.filter(t=>!t.done&&t.creator_id===(userId||'guest')&&!t.assignee_child&&(!t.assignee_user||t.assignee_user===userId)).map(t=>{
const overdue=!!t.due_date&&t.due_date<today, due= t.due_date===today, upcoming=!!t.due_date&&t.due_date>today&&t.due_date<=week;
let score=overdue?100:due?80:upcoming?20:0;score+=t.priority==='high'?30:t.priority==='low'?0:10;
const effort=t.effort||null;const match=energy==='Low'?effort==='light':energy==='High'?effort==='demanding':effort==='moderate';
if(energy!=='Unspecified'&&match)score+=mode==='Adaptive'?45:25;if(limited&&effort==='light')score+=35;if(limited&&effort==='demanding')score-=35;if(energy==='Low'&&effort==='demanding')score-=mode==='Adaptive'?65:40;
return {task:t,score,urgency:overdue?2:due?1:0,reason:[overdue?'Overdue':due?'Due today':upcoming?'Due within seven days':'',t.priority==='high'?'High priority':'',energy!=='Unspecified'&&match?'Fits your energy':!effort?'Effort not specified':energy==='Low'&&effort==='demanding'?'May need more energy':''].filter(Boolean).join(' · ')||'Available task'};
}).sort((a,b)=>b.urgency-a.urgency||b.score-a.score||(a.task.due_date||'9999').localeCompare(b.task.due_date||'9999')||a.task.created_at.localeCompare(b.task.created_at)||a.task.id.localeCompare(b.task.id))}
