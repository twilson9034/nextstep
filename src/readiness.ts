export type Energy='Low'|'Normal'|'High';
export type Capacity='Limited'|'Steady'|'High';
export const feelings=['Calm','Motivated','Overwhelmed','Anxious','Distracted','Frustrated','Unmotivated','Not sure'] as const;
export type Feeling=typeof feelings[number];
export type Readiness={energy:Energy|null;capacity:Capacity|null;feelings:Feeling[];checkedAt:number};
export const expiryMs=6*60*60*1000;
export function currentReadiness(value:Readiness|null,now=Date.now()){return value&&now>=value.checkedAt&&now-value.checkedAt<expiryMs?value:null}
export function readinessSupport(value:Readiness|null){
 const f=value?.feelings||[],limited=value?.capacity==='Limited'||f.includes('Overwhelmed'),gentle=limited||f.includes('Anxious')||f.includes('Frustrated'),distracted=f.includes('Distracted'),lowEnergy=value?.energy==='Low';
 return {limited,gentle,distracted,lowEnergy,reduceChoices:limited||f.includes('Anxious'),energy:value?.energy||'Unspecified',preferLight:limited||lowEnergy};
}
export function supportMessage(value:Readiness|null,child=false){
 const s=readinessSupport(value);
 if(s.limited)return child?'One little step is enough to start. You can see all your jobs whenever you want.':'Focus on one manageable action. All tasks and deadlines remain available.';
 if(s.gentle)return child?'You can take your time. Try one thing at a time.':'Use a simple approach and gentle guidance. No extra pressure.';
 if(s.distracted)return child?'Keep going with the step you are on.':'Keep the current action visible and reduce switching.';
 if(s.lowEnergy)return child?'Try a small job, or take a break if you need one.':'Prefer lighter work where practical, without hiding urgent tasks.';
 return child?'Keep going at your own pace.':'Continue with your usual support preferences.';
}
