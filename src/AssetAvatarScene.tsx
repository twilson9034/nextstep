import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {disposeAsset,loadAvatarAsset,type AssetPack} from './AvatarAssetPack';
import type {AvatarDesign} from './AvatarStudio';
export function AssetAvatarScene({pack,design,portrait=false,onError}:{pack:AssetPack;design:AvatarDesign;portrait?:boolean;onError:(message:string)=>void}){
 const host=useRef<HTMLDivElement>(null),rotation=useRef(-18),drawRef=useRef<()=>void>(()=>{}),[loading,setLoading]=useState(true);
 const errorRef=useRef(onError);errorRef.current=onError;
 // Retain the selected angle between edits. Never run a continuous rendering loop.
 useEffect(()=>{let alive=true,renderer:THREE.WebGLRenderer|undefined,observer:ResizeObserver|undefined,scene:THREE.Scene|undefined,model:THREE.Object3D|undefined;const el=host.current;if(!el)return;setLoading(true);
 async function start(){
 try{
  model=await loadAvatarAsset(pack,design,portrait);
  if(!alive){disposeAsset(model);return}
  scene=new THREE.Scene();
  const box=new THREE.Box3().setFromObject(model),height=box.getSize(new THREE.Vector3()).y,center=box.getCenter(new THREE.Vector3());
  // Normalize authored +Y up, +Z forward assets; preserve their proportions.
  model.position.set(-center.x,-box.min.y,-center.z);
  const pivot=new THREE.Group();pivot.add(model);pivot.scale.setScalar(3.2/height);scene.add(pivot);pivot.rotation.y=rotation.current*Math.PI/180;
  const camera=new THREE.PerspectiveCamera(portrait?32:35,1,.05,80);
  const target=portrait?2.78:1.65;camera.position.set(0,portrait?2.78:2.05,portrait?2.2:7.0);camera.lookAt(0,target,0);
  const hemi=new THREE.HemisphereLight('#d9ecff','#29394f',2.0);scene.add(hemi);
  const key=new THREE.DirectionalLight('#fff0db',3);key.position.set(-3,6,5);key.castShadow=!portrait;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=4;key.shadow.camera.bottom=-3;key.shadow.bias=-.0003;scene.add(key);
  const rim=new THREE.DirectionalLight('#71b7ff',2.8);rim.position.set(4,3,-4);scene.add(rim);
  if(!portrait){
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:design.outfit==='hockey'?'#b8d4e4':'#253c51',roughness:.45}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
   if(design.outfit==='hockey'){const line=new THREE.Mesh(new THREE.RingGeometry(1.6,1.63,96),new THREE.MeshBasicMaterial({color:'#bd5364'}));line.rotation.x=-Math.PI/2;line.position.y=-.008;scene.add(line)}
  }
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=!portrait;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-hidden','true');el!.appendChild(renderer.domElement);
  const draw=()=>{if(!alive||!renderer||!scene)return;const w=Math.max(64,el!.clientWidth),h=Math.max(64,el!.clientHeight);camera.aspect=w/h;
   // Fit narrow phones without clipping the stick or equipment.
   const distance=portrait?2.2:Math.max(6.8,5.3/camera.aspect);camera.position.z=distance;camera.lookAt(0,target,0);camera.updateProjectionMatrix();pivot.rotation.y=rotation.current*Math.PI/180;renderer.setSize(w,h,false);renderer.render(scene,camera)};
  drawRef.current=draw;observer=new ResizeObserver(draw);observer.observe(el!);draw();setLoading(false);
 }catch(e){if(alive)errorRef.current(e instanceof Error?e.message:'Unable to display avatar asset')}
 }
 void start();return()=>{alive=false;drawRef.current=()=>{};observer?.disconnect();if(scene)disposeAsset(scene);else if(model)disposeAsset(model);if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}};
 },[pack.file,pack.revision,portrait,design.skin,design.hair,design.hairColor,design.eyes,design.outfit,design.primary,design.secondary,design.helmet,design.number,design.position,design.accessory,design.companion]);
 const rotate=(angle:number)=>{rotation.current=angle;drawRef.current()};
 return <div className={'studio-preview asset-studio-preview '+(portrait?'studio-portrait':'')}><div ref={host} className="studio-canvas" role="img" aria-label={design.outfit+' custom character'}/>{loading&&<div className="studio-fallback"><p>Loading character artwork…</p></div>}{!portrait&&!loading&&<div className="studio-rotate"><button type="button" aria-label="Rotate left" onClick={()=>rotate(rotation.current-30)}>↶</button><button type="button" onClick={()=>rotate(-18)}>Front</button><button type="button" aria-label="Rotate right" onClick={()=>rotate(rotation.current+30)}>↷</button></div>}</div>
}
