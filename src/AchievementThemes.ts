import type {Adventure} from './Adventure';
import {interestFor} from './WorldCatalog';
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
const interestTitles:Record<string,string[]>={
 basketball:['First Dribble','First Basket','Ball Handling Star','Scoring Run','Rookie Season','Playoff Ready','Court Hero','All-Star'],
 soccer:['First Touch','First Goal','Dribbling Star','Winning Moves','Rising Player','Match Ready','Pitch Hero','All-Star'],
 football:['First Down','Touchdown','Playmaker','Drive Builder','Rookie Season','Game Ready','Gridiron Hero','Champion'],
 baseball:['First Pitch','First Hit','Batting Practice','On Base','Rookie Season','In the Lineup','Diamond Hero','All-Star'],
 gymnastics:['First Move','Routine Complete','Balance Star','Finding Flow','Rising Gymnast','Meet Ready','Routine Hero','Champion'],
 motorsports:['Starting Grid','First Lap','Pit Crew Star','Race Pace','Rookie Driver','Race Ready','Track Hero','Champion'],
 dragons:['First Flight','First Quest','Dragon Keeper','Rising Flame','Sky Rider','Realm Guardian','Flight Master','Dragon Legend'],
 knights:['First Quest','Quest Complete','Shield Apprentice','Quest Seeker','Rising Knight','Realm Protector','Sword of Honor','Royal Champion'],
 wizards:['First Spell','First Quest','Spell Apprentice','Magic Momentum','Rising Mage','Spellbook Scholar','Magic Master','Archmage'],
 pets:['First Pawprint','First Adventure','Pet Pal','Happy Trails','Animal Friend','Care Champion','Pawprint Hero','Best Companion'],
 dinosaurs:['First Footprint','First Fossil','Fossil Finder','Trail Explorer','Junior Paleontologist','Dino Researcher','Expedition Hero','Dino Expert'],
 ocean:['First Dive','First Discovery','Reef Explorer','Making Waves','Ocean Cadet','Deep Sea Explorer','Current Rider','Ocean Champion'],
 construction:['First Brick','First Build','Site Helper','Building Momentum','Apprentice Builder','Site Leader','Blueprint Hero','Master Builder'],
 engineering:['First Design','First Prototype','Problem Solver','Iteration Star','Junior Engineer','Workshop Leader','Inventor','Master Engineer'],
 camping:['First Trail','Camp Set','Trail Scout','Adventure Ready','Rising Explorer','Camp Leader','Trail Hero','Wilderness Expert'],
 mountains:['First Ascent','First Summit','Trail Builder','Climbing Higher','Rising Climber','Summit Ready','Peak Explorer','Mountain Champion'],
 treasure:['First Clue','First Treasure','Map Reader','Trail Finder','Junior Adventurer','Expedition Leader','Treasure Tracker','Legendary Explorer'],
 art:['First Sketch','First Creation','Sketchbook Star','Creative Flow','Rising Artist','Studio Ready','Color Master','Master Artist'],
 music:['First Note','First Song','Rhythm Star','Finding the Beat','Rising Musician','Stage Ready','Melody Master','Music Champion'],
 design:['First Idea','First Design','Creative Builder','Design Flow','Rising Designer','Studio Leader','Design Hero','Master Designer']
};
export function achievementTheme(adventure?:Adventure):string{
 if(!adventure)return 'simple';
 // Preserve legacy theme labels until the user deliberately chooses an interest.
 if(!adventure.world?.interest||adventure.world.interest==='auto'){
  const i=interestFor(adventure);
  return i==='hockey'?'hockey':adventure.theme;
 }
 return interestFor(adventure);
}
export function themedAchievement(item:Achievement,adventure?:Adventure):Achievement{
 const theme=achievementTheme(adventure),names=interestTitles[theme];const icons= ['dragons','knights','wizards'].includes(theme)?sets.fantasy.icons:['pets','dinosaurs','ocean','camping','mountains','treasure'].includes(theme)?sets.animals.icons:['construction','engineering','art','music','design'].includes(theme)?sets.builder.icons:sets.sports.icons;
 const set=sets[theme==='wildlife'?'animals':theme==='blocks'?'builder':theme]||(names?{names,icons}:undefined),i=ids.indexOf(item.id);
 if(i<0)return item;
 if(!set){const names=['First Step','First Task','Step Builder','Building Momentum','New Heights','Steady Progress','Small Steps, Big Things','Progress Expert'];const descriptions=['Complete your first individual step','Finish your first task','Complete 10 individual steps','Finish 5 tasks','Earn 100 XP','Finish 20 tasks','Complete 50 individual steps','Earn 400 XP'];return {...item,title:names[i],description:descriptions[i]}}
 // Preserve actual requirements: chores and steps, not literal sporting achievements.
 const descriptions=['Complete your first individual task step','Finish your first assigned task','Complete 10 individual task steps','Finish 5 assigned tasks','Earn 100 XP','Finish 20 assigned tasks','Complete 50 individual task steps','Earn 400 XP'];
 return {...item,title:set.names[i],icon:set.icons[i],description:descriptions[i]};
}
