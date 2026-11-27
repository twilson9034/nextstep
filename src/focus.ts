export type FocusClock={remaining:number;endsAt:number|null};
export type ParkedThought={id:string;text:string};
export const initialClock:FocusClock={remaining:0,endsAt:null};
export function remainingSeconds(clock:FocusClock,now=Date.now()){return clock.endsAt===null?Math.max(0,clock.remaining):Math.max(0,Math.ceil((clock.endsAt-now)/1000))}
export function startClock(minutes:number,now=Date.now()):FocusClock{const remaining=Math.max(1,Math.min(60,Math.trunc(minutes)||5))*60;return {remaining,endsAt:now+remaining*1000}}
export function pauseClock(clock:FocusClock,now=Date.now()):FocusClock{return {remaining:remainingSeconds(clock,now),endsAt:null}}
export function resumeClock(clock:FocusClock,now=Date.now()):FocusClock{const remaining=remainingSeconds(clock,now);return {remaining,endsAt:remaining>0?now+remaining*1000:null}}
export function eligibleNow(task:{repeat_rule?:string;due_date?:string|null},today:string){return !task.repeat_rule||task.repeat_rule==='none'||!task.due_date||task.due_date<=today}
export function focusTarget<T extends {id:string;done:boolean}>(tasks:T[],active:string){return tasks.find(t=>t.id===active&&!t.done)||null}
