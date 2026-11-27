import assert from 'node:assert/strict';
import {interestNames} from '../src/WorldCatalog.ts';
import {collectionItems,upgradeTier,nextUnlock,unlockedItems,displayItem,stageName} from '../src/ProgressionCatalog.ts';
assert.equal(collectionItems.length,Object.keys(interestNames).length*7);
assert.equal(new Set(collectionItems.map(i=>i.id)).size,collectionItems.length);
for(const i of collectionItems)assert.ok(interestNames[i.interest]);
assert.equal(upgradeTier(99),0);assert.equal(upgradeTier(100),1);assert.equal(upgradeTier(400),2);assert.equal(upgradeTier(900),3);
assert.equal(nextUnlock(100),400);assert.equal(nextUnlock(900),1000);assert.equal(nextUnlock(10000),null);
assert.equal(displayItem('hockey:2',399),undefined);assert.equal(displayItem('hockey:2',400).title,'All-star stick emblem');
assert.equal(unlockedItems(100).length,Object.keys(interestNames).length);
assert.equal(unlockedItems(900).length,Object.keys(interestNames).length*3);assert.equal(unlockedItems(10000).length,collectionItems.length);assert.equal(displayItem('hockey:7',9999),undefined);assert.equal(displayItem('hockey:7',10000).title,'Majors prestige emblem');
assert.equal(stageName('hockey',3),'Peewee tournament decorations');
console.log('PASS: XP thresholds, stable collectible IDs, all interests covered, no spending, locked display rejected');

import {prestigeFor,prestigeRanks,prestigeThresholds,adventureWords} from '../src/PrestigeCatalog.ts';
for(const i of Object.keys(interestNames)){assert.equal(prestigeRanks[i].length,5);for(let j=0;j<5;j++){assert.equal(prestigeFor(i,prestigeThresholds[j]).index,j);if(j>0)assert.equal(prestigeFor(i,prestigeThresholds[j]-1).index,j-1)}}
assert.equal(prestigeFor('hockey',0).name,'Peewee');assert.equal(prestigeFor('hockey',1000).name,'Juniors');assert.equal(prestigeFor('hockey',3000).name,'Collegiate');assert.equal(prestigeFor('hockey',6000).name,'Minors');assert.equal(prestigeFor('hockey',10000).name,'Majors');assert.equal(prestigeFor('hockey',99999).next,null);assert.equal(adventureWords('hockey').plural,'Training');assert.equal(adventureWords('space').plural,'Missions');assert.equal(adventureWords('knights').plural,'Quests');assert.equal(adventureWords('engineering').plural,'Projects');assert.equal(adventureWords('hockey',false).plural,'Tasks');console.log('PASS: all 25 prestige paths, rank boundaries, continuous XP and adventure vocabulary');
