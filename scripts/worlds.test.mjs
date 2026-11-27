import assert from 'node:assert/strict';
import {categories,locations,interestNames,recommended,interestFor,environmentFor,legacyTheme,worldSettings} from '../src/WorldCatalog.ts';
const a={theme:'sports',avatar:'athlete',design:{outfit:'hockey'}};
assert.equal(interestFor(a),'hockey');assert.equal(environmentFor(a),'ice-arena');
assert.equal(interestFor({...a,world:{interest:'hockey',environment:'mars'}}),'hockey');
assert.equal(environmentFor({...a,world:{interest:'hockey',environment:'mars'}}),'mars');
assert.equal(interestFor({...a,world:{interest:'soccer',environment:'ice-arena'}}),'soccer');
assert.equal(interestFor({...a,world:{interest:'simple'}}),'simple');
assert.equal(legacyTheme('camping'),'animals');assert.equal(legacyTheme('music'),'builder');
assert.equal(worldSettings(a).interest,'auto');
for(const cat of categories)for(const i of cat.interests){assert.ok(interestNames[i]);assert.ok(recommended[i]?.length);for(const e of recommended[i])assert.ok(locations[e])}
console.log('PASS: catalog, legacy defaults, independent interest and environment, explicit simple mode, and all recommended places');
