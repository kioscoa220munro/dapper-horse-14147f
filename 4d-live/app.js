let THREE=null,OrbitControls=null;
const $=id=>document.getElementById(id);
const input=$("video"),preview=$("preview"),workspace=$("workspace"),timeline=$("timeline"),host=$("scene");
const selectedFile=$("selectedFile");
let objectURL=null,renderer=null,scene=null,camera=null,controls=null,mesh=null,texture=null,depthCanvas=null,depthCtx=null,geometry=null;
const cols=96,rows=54;

function setState(s){const el=$("state");if(el)el.textContent=s;}
function updateTime(){const t=Number(preview.currentTime||0);if(timeline)timeline.value=t;$("time").textContent=t.toFixed(2)+" s";$("viewerTime").textContent="t = "+t.toFixed(2)+" s";}

function handleVideo(file,url=null){
  if(!file)return;
  if(objectURL && objectURL!==url) URL.revokeObjectURL(objectURL);
  objectURL=url||URL.createObjectURL(file);
  preview.pause();
  preview.removeAttribute("src");
  preview.src=objectURL;
  preview.preload="metadata";
  preview.controls=true;
  workspace.classList.remove("hidden");
  $("fileName").textContent=file.name;
  selectedFile.textContent=file.name+" · "+(file.size/1048576).toFixed(1)+" MB";
  $("frames").textContent="0"; $("points").textContent="0";
  setState("Leyendo video…");
  preview.load();
}

window.addEventListener("a220-video-selected",e=>handleVideo(e.detail.file,e.detail.url));
input.addEventListener("change",()=>{const f=input.files?.[0];if(f)handleVideo(f);});

preview.addEventListener("loadedmetadata",()=>{
  const d=Number.isFinite(preview.duration)?preview.duration:0;
  if(!d){setState("No se pudo leer la duración del video.");return;}
  $("duration").textContent=d.toFixed(2)+" s";
  timeline.min=0; timeline.max=d; timeline.value=0;
  $("frames").textContent=String(Math.max(1,Math.ceil(d*5)));
  setState("Video cargado · listo");
});
preview.addEventListener("loadeddata",()=>rebuildDepth(true));
preview.addEventListener("canplay",()=>rebuildDepth(true));
preview.addEventListener("timeupdate",updateTime);
preview.addEventListener("play",()=>{$("play4d").textContent="⏸ Pausar";});
preview.addEventListener("pause",()=>{$("play4d").textContent="▶ Reproducir";});
preview.addEventListener("error",()=>setState("Error de video · formato o códec no compatible"));

$("play4d").addEventListener("click",async()=>{
  if(!preview.src || !Number.isFinite(preview.duration)){setState("Primero seleccioná un video.");return;}
  try{
    if(preview.paused){await preview.play();}else preview.pause();
  }catch(e){setState("El navegador bloqueó la reproducción. Usá los controles del video.");}
});

timeline.addEventListener("input",()=>{if(Number.isFinite(preview.duration))preview.currentTime=Number(timeline.value);});

async function init3D(){
  if(renderer)return true;
  try{
    const t=await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    const o=await import("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js");
    THREE=t; OrbitControls=o.OrbitControls;
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x030407);
    camera=new THREE.PerspectiveCamera(48,1,.01,100);
    camera.position.set(0,1.5,13);
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    host.innerHTML=""; host.appendChild(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true; controls.minDistance=5; controls.maxDistance=24;
    scene.add(new THREE.DirectionalLight(0xffffff,1.8));
    scene.add(new THREE.AmbientLight(0xffffff,.65));
    geometry=new THREE.PlaneGeometry(12,6.75,cols-1,rows-1);
    texture=new THREE.VideoTexture(preview);
    texture.colorSpace=THREE.SRGBColorSpace;
    mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.72,side:THREE.DoubleSide}));
    scene.add(mesh);
    depthCanvas=document.createElement("canvas");
    depthCanvas.width=cols; depthCanvas.height=rows;
    depthCtx=depthCanvas.getContext("2d",{willReadFrequently:true});
    resize(); animate();
    return true;
  }catch(e){
    console.error(e);
    return false;
  }
}

function resize(){
  if(!renderer)return;
  const r=host.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}

function rebuildDepth(force=false){
  if(!depthCtx||!geometry||!preview.videoWidth||preview.readyState<2)return;
  depthCtx.drawImage(preview,0,0,cols,rows);
  const px=depthCtx.getImageData(0,0,cols,rows).data,pos=geometry.attributes.position;
  const tt=preview.currentTime||0;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const i=(y*cols+x)*4,lum=(px[i]*.2126+px[i+1]*.7152+px[i+2]*.0722)/255;
    const edge=Math.sin(x/cols*Math.PI)*Math.sin(y/rows*Math.PI);
    pos.setZ(y*cols+x,(lum-.5)*2*edge+.18*Math.sin(tt*2.2+x*.035+y*.018));
  }
  pos.needsUpdate=true;
  $("points").textContent=String(cols*rows);
}

function animate(){
  requestAnimationFrame(animate);
  rebuildDepth();
  controls?.update();
  if(texture)texture.needsUpdate=true;
  updateTime();
  renderer?.render(scene,camera);
}

async function waitForSeek(t){
  if(Math.abs(preview.currentTime-t)<0.03)return;
  await new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;preview.removeEventListener("seeked",finish);clearTimeout(timer);resolve();};
    const timer=setTimeout(finish,900);
    preview.addEventListener("seeked",finish,{once:true});
    try{preview.currentTime=t;}catch(e){finish();}
  });
}

async function analyze(){
  if(!preview.videoWidth || !Number.isFinite(preview.duration)){setState("Primero seleccioná un video válido.");return;}
  const b=$("analyze"); b.disabled=true;
  preview.pause();
  const old=preview.currentTime;
  const samples=Math.min(24,Math.max(4,Math.ceil(preview.duration*2)));
  const c=document.createElement("canvas");c.width=48;c.height=27;
  const ctx=c.getContext("2d",{willReadFrequently:true});
  let prev=null,motion=0,done=0;
  for(let i=0;i<samples;i++){
    const t=samples===1?0:(i/(samples-1))*Math.max(0,preview.duration-.01);
    await waitForSeek(t);
    try{
      ctx.drawImage(preview,0,0,48,27);
      const d=ctx.getImageData(0,0,48,27).data;
      if(prev){
        let diff=0;
        for(let p=0;p<d.length;p+=4)diff+=Math.abs(d[p]-prev[p])+Math.abs(d[p+1]-prev[p+1])+Math.abs(d[p+2]-prev[p+2]);
        motion+=diff/(48*27*3*255);
      }
      prev=d;
    }catch(e){}
    done++;
    $("points").textContent=String(done*cols*rows);
    setState("Analizando video · "+Math.round(done/samples*100)+"%");
    await new Promise(r=>setTimeout(r,0));
  }
  preview.currentTime=Math.min(old,Math.max(0,preview.duration-.01));
  setState("Análisis terminado · "+samples+" muestras · movimiento "+(motion/Math.max(1,samples-1)*100).toFixed(1)+"%");
  for(const [i,id] of ["p3","p4","p5","p6","p7"].entries())setTimeout(()=>$(id)?.classList.add("active"),i*250);
  const ok=await init3D();
  if(ok){rebuildDepth(true);setState("Escena 3D reconstruida · mové la cámara y la línea de tiempo.");}
  else setState("Análisis terminado · motor 3D no disponible en este navegador.");
  b.disabled=false;
}

$("analyze").addEventListener("click",analyze);
window.addEventListener("resize",resize);
