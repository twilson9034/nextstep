export const milestones=[100,400,900] as const;
export const collections:Record<string,[string,string,string]> = {
 simple:['First progress badge','Milestone medal','Progress trophy'],
 hockey:['Rookie jersey badge','All-star stick emblem','Championship cup'],
 basketball:['Rookie court badge','All-star ball emblem','Championship trophy'],
 soccer:['Team scarf badge','Golden boot emblem','League cup'],
 football:['Team helmet badge','Playmaker emblem','Championship ring'],
 baseball:['Rookie cap badge','Golden glove emblem','World series trophy'],
 gymnastics:['Training ribbon','Balance medal','Champion trophy'],
 motorsports:['Rookie racing badge','Pole position helmet emblem','Championship cup'],
 space:['Explorer patch','Starship emblem','Galaxy medal'],
 dragons:['Hatchling crest','Dragon wing emblem','Dragon crown'],
 knights:['Squire shield','Knight crest','Royal crown'],
 wizards:['Apprentice charm','Spellbook emblem','Archmage staff'],
 pets:['Pawprint badge','Companion collar emblem','Best friend trophy'],
 wildlife:['Trail badge','Wildlife explorer emblem','Nature guardian medal'],
 dinosaurs:['Fossil badge','Dinosaur tooth emblem','Expedition trophy'],
 ocean:['Shell badge','Diver emblem','Ocean treasure'],
 blocks:['Builder badge','Golden brick emblem','Master builder trophy'],
 construction:['Hard hat badge','Crane emblem','Builder trophy'],
 engineering:['Prototype badge','Inventor gear emblem','Engineering medal'],
 camping:['Trail patch','Camp lantern emblem','Explorer trophy'],
 mountains:['Trail badge','Summit flag emblem','Peak explorer medal'],
 treasure:['Map badge','Golden compass emblem','Treasure chest'],
 art:['Sketchbook badge','Golden brush emblem','Artist trophy'],
 music:['First note badge','Golden instrument emblem','Music trophy'],
 design:['Idea badge','Design tools emblem','Creative champion trophy']
};
export type Collectible={id:string;interest:string;title:string;threshold:number;tier:number};
export const collectionItems:Collectible[]=Object.entries(collections).flatMap(([interest,names])=>names.map((title,i)=>({id:interest+':'+(i+1),interest,title,threshold:milestones[i],tier:i+1})));
export function upgradeTier(xp:number){return milestones.filter(m=>xp>=m).length}
export function nextUnlock(xp:number){return milestones.find(m=>xp<m)??null}
export function unlockedItems(xp:number){return collectionItems.filter(i=>xp>=i.threshold)}
export function displayItem(id:string|undefined,xp:number){return collectionItems.find(i=>i.id===id&&xp>=i.threshold)}
export function stageName(interest:string,tier:number){
 const special:Record<string,string[]>={hockey:['Practice rink','Rookie season','Training center','Championship arena'],space:['Launch site','Explorer base','Research station','Deep space command'],blocks:['Starter build','Builder camp','Workshop village','Master builder world'],motorsports:['Practice track','Rookie garage','Race team HQ','Championship circuit'],engineering:['Workbench','Prototype lab','Innovation workshop','Research center']};
 return (special[interest]||['Starting adventure','Growing adventure','Expanded adventure','Champion adventure'])[Math.max(0,Math.min(3,tier))];
}
