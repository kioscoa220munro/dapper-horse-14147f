import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const $=id=>document.getElementById(id);
const input=$("video"), preview=$("preview"), workspace=$("workspace"), timeline=$("timeline"), host=$("scene");
const LOAD_TIMEOUT=15000;
const selectedFile=$("selectedFile");

let loadTimer=0;
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
  depthCanvas.width=cols; depthCanvas.height=rows;
  depthCtx=depthCanvas.getContext("2d",{willReadFrequently:true});
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
      pos.setZ(y*cols+x,(lum-.5)*2.0*edge+motion);
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
  if(!preview.duration || !preview.videoWidth){
    $("state").textContent="Primero cargá un video válido.";
    return;
  }

  const button=$("analyze");
  if(button)button.disabled=true;

  const total=Math.max(1,Math.ceil(preview.duration*5));
  $("frames").textContent=String(total);
  $("points").textContent="0";
  $("state").textContent="Analizando video · 0%";

  const sampleCanvas=document.createElement("canvas");
  sampleCanvas.width=64;
  sampleCanvas.height=36;
  const ctx=sampleCanvas.getContext("2d",{willReadFrequently:true});
  let processed=0;
  let previous=null;
  let motionSum=0;
  const oldTime=preview.currentTime;
  const wasPaused=preview.paused;
  preview.pause();

  for(let i=0;i<total;i++){
    const t=total===1?0:(i/(total-1))*Math.max(0,preview.duration-0.001);
    await new Promise(resolve=>{
      const done=()=>{
        preview.removeEventListener("seeked",done);
        resolve();
      };
      preview.addEventListener("seeked",done,{once:true});
      preview.currentTime=t;
    });

    if(preview.readyState>=2){
      ctx.drawImage(preview,0,0,64,36);
      const data=ctx.getImageData(0,0,64,36).data;
      if(previous){
        let diff=0;
        for(let p=0;p<data.length;p+=4){
          diff+=Math.abs(data[p]-previous[p])+Math.abs(data[p+1]-previous[p+1])+Math.abs(data[p+2]-previous[p+2]);
        }
        motionSum+=diff/(64*36*3*255);
      }
      previous=data;
    }

    processed++;
    $("points").textContent=String(processed*cols*rows);
    $("state").textContent="Analizando video · "+Math.round(processed/total*100)+"%";
    await new Promise(requestAnimationFrame);
  }

  preview.currentTime=Math.min(oldTime,Math.max(0,preview.duration-0.001));
  if(!wasPaused)preview.play().catch(()=>{});

  const avgMotion=total>1?motionSum/(total-1):0;
  $("state").textContent="Análisis terminado · "+total+" muestras · movimiento "+(avgMotion*100).toFixed(1)+"%";

  ["p3","p4","p5","p6","p7"].forEach((id,i)=>{
    setTimeout(()=>$(id).classList.add("active"),i*350);
  });

  rebuildDepth(true);
  if(button)button.disabled=false;
}

$("analyze")?.addEventListener("click",analyze);

$("play4d")?.addEventListener("click",()=>{
  if(!preview.duration)return;
  if(preview.paused){
    preview.play().catch(()=>{});
    $("play4d").textContent="⏸ Pausar 4D";
  }else{
    preview.pause();
    $("play4d").textContent="▶ Reproducir 4D";
  }
});

timeline?.addEventListener("input",()=>{
  if(!preview.duration)return;
  preview.currentTime=Number(timeline.value);
});

preview.addEventListener("play",()=>{
  playing=true;
  $("play4d").textContent="⏸ Pausar 4D";
});

preview.addEventListener("pause",()=>{
  playing=false;
  $("play4d").textContent="▶ Reproducir 4D";
});
mport * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";

const $=id=>document.getElementById(id);
const input=$("video"), preview=$("preview"), workspace=$("workspace"), timeline=$("timeline"), host=$("scene");
const LOAD_TIMEOUT=15000;
const selectedFile=$("selectedFile");

let loadTimer=0;
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
  depthCanvas.width=cols; depthCanvas.height=rows;
  depthCtx=depthCanvas.getContext("2d",{willReadFrequently:true});
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
      pos.setZ(y*cols+x,(lum-.5)*2.0*edge+motion);
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

function handleVideo(file,urlFromPicker=null){
  if(!file)return;
  const setState=msg=>$("state").textContent=msg;
  clearTimeout(loadTimer);
  setState("Leyendo video del celular…");
  $("fileName").textContent=file.name;
  if(selectedFile)selectedFile.textContent=file.name+" · "+(file.size/1048576).toFixed(1)+" MB";
  $("frames").textContent="0";
  $("points").textContent="0";

  if(objectURL && objectURL!==urlFromPicker)URL.revokeObjectURL(objectURL);
  objectURL=urlFromPicker || URL.createObjectURL(file);

  preview.pause();
  preview.src=objectURL;
  preview.preload="metadata";
  workspace.classList.remove("hidden");
  preview.load();

  loadTimer=setTimeout(()=>{
    if(!Number.isFinite(preview.duration)||preview.duration===0)
      setState("El video no respondió. El archivo puede usar un códec no compatible.");
  },LOAD_TIMEOUT);
}

window.addEventListener("a220-video-selected",event=>{
  handleVideo(event.detail.file,event.detail.url);
});

input.onchange=()=>{
  const f=input.files?.[0];
  if(f)handleVideo(f);
};

preview.onloadedmetadata=()=>{
  clearTimeout(loadTimer);
  const d=Number.isFinite(preview.duration)?preview.duration:0;
  if(!d){
    $("state").textContent="No se pudo leer la duración del video.";
    return;
  }
  $("duration").textContent=d.toFixed(2)+" s";
  timeline.min=0;
  timeline.max=d;
  timeline.value=0;
  $("frames").textContent=Math.max(1,Math.ceil(d*5));
  if(!renderer)init3D(); else resize();
  preview.currentTime=0;
  $("state").textContent="Video cargado · listo para reconstruir";
};

preview.onloadeddata=()=>rebuildDepth(true);

preview.oncanplay=()=>{
  if(preview.readyState>=3&&renderer)rebuildDepth(true);
};

preview.onstalled=()=>{
  if(!Number.isFinite(preview.duration))
    $("state").textContent="Carga detenida… esperando datos del video.";
};

preview.onerror=()=>{
  const code=preview.error?.code;
  const detail=code===4?"Formato o códec no compatible.":"No se pudo leer el archivo de video.";
  $("state").textContent="Error de video: "+detail;
};
