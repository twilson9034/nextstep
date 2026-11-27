import type {Adventure} from './Adventure';
import type {Achievement} from './FamilyChallenges';
// Theme presentation is separate from the permanent server milestone IDs and thresholds.
const ids=['first-step','first-mission','step-builder','momentum','level-two','steady-progress','step-master','level-five'];
type ThemeSet={names:string[];icons:string[]};
const sets:Record<string,ThemeSet>={
 hockey:{names:['First Stride','First Goal','Stickhandling Star','On a Roll','Rookie Season','Playoff Ready','Ice Time Hero','All-Star'],icons:['skate','hockey','hockey','zap','jersey','flag','skate','trophy']},
 sports:{names:['First Practice','First Score','Training Star','On a Roll','Rising Athlete','Game Ready','Training Hero','Champion'],icons:['footprints','flag','star','zap','jersey','flag','sparkles','trophy']},
 space:{names:['Lift-Off','First Mission','Star Navigator','Orbit Achieved','Space Cadet','Deep Space Explorer','Galaxy Voyager','Mission Commander'],icons:['rocket','flag','star','orbit','rocket','orbit','sparkles','trophy']},
 fantasy:{names:['Quest Begins','First Quest','Spell Apprentice','Quest Seeker','Rising Knight','Realm Protector','Magic Master','Legend of the Realm'],icons:['shield','flag','sparkles','zap','shield','star','sparkles','trophy']},
 animals:{names:['First Pawprint','Trail Complete','Woodland Explorer','Trail Buddy','Wildlife Friend','Forest Guardian','Master Tracker','Nature Champion'],icons:['paw','flag','paw','zap','star','shield','paw','trophy']},
 builder:{names:['First Brick','First Build','Block Builder','Building Momentum','Apprentice Builder','Master Workshop','Blueprint Hero','Master Builder'],icons:['layers','flag','layers','zap','star','layers','sparkles','trophy']}
};
export function achievementTheme(adventure?:Adventure):string{
 if(!adventure)return 'simple';
 const hockey=adventure.design?.outfit==='hockey'||(!adventure.design?.outfit&&adventure.avatar==='athlete');
 if(hockey&&(adventure.theme==='sports'||adventure.theme==='simple'))return 'hockey';
 return adventure.theme;
}
export function themedAchievement(item:Achievement,adventure?:Adventure):Achievement{
 const set=sets[achievementTheme(adventure)],i=ids.indexOf(item.id);
 if(!set||i<0)return item;
 // Preserve actual requirements: chores and steps, not literal sporting achievements.
 const descriptions=['Complete your first individual task step','Finish your first assigned task','Complete 10 individual task steps','Finish 5 assigned tasks','Earn 100 XP','Finish 20 assigned tasks','Complete 50 individual task steps','Earn 400 XP'];
 return {...item,title:set.names[i],icon:set.icons[i],description:descriptions[i]};
}
