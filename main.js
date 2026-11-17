import * as THREE from "https://esm.sh/three@0.181.1";
import RAPIER from "https://esm.sh/@dimforge/rapier3d-compat@0.19.3";
await RAPIER.init();
const phone=matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);document.body.classList.toggle('phone',phone);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x07101d);scene.fog=new THREE.Fog(0x07101d,28,65);const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,120);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,phone?1.5:2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);scene.add(new THREE.HemisphereLight(0xbfeaff,0x142038,2.1));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(10,18,8);sun.castShadow=true;scene.add(sun);
let fixedCamera=false,gameStarted=false,aiMode=false;
const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;const objects=[],crates=[],keys={};let score=0;const material=c=>new THREE.MeshStandardMaterial({color:c,roughness:.7,metalness:.15});
function box(size,pos,color,type='fixed',mass=1){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);const desc=(type==='dynamic'?RAPIER.RigidBodyDesc.dynamic():RAPIER.RigidBodyDesc.fixed()).setTranslation(...pos);const body=world.createRigidBody(desc);const col=RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,size[2]/2).setFriction(1.1).setRestitution(.08);if(type==='dynamic')col.setMass(mass);world.createCollider(col,body);const o={mesh,body};objects.push(o);return o}
box([34,.5,34],[0,-.25,0],0x19334a);for(const v of [[0,-17,34,.5],[0,17,34,.5],[-17,0,.5,34],[17,0,.5,34]])box([v[2],2,v[3]],[v[0],1,v[1]],0x274f68);const ramp=box([7,.7,5],[7,.55,3],0x547b91);ramp.body.setRotation({x:-0.14,y:0,z:0,w:0.9902},true);const robot=box([2.3,.7,3.4],[0,1.1,10],0x1aa4dc,'dynamic',18);robot.body.setLinearDamping(1.35);robot.body.setAngularDamping(3.8);robot.body.enableCcd(true);const cab=new THREE.Mesh(new THREE.BoxGeometry(1.5,.55,1.5),material(0xa7ebff));cab.position.y=.6;robot.mesh.add(cab);const bump=new THREE.Mesh(new THREE.BoxGeometry(2.7,.35,.35),material(0xff516f));bump.position.set(0,0,-1.85);robot.mesh.add(bump);for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=5+(i%3)*2;crates.push(box([1.4,1.4,1.4],[Math.cos(a)*r,1,Math.sin(a)*r-2],i%2?0xf49b43:0xb675df,'dynamic',3+i*.5))}
function reset(){robot.body.setTranslation({x:0,y:1.3,z:10},true);robot.body.setRotation({x:0,y:0,z:0,w:1},true);robot.body.setLinvel({x:0,y:0,z:0},true);robot.body.setAngvel({x:0,y:0,z:0},true)}addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1;if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='n')location.reload();if(e.key.toLowerCase()==='c'){fixedCamera=!fixedCamera;document.querySelector('#cameraMode').textContent=fixedCamera?'ISO':'SUIVI'}});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=0);document.querySelector('#cameraToggle').addEventListener('pointerdown',e=>{e.preventDefault();fixedCamera=!fixedCamera;document.querySelector('#cameraMode').textContent=fixedCamera?'ISO':'SUIVI'});document.querySelector('#resetRobot').addEventListener('pointerdown',e=>{e.preventDefault();reset()});document.querySelector('#newArena').addEventListener('pointerdown',e=>{e.preventDefault();location.reload()});const touchDrive={z:0,q:0,s:0,d:0};
for(const button of document.querySelectorAll('[data-drive]')){
 const key=button.dataset.drive;
 const press=e=>{e.preventDefault();touchDrive[key]=1;button.classList.add('pressed');if(button.setPointerCapture)button.setPointerCapture(e.pointerId)};
 const release=e=>{e.preventDefault();touchDrive[key]=0;button.classList.remove('pressed')};
 button.addEventListener('pointerdown',press);
 for(const eventName of ['pointerup','pointercancel','lostpointercapture','pointerleave'])button.addEventListener(eventName,release);
}

