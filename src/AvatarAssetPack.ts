import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {AvatarDesign} from './AvatarStudio';

export type AssetPack={file:string;outfit:string;credit:string;revision:string};
type Catalog={version:1;packs:Record<string,AssetPack>};
const ASSETS=new URL(import.meta.env.BASE_URL+'avatar-assets/',location.origin);
const LIMIT=24*1024*1024;
let catalogPromise:Promise<Catalog>|undefined;
const files=new Map<string,Promise<ArrayBuffer>>();
const variants:Record<string,string[]>={
 hair:['short','swept','curly','long','bald'],
 accessory:['none','glasses','freckles','star'],
 companion:['none','fox','robot'],
 position:['skater','goalie']
};
const tints:Partial<Record<keyof AvatarDesign,string>>={skin:'skin',hairColor:'hair',eyes:'iris',primary:'primary',secondary:'secondary',helmet:'helmet'};
export async function getAssetPack(outfit:string):Promise<AssetPack|null>{
 if(!catalogPromise)catalogPromise=(async()=>{
  const response=await fetch(new URL('manifest.json',ASSETS),{cache:'no-cache',credentials:'same-origin'});
  if(!response.ok)throw new Error('Avatar catalog unavailable');
  const data=await response.json() as Catalog;
  if(data.version!==1||!data.packs||typeof data.packs!=='object')throw new Error('Invalid avatar catalog');
  return data;
 })().catch(e=>{catalogPromise=undefined;throw e});
 const pack=(await catalogPromise).packs[outfit];
 if(!pack)return null;
 if(pack.outfit!==outfit||typeof pack.file!=='string'||!/^[-a-zA-Z0-9_]+\.glb$/.test(pack.file)||!pack.credit||!pack.revision)throw new Error('Invalid avatar pack');
 return pack;
}
// Inspect the GLB JSON before loading it. Packs must be self-contained and local.
export function validateGlb(buffer:ArrayBuffer){
 if(buffer.byteLength<20||buffer.byteLength>LIMIT)throw new Error('Avatar asset size is invalid');
 const header=new DataView(buffer);
 if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==buffer.byteLength||header.getUint32(16,true)!==0x4e4f534a)throw new Error('Expected a glTF 2.0 binary asset');
 const length=header.getUint32(12,true);
 if(length>buffer.byteLength-20)throw new Error('Invalid avatar asset header');
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
 for(const item of [...(json.buffers||[]),...(json.images||[])])if(typeof item.uri==='string'&&!item.uri.startsWith('data:'))throw new Error('External avatar resources are not allowed');
 if(json.extensionsRequired?.some((s:string)=>!['KHR_materials_unlit','KHR_texture_transform','KHR_materials_clearcoat','KHR_materials_sheen','KHR_materials_specular','KHR_materials_ior','KHR_materials_emissive_strength','KHR_materials_transmission','KHR_materials_volume'].includes(s)))throw new Error('Unsupported required avatar extension');
}
async function fetchPack(pack:AssetPack){
 const url=new URL(pack.file,ASSETS).href;
 let pending=files.get(url);
 if(!pending){pending=(async()=>{
  const r=await fetch(url,{credentials:'same-origin'});
  if(!r.ok)throw new Error('Avatar model could not be loaded');
  const size=Number(r.headers.get('content-length')||0);
  if(size>LIMIT)throw new Error('Avatar model exceeds size limit');
  const bytes=await r.arrayBuffer();validateGlb(bytes);return bytes;
 })().catch(e=>{files.delete(url);throw e});
 files.set(url,pending);
 // Keep at most two packs in the browser cache, rather than accumulating decoded characters.
 if(files.size>2)files.delete(files.keys().next().value!);
 }
 return pending;
}
function named(root:THREE.Object3D,name:string){return root.getObjectByName(name)}
function meshes(node:THREE.Object3D){const out:THREE.Mesh[]=[];node.traverse(o=>{if(o instanceof THREE.Mesh)out.push(o)});return out}
export function validateAssetScene(root:THREE.Object3D,outfit:string){
 const count=new Map<string,number>(),materials=new Set<string>();
 root.traverse(o=>{count.set(o.name,(count.get(o.name)||0)+1);if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m.name)});
 for(const [key,choices] of Object.entries(variants)){
  if(key==='position'&&outfit!=='hockey')continue;
  for(const value of choices){
   if(value==='none'||value==='bald')continue;
   const name=key+'_'+value;
   if(count.get(name)!==1||!meshes(named(root,name)!).length)throw new Error('Missing or ambiguous modular asset: '+name);
  }
 }
 for(const key of ['skin','hair','iris','primary','secondary',...(outfit==='hockey'?['helmet']:[])])if(!materials.has('tint_'+key))throw new Error('Missing customizable material: '+key);
 if(outfit==='hockey'&&(!named(root,'jersey_number')||!meshes(named(root,'jersey_number')!).length))throw new Error('Missing jersey number surface');
 const bounds=new THREE.Box3().setFromObject(root);const size=bounds.getSize(new THREE.Vector3());
 if(!Number.isFinite(size.length())||size.y<.05)throw new Error('Invalid character dimensions');
}
// Meshes are independently authored. Tint maps are neutral (white/grey) PBR textures;
// multiplying base colors preserves texture detail, roughness and normal maps.
export function applyAssetDesign(root:THREE.Object3D,design:AvatarDesign,portrait:boolean){
 for(const [key,choices] of Object.entries(variants)){
  for(const value of choices){const o=named(root,key+'_'+value);if(o)o.visible=design[key as keyof AvatarDesign]===value&&!(portrait&&key==='companion')}
 }
 const materials=new Set<THREE.Material>();
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=!portrait;o.receiveShadow=!portrait;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});
 for(const m of materials)if(m instanceof THREE.MeshStandardMaterial||m instanceof THREE.MeshBasicMaterial){
  for(const [key,slot] of Object.entries(tints))if(m.name==='tint_'+slot)m.color.set(design[key as keyof AvatarDesign]);
 }
 const number=named(root,'jersey_number');
 if(number&&typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  if(ctx){ctx.clearRect(0,0,512,512);ctx.font='bold 320px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle='#121c2a';ctx.lineWidth=20;ctx.strokeText(design.number,256,272);ctx.fillStyle='#ffffff';ctx.fillText(design.number,256,272);
   const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
   // Keep the number decal independent of jersey fabric materials.
   for(const mesh of meshes(number)){const old=Array.isArray(mesh.material)?mesh.material:[mesh.material];const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.01,roughness:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});material.name='custom_jersey_number';mesh.material=material;for(const m of old)if(!materials.has(m))m.dispose()}
  }
 }
}
export async function loadAvatarAsset(pack:AssetPack,design:AvatarDesign,portrait:boolean){
 const data=await fetchPack(pack);const loader=new GLTFLoader();
 const gltf=await loader.parseAsync(data.slice(0),ASSETS.href);
 try{validateAssetScene(gltf.scene,pack.outfit);applyAssetDesign(gltf.scene,design,portrait);return gltf.scene}
 catch(e){disposeAsset(gltf.scene);throw e}
}
export function disposeAsset(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose()}});
 for(const m of materials){for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);m.dispose()}
 for(const g of geometries)g.dispose();for(const t of textures)t.dispose();
}
