import * as THREE from "https://esm.sh/three@0.181.1";
import RAPIER from "https://esm.sh/@dimforge/rapier3d-compat@0.19.3";

await RAPIER.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07101d);
scene.fog = new THREE.Fog(0x07101d, 28, 65);
const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, .1, 120);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xbfeaff,0x142038,2.1));
const sun=new THREE.DirectionalLight(0xffffff,2.7); sun.position.set(10,18,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);
const world=new RAPIER.World({x:0,y:-9.81,z:0}); world.timestep=1/60;
const objects=[]; const crates=[]; const keys={}; let score=0, ramReady=true;
const mat=(c,rough=.75)=>new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:.15});
function addBox({size,pos,color=0x4b6075,type='fixed',mass=1,rotY=0,name=''}){
 const g=new THREE.BoxGeometry(...size), mesh=new THREE.Mesh(g,mat(color)); mesh.castShadow=mesh.receiveShadow=true; scene.add(mesh);
 const rd=(type==='dynamic'?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed()).setTranslation(...pos).setRotation({x:0,y:Math.sin(rotY/2),z:0,w:Math.cos(rotY/2)});
 const body=world.createRigidBody(rd); const cd=RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setFriction(1.1).setRestitution(.08);
 if(type==='dynamic') cd.setMass(mass); world.createCollider(cd,body); const o={mesh,body,name}; objects.push(o); return o;
}
addBox({size:[34,.5,34],pos:[0,-.25,0],color:0x19334a});
for(const [x,z,sx,sz] of [[0,-17,34,.5],[0,17,34,.5],[-17,0,.5,34],[17,0,.5,34]]) addBox({size:[sx,2,sz],pos:[x,1,z],color:0x274f68});
const ramp=addBox({size:[7,.6,5],pos:[6,.55,5],color:0x43677b,rotY:.4}); ramp.body.setRotation({x:-.14,y:.2,z:.03,w:.97},true);
const robot=addBox({size:[2.3,.7,3.4],pos:[0,1.1,10],color:0x1aa4dc,type:'dynamic',mass:18,name:'robot'});
robot.body.setLinearDamping(.8); robot.body.setAngularDamping(2.4);
const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.5,.55,1.5),mat(0xa7ebff,.25)); cabin.position.y=.6; cabin.castShadow=true; robot.mesh.add(cabin);
const bumper=new THREE.Mesh(new THREE.BoxGeometry(2.7,.35,.35),mat(0xff516f,.35)); bumper.position.set(0,0,-1.85); robot.mesh.add(bumper);
function spawnCrates(){for(const c of crates){world.removeRigidBody(c.body);scene.remove(c.mesh);objects.splice(objects.indexOf(c),1)} crates.length=0; score=0;
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=5+(i%3)*2;crates.push(addBox({size:[1.4,1.4,1.4],pos:[Math.cos(a)*r,1,Math.sin(a)*r-2],color:i%2?0xf49b43:0xb675df,type:'dynamic',mass:3+i*.5,name:'crate'}));}}
spawnCrates();
function sync(){for(const o of objects){const p=o.body.translation(),q=o.body.rotation();o.mesh.position.set(p.x,p.y,p.z);o.mesh.quaternion.set(q.x,q.y,q.z,q.w)}}
function reset(){robot.body.setTranslation({x:0,y:1.3,z:10},true);robot.body.setRotation({x:0,y:0,z:0,w:1},true);robot.body.setLinvel({x:0,y:0,z:0},true);robot.body.setAngvel({x:0,y:0,z:0},true)}
function ram(){if(!ramReady)return;ramReady=false;const q=robot.body.rotation(),v=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));robot.body.applyImpulse({x:v.x*48,y:1.2,z:v.z*48},true);setTimeout(()=>ramReady=true,900)}
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.code==='Space'){e.preventDefault();ram()}if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='n')spawnCrates()});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
for(const b of document.querySelectorAll('[data-key]')){const k=b.dataset.key.toLowerCase();for(const ev of ['pointerdown','pointerenter'])b.addEventListener(ev,e=>{if(e.buttons||ev==='pointerdown')keys[k]=true});for(const ev of ['pointerup','pointerleave','pointercancel'])b.addEventListener(ev,()=>keys[k]=false)}
document.querySelector('#ram').addEventListener('pointerdown',ram);
function drive(){const q=robot.body.rotation(),quat=new THREE.Quaternion(q.x,q.y,q.z,q.w),fwd=new THREE.Vector3(0,0,-1).applyQuaternion(quat),right=new THREE.Vector3(1,0,0).applyQuaternion(quat);fwd.y=0;fwd.normalize();right.y=0;right.normalize();const forward=(keys['z']||keys['arrowup']?1:0)-(keys['s']||keys['arrowdown']?1:0),turn=(keys['q']||keys['arrowleft']?1:0)-(keys['d']||keys['arrowright']?1:0);if(forward)robot.body.addForce({x:fwd.x*210*forward,y:0,z:fwd.z*210*forward},true);if(turn)robot.body.addTorque({x:0,y:90*turn,z:0},true);const lv=robot.body.linvel();if(Math.hypot(lv.x,lv.z)>11)robot.body.setLinvel({x:lv.x*.97,y:lv.y,z:lv.z*.97},true)}
const clock=new THREE.Clock();let acc=0;
function loop(){requestAnimationFrame(loop);acc+=Math.min(clock.getDelta(),.05);while(acc>=1/60){drive();world.step();acc-=1/60}sync();
 const p=robot.mesh.position,q=robot.mesh.quaternion;const target=new THREE.Vector3(0,7,12).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(q).y)).add(p);camera.position.lerp(target,.07);camera.lookAt(p.x,p.y+1,p.z);
 let alive=0;for(const c of crates){const cp=c.body.translation();if(Math.abs(cp.x)<16.2&&Math.abs(cp.z)<16.2&&cp.y>-.5)alive++;else if(!c.scored){c.scored=true;score++}}document.querySelector('#crates').textContent=alive;document.querySelector('#score').textContent=score;const v=robot.body.linvel();document.querySelector('#speed').textContent=Math.hypot(v.x,v.z).toFixed(1);if(p.y<-5)reset();renderer.render(scene,camera)}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
document.querySelector('#loading').remove();loop();
