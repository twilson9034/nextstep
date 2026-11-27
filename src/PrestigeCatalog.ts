// Prestige is a permanent view of lifetime XP, not a spendable balance.
export const prestigeThresholds=[0,1000,3000,6000,10000] as const;
type Ranks=[string,string,string,string,string];
export const prestigeRanks:Record<string,Ranks>={
 simple:['Starting out','Growing','Making progress','Experienced','Mastery'],
 hockey:['Peewee','Juniors','Collegiate','Minors','Majors'],
 basketball:['Youth League','Junior Varsity','Collegiate','Development League','Professional'],
 soccer:['Youth Club','Academy','Development Squad','National League','International Pro'],
 football:['Youth League','High School','Collegiate','Development League','Professional'],
 baseball:['Little League','Junior League','Collegiate','Minors','Majors'],
 gymnastics:['Beginner','Club Gymnast','Regional Gymnast','National Gymnast','Elite Gymnast'],
 motorsports:['Kart Racer','Club Racer','Regional Racer','Professional Racer','World Champion'],
 space:['Cadet','Space Explorer','Pilot','Mission Captain','Fleet Commander'],
 dragons:['Hatchling Friend','Dragon Keeper','Dragon Rider','Sky Guardian','Dragon Master'],
 knights:['Page','Squire','Knight','Royal Guard','Royal Champion'],
 wizards:['Apprentice','Spellcaster','Mage','Grand Mage','Archmage'],
 pets:['Pet Friend','Companion Helper','Animal Caregiver','Companion Trainer','Animal Champion'],
 wildlife:['Nature Scout','Trail Guide','Wildlife Tracker','Conservation Ranger','Nature Guardian'],
 dinosaurs:['Fossil Scout','Field Assistant','Fossil Researcher','Paleontologist','Lead Paleontologist'],
 ocean:['Shore Explorer','Reef Explorer','Diver','Ocean Researcher','Deep Sea Captain'],
 blocks:['Brick Builder','Junior Builder','Workshop Builder','World Designer','Master Builder'],
 construction:['Site Helper','Apprentice','Tradesperson','Site Supervisor','Master Builder'],
 engineering:['Tinkerer','Apprentice Engineer','Prototype Designer','Project Engineer','Chief Engineer'],
 camping:['Camp Scout','Trail Camper','Outdoor Guide','Expedition Leader','Wilderness Expert'],
 mountains:['Trail Walker','Hill Explorer','Climber','Summit Guide','Mountain Legend'],
 treasure:['Map Reader','Treasure Scout','Relic Hunter','Expedition Leader','Legendary Explorer'],
 art:['Art Student','Sketch Artist','Studio Artist','Gallery Artist','Master Artist'],
 music:['Beginner','Band Member','Performer','Recording Artist','Headliner'],
 design:['Idea Maker','Design Student','Studio Designer','Lead Designer','Master Designer']
};
type Words={singular:string;plural:string;heading:string;finish:string;finished:string;empty:string;next:string};
const words:Record<string,Words>={
 simple:{singular:'task',plural:'Tasks',heading:'My tasks',finish:'Finish task',finished:'Completed tasks',empty:'No unfinished tasks.',next:'YOUR NEXT STEP'},
 sports:{singular:'training goal',plural:'Training',heading:'My training goals',finish:'Finish goal',finished:'Completed training goals',empty:'No unfinished training goals.',next:'NEXT TRAINING STEP'},
 space:{singular:'mission',plural:'Missions',heading:'My missions',finish:'Complete mission',finished:'Completed missions',empty:'No unfinished missions.',next:'NEXT MISSION STEP'},
 fantasy:{singular:'quest',plural:'Quests',heading:'My quests',finish:'Complete quest',finished:'Completed quests',empty:'No unfinished quests.',next:'NEXT QUEST STEP'},
 animals:{singular:'activity',plural:'Activities',heading:'My activities',finish:'Finish activity',finished:'Completed activities',empty:'No unfinished activities.',next:'NEXT ACTIVITY STEP'},
 builder:{singular:'project',plural:'Projects',heading:'My projects',finish:'Finish project',finished:'Completed projects',empty:'No unfinished projects.',next:'NEXT PROJECT STEP'},
 exploration:{singular:'objective',plural:'Objectives',heading:'My objectives',finish:'Complete objective',finished:'Completed objectives',empty:'No unfinished objectives.',next:'NEXT ADVENTURE STEP'},
 creative:{singular:'project',plural:'Projects',heading:'My creative projects',finish:'Finish project',finished:'Completed projects',empty:'No unfinished projects.',next:'NEXT CREATIVE STEP'}
};
const groups:Record<string,string[]>={sports:['hockey','basketball','soccer','football','baseball','gymnastics','motorsports'],space:['space'],fantasy:['dragons','knights','wizards'],animals:['pets','wildlife','dinosaurs','ocean'],builder:['blocks','construction','engineering'],exploration:['camping','mountains','treasure'],creative:['art','music','design']};
export function adventureWords(interest:string,enabled=true):Words{
 if(!enabled)return words.simple;
 const category=Object.keys(groups).find(k=>groups[k].includes(interest))||'simple';
 return words[category];
}
export function prestigeFor(interest:string,xp:number){
 const ranks=prestigeRanks[interest]||prestigeRanks.simple,score=Math.max(0,xp),index=prestigeThresholds.filter(t=>score>=t).length-1;
 const start=prestigeThresholds[index],next=prestigeThresholds[index+1]??null;
 return {index,name:ranks[index],start,next,nextName:ranks[index+1]??null,progress:next===null?1:(score-start)/(next-start),ranks};
}
