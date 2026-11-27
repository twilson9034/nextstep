export type WorldDesign={interest:string;environment:string;atmosphere:'day'|'sunset'|'night';accent:string;collection?:string;upgrades?:boolean};
export type WorldSource={theme:string;avatar:string;design?:{outfit?:string};world?:Partial<WorldDesign>};
export const categories=[
 {id:'simple',name:'Simple',interests:['simple']},
 {id:'sports',name:'Sports',interests:['hockey','basketball','soccer','football','baseball','gymnastics','motorsports']},
 {id:'space',name:'Space',interests:['space']},
 {id:'fantasy',name:'Fantasy',interests:['dragons','knights','wizards']},
 {id:'animals',name:'Animals & nature',interests:['pets','wildlife','dinosaurs','ocean']},
 {id:'builder',name:'Building',interests:['blocks','construction','engineering']},
 {id:'exploration',name:'Exploration',interests:['camping','mountains','treasure']},
 {id:'creative',name:'Creative',interests:['art','music','design']}
];
export const interestNames:Record<string,string>={simple:'Simple Progress',hockey:'Hockey',basketball:'Basketball',soccer:'Soccer',football:'Football',baseball:'Baseball',gymnastics:'Gymnastics',motorsports:'Motorsports',space:'Space Explorer',dragons:'Dragons',knights:'Knights',wizards:'Wizards',pets:'Pets',wildlife:'Wildlife',dinosaurs:'Dinosaurs',ocean:'Ocean Explorer',blocks:'Block Builder',construction:'Construction',engineering:'Engineering',camping:'Camping',mountains:'Mountain Explorer',treasure:'Treasure Hunter',art:'Art',music:'Music',design:'Design'};
export const locations:Record<string,string>={simple:'Simple background','ice-arena':'Indoor ice arena','outdoor-rink':'Outdoor rink','locker-room':'Locker room','basketball-court':'Basketball court','soccer-field':'Soccer field','football-field':'Football field','baseball-diamond':'Baseball diamond',gym:'Gymnastics gym',racetrack:'Racetrack',moon:'Moon base','space-station':'Space station',mars:'Mars colony','alien-planet':'Alien planet',castle:'Castle','enchanted-forest':'Enchanted forest','pet-park':'Pet park',woodland:'Woodland','dinosaur-valley':'Dinosaur valley',underwater:'Underwater world','block-village':'Block village','construction-site':'Construction site',workshop:'Engineering workshop',campsite:'Campsite','mountain-trail':'Mountain trail',island:'Treasure island','art-studio':'Art studio','music-studio':'Music studio','design-studio':'Design studio'};
export const recommended:Record<string,string[]>={simple:['simple'],hockey:['ice-arena','outdoor-rink','locker-room'],basketball:['basketball-court','gym'],soccer:['soccer-field'],football:['football-field'],baseball:['baseball-diamond'],gymnastics:['gym'],motorsports:['racetrack'],space:['moon','space-station','mars','alien-planet'],dragons:['castle','enchanted-forest'],knights:['castle','enchanted-forest'],wizards:['enchanted-forest','castle'],pets:['pet-park','woodland'],wildlife:['woodland','mountain-trail'],dinosaurs:['dinosaur-valley','woodland'],ocean:['underwater','island'],blocks:['block-village','workshop'],construction:['construction-site','workshop'],engineering:['workshop','space-station'],camping:['campsite','woodland'],mountains:['mountain-trail','campsite'],treasure:['island','enchanted-forest'],art:['art-studio'],music:['music-studio'],design:['design-studio','workshop']};
export const defaultWorld:WorldDesign={interest:'auto',environment:'auto',atmosphere:'day',accent:'#67e8f9',collection:'none',upgrades:true};
export function worldSettings(a:WorldSource):WorldDesign{return {...defaultWorld,...a.world}}
export function interestFor(a:WorldSource){
 const key=a.world?.interest;
 if(key&&key!=='auto'&&interestNames[key])return key;
 if((a.theme==='sports'||a.theme==='simple')&&(a.design?.outfit==='hockey'||(!a.design?.outfit&&a.avatar==='athlete')))return 'hockey';
 return ({sports:'basketball',space:'space',fantasy:'knights',animals:'wildlife',builder:'blocks'} as Record<string,string>)[a.theme]||'simple';
}
export function environmentFor(a:WorldSource){
 const env=a.world?.environment;
 return env&&env!=='auto'&&locations[env]?env:recommended[interestFor(a)]?.[0]||'simple';
}
export function categoryFor(interest:string){return categories.find(c=>c.interests.includes(interest))?.id||'simple'}
export function legacyTheme(interest:string){const category=categoryFor(interest);return category==='exploration'?'animals':category==='creative'?'builder':category}
export function worldTitle(a:WorldSource){return interestNames[interestFor(a)]||'Simple Progress'}