function startGame(useAI){aiMode=useAI;gameStarted=true;document.body.classList.add('game-started');document.body.classList.toggle('ai-mode',aiMode);document.querySelector('#menu').classList.add('hidden');document.querySelector('#controlMode').textContent=aiMode?'IA':'JOUEUR';if(aiMode){fixedCamera=true;document.querySelector('#cameraMode').textContent='ISO'}}
document.querySelector('#playHuman').addEventListener('click',()=>startGame(false));
document.querySelector('#playAI').addEventListener('click',()=>startGame(true));
function aiControls(){
 const rp=robot.body.translation();let target=null,best=Infinity;
 for(const c of crates){if(c.scored)continue;const cp=c.body.translation(),dist=Math.hypot(cp.x-rp.x,cp.z-rp.z);if(dist<best){best=dist;target=cp}}
 if(!target)return {fw:0,tr:0};
 const q=robot.body.rotation(),forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
 const desired=Math.atan2(-(target.x-rp.x),-(target.z-rp.z)),current=Math.atan2(-forward.x,-forward.z);let diff=desired-current;while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;
 return {fw:Math.abs(diff)<1.25?1:0,tr:Math.abs(diff)>.08?Math.sign(diff):0};
}
function drive(){
 if(!gameStarted)return;
 const q=robot.body.rotation(),quat=new THREE.Quaternion(q.x,q.y,q.z,q.w);
 const up=new THREE.Vector3(0,1,0).applyQuaternion(quat);
 const upright=Math.max(0,up.y);
 const rp=robot.body.translation();
 const ray=new RAPIER.Ray({x:rp.x,y:rp.y,z:rp.z},{x:0,y:-1,z:0});
 const hit=world.castRay(ray,1.15,true,undefined,undefined,robot.body);
 const grounded=hit!==null;
 const f=new THREE.Vector3(0,0,-1).applyQuaternion(quat);f.y=0;if(f.lengthSq()>0.0001)f.normalize();
 const ai=aiMode?aiControls():null;
 const fw=aiMode?ai.fw:(phone?(touchDrive.z-touchDrive.s):((keys.z||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)));
 const tr=aiMode?ai.tr:(phone?(touchDrive.q-touchDrive.d):((keys.q||keys.arrowleft?1:0)-(keys.d||keys.arrowright?1:0)));
 // Motor force is only available while the chassis is upright and touching the ground.
 if(fw&&grounded&&upright>.55)robot.body.addForce({x:f.x*410*fw*upright,y:0,z:f.z*410*fw*upright},true);
 const av=robot.body.angvel();
 if(tr&&grounded&&upright>.5){const target=tr*3.1;robot.body.setAngvel({x:av.x*.84,y:av.y+(target-av.y)*.18,z:av.z*.84},true)}
 else robot.body.setAngvel({x:av.x*.92,y:av.y*.86,z:av.z*.92},true);
 const lv=robot.body.linvel(),horizontal=Math.hypot(lv.x,lv.z);
 const maxSpeed=(grounded&&upright>.55)?21:6;
 if(horizontal>maxSpeed){const k=maxSpeed/horizontal;robot.body.setLinvel({x:lv.x*k,y:lv.y,z:lv.z*k},true)}
 // Airborne/tipped robot keeps normal gravity but loses artificial motor acceleration.
 if(!grounded||upright<.55)robot.body.addForce({x:-lv.x*18,y:0,z:-lv.z*18},true);
}
const clock=new THREE.Clock();let acc=0;function loop(){requestAnimationFrame(loop);acc+=Math.min(clock.getDelta(),.05);while(acc>=1/60){drive();world.step();acc-=1/60}for(const o of objects){const p=o.body.translation(),q=o.body.rotation();o.mesh.position.set(p.x,p.y,p.z);o.mesh.quaternion.set(q.x,q.y,q.z,q.w)}const p=robot.mesh.position,q=robot.mesh.quaternion;if(fixedCamera){camera.position.lerp(new THREE.Vector3(24,28,24),.08);camera.lookAt(0,0,0)}else{const target=new THREE.Vector3(0,7,12).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),new THREE.Euler().setFromQuaternion(q).y)).add(p);camera.position.lerp(target,.07);camera.lookAt(p.x,p.y+1,p.z)};let alive=0;for(const c of crates){const x=c.body.translation();if(Math.abs(x.x)<16.2&&Math.abs(x.z)<16.2&&x.y>-.5)alive++;else if(!c.scored){c.scored=true;score++}}document.querySelector('#crates').textContent=alive;document.querySelector('#score').textContent=score;const v=robot.body.linvel();document.querySelector('#speed').textContent=Math.hypot(v.x,v.z).toFixed(1);if(p.y<-5)reset();renderer.render(scene,camera)}addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});document.querySelector('#loading').remove();loop();