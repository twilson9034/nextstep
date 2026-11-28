export const todayKeys=['energy','next','calendar','attention','brain','focus','pace','tasks'] as const;
export type TodayKey=typeof todayKeys[number];
export type TodayMode='compact'|'expanded'|'hidden';
export const todayLabels:Record<TodayKey,string>={energy:'Readiness check-in',next:'Next step',calendar:'Coming up',attention:'Needs attention',brain:'Brain dump',focus:'Focus',pace:'Take a break',tasks:'Task list'};
export function migrateToday(keys:string[]){return [...new Set([...keys.filter(k=>todayKeys.includes(k as TodayKey)),...['calendar','focus','pace']])]}
export function todayMode(key:string,enabled:string[],modes:Record<string,TodayMode>):TodayMode{return enabled.includes(key)?modes[key]||'compact':'hidden'}
export function actionKind(paused:boolean,quick:boolean,hasNext:boolean){return paused?'rest':quick?'small-win':hasNext?'next':'none'}
export function nextActivity<T extends {kind:string;day:string;time:string|null;end:string|null}>(items:T[],today:string,time:string){return items.find(i=>i.kind==='event'&&(i.day>today||i.day===today&&(!i.time||(i.end||i.time).slice(0,5)>=time)))||null}
