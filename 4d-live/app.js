(function(){
"use strict";
const $=id=>document.getElementById(id);
const input=$("video"), preview=$("preview"), workspace=$("workspace"), timeline=$("timeline"), sceneHost=$("scene");
let currentUrl=null, sceneCanvas=null, sceneCtx=null, raf=0;

function state(s){$("state").textContent=s;}
function syncTime(){
  const t=preview.currentTime||0;
  if(timeline && document.activeElement!==timeline) timeline.value=t;
  $("time").textContent=t.toFixed(2)+" s";
  $("viewerTime").textContent="t = "+t.toFixed(2)+" s";
}

function loadVideo(file,url){
  if(!file)return;
  if(currentUrl && currentUrl!==url) URL.revokeObjectURL(currentUrl);
  currentUrl=url||URL.createObjectURL(file);
  preview.pause();
  preview.src=currentUrl;
  preview.controls=true;
  preview.playsInline=true;
  workspace.classList.remove("hidden");
  $("fileName").textContent=file.name||"Video";
  $("selectedFile").textContent=(file.name||"Video")+" · "+(file.size/1048576).toFixed(1)+" MB";
  $("frames").textContent="0"; $("points").textContent="0";
  state("Video seleccionado · cargando…");
  preview.load();
}

window.addEventListener("a220-video-selected",e=>loadVideo(e.detail.file,e.detail.url));

preview.addEventListener("loadedmetadata",function(){
  const d=preview.duration;
  if(!isFinite(d)||d<=0){state("No se pudo leer la duración del video.");return;}
  $("duration").textContent=d.toFixed(2)+" s";
  $("frames").textContent=String(Math.max(1,Math.ceil(d*5)));
  timeline.min=0; timeline.max=d; timeline.value=0;
  state("Video cargado · listo");
});
preview.addEventListener("loadeddata",()=>drawScene());
preview.addEventListener("canplay",()=>drawScene());
preview.addEventListener("timeupdate",syncTime);
preview.addEventListener("play",()=>{$("play4d").textContent="⏸ Pausar";});
preview.addEventListener("pause",()=>{$("play4d").textContent="▶ Reproducir";});
preview.addEventListener("error",()=>state("ERROR: el celular/navegador no puede decodificar este video. Probá MP4 H.264."));

$("play4d").addEventListener("click",async()=>{
  if(!preview.src){state("Primero seleccioná un video.");return;}
  try{
    if(preview.paused) await preview.play();
    else preview.pause();
  }catch(e){state("No se pudo reproducir automáticamente. Tocá ▶ en el reproductor.");}
});

timeline.addEventListener("input",()=>{if(isFinite(preview.duration))preview.currentTime=Number(timeline.value);});

let camera={yaw:0,pitch:0,distance:3.2,panX:0,panY:0};
let nav={drag:false,lastX:0,lastY:0,pointers:new Map(),pinch:0};

function navSurface(){
  if(!sceneCanvas)return;
  sceneCanvas.style.touchAction="none";
  sceneCanvas.onpointerdown=navDown;
  sceneCanvas.onpointermove=navMove;
  sceneCanvas.onpointerup=navUp;
  sceneCanvas.onpointercancel=navUp;
  sceneCanvas.onpointerleave=navUp;
  sceneCanvas.onwheel=navWheel;
  sceneCanvas.ontouchstart=()=>{};
}
function navDown(e){
  e.preventDefault();
  nav.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try{sceneCanvas.setPointerCapture(e.pointerId);}catch(_){}
  if(nav.pointers.size===1){nav.drag=true;nav.lastX=e.clientX;nav.lastY=e.clientY;}
  else if(nav.pointers.size===2){
    const v=[...nav.pointers.values()];
    nav.pinch=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
  }
}
function navMove(e){
  if(!nav.pointers.has(e.pointerId))return;
  e.preventDefault();
  nav.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(nav.pointers.size===2){
    const v=[...nav.pointers.values()];
    const d=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
    if(nav.pinch>0)camera.distance=Math.max(1.1,Math.min(10,camera.distance*(nav.pinch/d)));
    nav.pinch=d; return;
  }
  if(nav.drag){
    camera.yaw+=(e.clientX-nav.lastX)*0.014;
    camera.pitch=Math.max(-1.35,Math.min(1.35,camera.pitch+(e.clientY-nav.lastY)*0.014));
    nav.lastX=e.clientX;nav.lastY=e.clientY;
  }
}
function navUp(e){nav.pointers.delete(e.pointerId);if(nav.pointers.size===0)nav.drag=false;if(nav.pointers.size<2)nav.pinch=0;}
function navWheel(e){e.preventDefault();camera.distance=Math.max(1.1,Math.min(10,camera.distance*Math.exp(e.deltaY*.0015)));}

function setupCanvas(){
  if(sceneCanvas)return;
  sceneCanvas=document.createElement("canvas");
  sceneCanvas.className="sceneCanvas";
  sceneCanvas.style.cssText="width:100%;height:100%;display:block;touch-action:none;cursor:grab;";
  sceneHost.innerHTML="";
  sceneHost.appendChild(sceneCanvas);
  sceneCtx=sceneCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize",resizeCanvas);
  navSurface();
}
function resizeCanvas(){
  if(!sceneCanvas)return;
  const r=sceneHost.getBoundingClientRect(),w=Math.max(320,Math.floor(r.width)),h=Math.max(220,Math.floor(r.height));
  const d=Math.min(devicePixelRatio||1,2);
  sceneCanvas.width=w*d;sceneCanvas.height=h*d;sceneCtx.setTransform(d,0,0,d,0,0);
}
function buildPointCloud(){
  if(!preview.videoWidth||preview.readyState<2)return;
  const c=document.createElement("canvas");c.width=80;c.height=45;
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(preview,0,0,80,45);
  const d=x.getImageData(0,0,80,45).data;points3d=[];
  for(let y=0;y<45;y++)for(let xx=0;xx<80;xx++){
    const i=(y*80+xx)*4,r=d[i],g=d[i+1],bb=d[i+2],lum=(.2126*r+.7152*g+.0722*bb)/255;
    points3d.push({x:(xx/79-.5)*3.4,y:(.5-y/44)*2,z:(lum-.5)*1.2,r,g,b:bb});
  }
}
function projectPoint(p,w,h){
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const x=p.x*cy-p.z*sy,z1=p.x*sy+p.z*cy,y=p.y*cp-z1*sp,z=p.y*sp+z1*cp,depth=camera.distance-z;
  if(depth<=.12)return null;
  const f=1.8/depth;
  return {x:w/2+camera.panX+x*f*w*.34,y:h/2+camera.panY-y*f*h*.43,s:Math.max(.7,Math.min(5,1.4*f)),z};
}
function drawScene(){
  if(!preview.videoWidth||preview.readyState<2)return;
  setupCanvas();
  if(!points3d.length||Math.abs((points3d._t??-99)-(preview.currentTime||0))>.12){buildPointCloud();points3d._t=preview.currentTime||0;}
  const w=sceneCanvas.clientWidth,h=sceneCanvas.clientHeight;
  sceneCtx.clearRect(0,0,w,h);sceneCtx.fillStyle="#030407";sceneCtx.fillRect(0,0,w,h);
  const p=points3d.map(v=>{const q=projectPoint(v,w,h);return q?{q,v}:null}).filter(Boolean).sort((a,b)=>a.q.z-b.q.z);
  for(const o of p){sceneCtx.fillStyle="rgb("+o.v.r+","+o.v.g+","+o.v.b+")";sceneCtx.fillRect(o.q.x,o.q.y,o.q.s,o.q.s);}
  sceneCtx.strokeStyle="rgba(80,220,255,.5)";sceneCtx.strokeRect(8,8,w-16,h-16);
  sceneCtx.fillStyle="#fff";sceneCtx.font="12px sans-serif";
  sceneCtx.fillText("4D · t="+(preview.currentTime||0).toFixed(2)+"s",14,24);
  sceneCtx.fillText("DESLIZÁ PARA ORBITAR · 2 DEDOS PARA ZOOM",14,h-14);
}
function loop(){drawScene();raf=requestAnimationFrame(loop);}
setupCanvas();loop();

async function analyze(){
  if(!preview.videoWidth||!isFinite(preview.duration)){state("Primero seleccioná un video válido.");return;}
  const b=$("analyze");b.disabled=true;preview.pause();
  const old=preview.currentTime;
  const samples=Math.min(20,Math.max(4,Math.ceil(preview.duration*1.5)));
  const c=document.createElement("canvas");c.width=48;c.height=27;
  const ctx=c.getContext("2d",{willReadFrequently:true});
  let prev=null,motion=0;
  for(let i=0;i<samples;i++){
    const t=(i/(samples-1))*Math.max(0,preview.duration-.02);
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;preview.removeEventListener("seeked",finish);clearTimeout(timer);resolve();};
      const timer=setTimeout(finish,700);
      preview.addEventListener("seeked",finish,{once:true});
      preview.currentTime=t;
    });
    try{
      ctx.drawImage(preview,0,0,48,27);
      const d=ctx.getImageData(0,0,48,27).data;
      if(prev){let diff=0;for(let p=0;p<d.length;p+=4)diff+=Math.abs(d[p]-prev[p])+Math.abs(d[p+1]-prev[p+1])+Math.abs(d[p+2]-prev[p+2]);motion+=diff/(48*27*3*255);}
      prev=d;
    }catch(e){}
    $("points").textContent=String((i+1)*5184);
    state("Analizando · "+Math.round((i+1)/samples*100)+"%");
    await new Promise(r=>setTimeout(r,0));
  }
  preview.currentTime=Math.min(old,Math.max(0,preview.duration-.02));
  $("p3").classList.add("active");$("p4").classList.add("active");$("p5").classList.add("active");
  $("p6").classList.add("active");$("p7").classList.add("active");
  state("Reconstrucción terminada · "+samples+" muestras · movimiento "+(motion/Math.max(1,samples-1)*100).toFixed(1)+"%");
  drawScene();b.disabled=false;
}
$("analyze").addEventListener("click",analyze);
})();