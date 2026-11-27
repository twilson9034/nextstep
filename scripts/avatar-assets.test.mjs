import assert from 'node:assert/strict';
import * as THREE from 'three';
import {validateGlb,validateAssetScene,applyAssetDesign,disposeAsset} from '../src/AvatarAssetPack.ts';
function glb(json){
 const str=JSON.stringify(json),len=Math.ceil(str.length/4)*4,b=new ArrayBuffer(20+len),h=new DataView(b);
 h.setUint32(0,0x46546c67,true);h.setUint32(4,2,true);h.setUint32(8,b.byteLength,true);h.setUint32(12,len,true);h.setUint32(16,0x4e4f534a,true);
 new Uint8Array(b,20).fill(32);new Uint8Array(b,20).set(new TextEncoder().encode(str));return b;
}
assert.doesNotThrow(()=>validateGlb(glb({asset:{version:'2.0'}})));
assert.throws(()=>validateGlb(glb({buffers:[{uri:'https://example.com/asset.bin'}]})),/External/);
assert.throws(()=>validateGlb(glb({images:[{uri:'other.png'}]})),/External/);
assert.throws(()=>validateGlb(glb({extensionsRequired:['KHR_draco_mesh_compression']})),/Unsupported/);
assert.throws(()=>validateGlb(new ArrayBuffer(8)));
const root=new THREE.Group(),names=['hair_short','hair_swept','hair_curly','hair_long','accessory_glasses','accessory_freckles','accessory_star','companion_fox','companion_robot','position_skater','position_goalie','jersey_number'];
function mesh(name,materialName='neutral'){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());m.name=name;m.material.name=materialName;root.add(m);return m}
for(const n of names)mesh(n);
const skin=mesh('face','tint_skin'),hair=mesh('hair_material','tint_hair'),eyes=mesh('eyes','tint_iris'),jersey=mesh('jersey','tint_primary');mesh('trim','tint_secondary');mesh('helmet','tint_helmet');
assert.doesNotThrow(()=>validateAssetScene(root,'hockey'));
const d={skin:'#94623f',hair:'curly',hairColor:'#765033',eyes:'#497757',outfit:'hockey',primary:'#f97316',secondary:'#111827',helmet:'#111827',number:'29',position:'goalie',accessory:'freckles',companion:'fox'};
applyAssetDesign(root,d,false);
assert.equal(root.getObjectByName('hair_curly').visible,true);
assert.equal(root.getObjectByName('hair_swept').visible,false);
assert.equal(root.getObjectByName('position_goalie').visible,true);
assert.equal(root.getObjectByName('position_skater').visible,false);
assert.equal(root.getObjectByName('accessory_freckles').visible,true);
assert.equal(root.getObjectByName('companion_fox').visible,true);
assert.equal(skin.material.color.getHexString(),'94623f');
assert.equal(hair.material.color.getHexString(),'765033');
assert.equal(eyes.material.color.getHexString(),'497757');
assert.equal(jersey.material.color.getHexString(),'f97316');
applyAssetDesign(root,{...d,hair:'bald',accessory:'none'},true);
assert.equal(root.getObjectByName('hair_curly').visible,false);
assert.equal(root.getObjectByName('accessory_freckles').visible,false);
assert.equal(root.getObjectByName('companion_fox').visible,false);
root.remove(root.getObjectByName('position_goalie'));
assert.throws(()=>validateAssetScene(root,'hockey'),/Missing or ambiguous/);
disposeAsset(root);
console.log('PASS: self-contained GLB validation, unsupported asset rejection, required modules, tinting, hair and gear variants, accessory and portrait visibility. Geometry fixtures are not production artwork.');
