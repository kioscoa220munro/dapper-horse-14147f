import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const $=id=>document.getElementById(id);
const input=$("video"), preview=$("preview"), workspace=$("workspace"), timeline=$("timeline"), host=$("scene");
let objectURL=null, renderer, scene, camera, controls, mesh, texture, raf=0, playing=false, lastDepthUpdate=0;
let depthCanvas, depthCtx, geometry, cols=96, rows=54;

function init3D(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x030407);
  camera=new THREE.PerspectiveCamera(48,1,.01,100);
  camera.position.set(0,1.5,13);
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.innerHTML="";
  host.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.minDistance=5;
  controls.maxDistance=24;
  controls.target.set(0,0,0);

  const light=new THREE.DirectionalLight(0xffffff,1.8); light.position.set(3,6,8); scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff,.65));

  geometry=new THREE.PlaneGeometry(12,6.75,cols-1,rows-1);
  texture=new THREE.VideoTexture(preview);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.72,metalness:.02,side:THREE.DoubleSide});
  mesh=new THREE.Mesh(geometry,mat);
  scene.add(mesh);

  const frame=new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(12.5,7.2,2.5)),
    new THREE.LineBasicMaterial({color:0x273140,transparent:true,opacity:.35})
  );
  scene.add(frame);
  depthCanvas=document.createElement("canvas");
  depthCanvas.width=cols; depthCanvas.height=rows; depthCtx=depthCanvas.getContext("2d",{willReadFrequently:true});
  resize();
  animate();
}

function resize(){
  if(!renderer)return;
  const r=host.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}

function rebuildDepth(force=false){
  if(!depthCtx||!preview.videoWidth||preview.readyState<2)return;
  const now=performance.now();
  if(!force && now-lastDepthUpdate<90)return;
  lastDepthUpdate=now;
  depthCtx.drawImage(preview,0,0,cols,rows);
  const px=depthCtx.getImageData(0,0,cols,rows).data;
  const pos=geometry.attributes.position;
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const i=(y*cols+x)*4;
      const lum=(px[i]*.2126+px[i+1]*.7152+px[i+2]*.0722)/255;
      const edge=Math.sin((x/cols)*Math.PI)*Math.sin((y/rows)*Math.PI);
      const motion=.18*Math.sin((preview.currentTime||0)*2.2+x*.035+y*.018);
      const z=(lum-.5)*2.0*edge+motion;
      pos.setZ(y*cols+x,z);
    }
  }
  pos.needsUpdate=true;
  $("points").textContent=String(cols*rows);
}

function animate(){
  raf=requestAnimationFrame(animate);
  rebuildDepth();
  controls?.update();
  if(texture)texture.needsUpdate=true;
  if(preview.duration)timeline.value=preview.currentTime;
  $("time").textContent=(preview.currentTime||0).toFixed(2)+" s";
  $("viewerTime").textContent="t = "+(preview.currentTime||0).toFixed(2)+" s";
  renderer?.render(scene,camera);
}

function activatePipeline(){
  ["p3","p4","p5","p6","p7"].forEach((id,i)=>setTimeout(()=>$(id).classList.add("active"),350+i*500));
  $("state").textContent="Reconstrucción 3D temporal lista";
}

async function analyze(){
  $("state").textContent="Analizando fotogramas y reconstruyendo profundidad…";
  activatePipeline();
  rebuildDepth(true);
  await new Promise(r=>setTimeout(r,2800));
  $("state").textContent="Escena 4D navegable lista";
}

input.onchange=()=>{
  const f=input.files[0]; if(!f)return;
  if(objectURL)URL.revokeObjectURL(objectURL);
  objectURL=URL.createObjectURL(f);
  preview.src=objectURL;
  $("fileName").textContent=f.name;
  workspace.classList.remove("hidden");
  preview.onloadedmetadata=()=>{
    const d=preview.duration||0;
    $("duration").textContent=d.toFixed(2)+" s";
    timeline.max=d;
    $("frames").textContent=Math.max(1,Math.ceil(d*5));
    if(!renderer)init3D(); else resize();
    rebuildDepth(true);
    analyze();
  };
};

timeline.oninput=()=>{preview.currentTime=+timeline.value;rebuildDepth(true)};
preview.ontimeupdate=()=>{timeline.value=preview.currentTime;$("time").textContent=preview.currentTime.toFixed(2)+" s";};
$("play4d").onclick=async()=>{
  playing=!playing;
  $("play4d").textContent=playing?"⏸ Pausar 4D":"▶ Reproducir 4D";
  if(playing)await preview.play(); else preview.pause();
};
preview.onplay=()=>{playing=true;$("play4d").textContent="⏸ Pausar 4D"};
preview.onpause=()=>{playing=false;$("play4d").textContent="▶ Reproducir 4D"};
$("analyze").onclick=analyze;
$("reset").onclick=()=>location.reload();
addEventListener("resize",resize);
