export type Pace='normal'|'low'|'recovery';
export type RecoveryState={pace:Pace;paused:boolean;quickWin:boolean;startedAt:number};
export const initialRecovery:RecoveryState={pace:'normal',paused:false,quickWin:false,startedAt:0};
export const recoveryExpiry=6*60*60*1000;
export function currentRecovery(s:RecoveryState,now=Date.now()):RecoveryState{return s.startedAt>0&&now>=s.startedAt&&now-s.startedAt<recoveryExpiry?s:initialRecovery}
export function choosePace(pace:Pace,now=Date.now()):RecoveryState{return pace==='normal'?initialRecovery:{pace,paused:false,quickWin:true,startedAt:now}}
export type SmallStep={id:string;title:string;done:boolean};
export type SmallAction<T>={task:T;step:SmallStep|null};
// Only an existing unfinished step, or an explicitly light task without steps, qualifies.
// Restrict adult choices to the highest urgency group, and never infer effort from a title.
export function smallAction<T extends {done:boolean;effort?:string|null}>(tasks:T[],steps:(task:T)=>SmallStep[],allowLight=true):SmallAction<T>|null{
 for(const task of tasks){if(task.done)continue;const parts=steps(task);const step=parts.find(s=>!s.done);if(step)return {task,step};if(allowLight&&!parts.length&&task.effort==='light')return {task,step:null}}
 return null
}
export function urgentPool<T>(ranked:{task:T;urgency:number}[]):T[]{return ranked.length?ranked.filter(r=>r.urgency===ranked[0].urgency).map(r=>r.task):[]}
