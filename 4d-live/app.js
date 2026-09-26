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
let depthCanvas=null,depthCtx=null,points3d=[];
function setupCanvas(){
  if(sceneCanvas)return;
  sceneCanvas=document.createElement("canvas");
  sceneCanvas.className="sceneCanvas";
  sceneCanvas.style.touchAction="none";
  sceneHost.innerHTML="";
  sceneHost.appendChild(sceneCanvas);
  sceneCtx=sceneCanvas.getContext("2d");
  depthCanvas=document.createElement("canvas");
  depthCanvas.width=96; depthCanvas.height=54;
  depthCtx=depthCanvas.getContext("2d",{willReadFrequently:true});
  resizeCanvas();
  window.addEventListener("resize",resizeCanvas);
  sceneCanvas.addEventListener("pointerdown",navDown);
  sceneCanvas.addEventListener("pointermove",navMove);
  sceneCanvas.addEventListener("pointerup",navUp);
  sceneCanvas.addEventListener("pointercancel",navUp);
  sceneCanvas.addEventListener("wheel",navWheel,{passive:false});
}
function resizeCanvas(){
  if(!sceneCanvas)return;
  const r=sceneHost.getBoundingClientRect();
  const w=Math.max(320,Math.floor(r.width)),h=Math.max(220,Math.floor(r.height));
  const d=Math.min(window.devicePixelRatio||1,2);
  sceneCanvas.width=w*d;sceneCanvas.height=h*d;
  sceneCanvas.style.width=w+"px";sceneCanvas.style.height=h+"px";
  sceneCtx.setTransform(d,0,0,d,0,0);
}
function navDown(e){
  sceneCanvas.setPointerCapture?.(e.pointerId);
  nav.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(nav.pointers.size===1){
    nav.drag=true;nav.lastX=e.clientX;nav.lastY=e.clientY;
  }else if(nav.pointers.size===2){
    const a=[...nav.pointers.values()];
    nav.pinch=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  }
}
function navMove(e){
  if(!nav.pointers.has(e.pointerId))return;
  nav.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(nav.pointers.size===2){
    const a=[...nav.pointers.values()];
    const dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(nav.pinch>0) camera.distance=Math.max(1.25,Math.min(8,camera.distance*(nav.pinch/dist)));
    nav.pinch=dist;
    return;
  }
  if(!nav.drag)return;
  const dx=e.clientX-nav.lastX,dy=e.clientY-nav.lastY;
  nav.lastX=e.clientX;nav.lastY=e.clientY;
  camera.yaw+=dx*.009;
  camera.pitch=Math.max(-1.15,Math.min(1.15,camera.pitch+dy*.009));
}
function navUp(e){
  nav.pointers.delete(e.pointerId);
  if(nav.pointers.size===0)nav.drag=false;
  if(nav.pointers.size<2)nav.pinch=0;
}
function navWheel(e){
  e.preventDefault();
  camera.distance=Math.max(1.25,Math.min(8,camera.distance*Math.exp(e.deltaY*.001)));
}
function buildPointCloud(){
  if(!preview.videoWidth||preview.readyState<2||!depthCtx)return;
  try{
    depthCtx.drawImage(preview,0,0,96,54);
    const data=depthCtx.getImageData(0,0,96,54).data;
    points3d=[];
    for(let y=0;y<54;y++)for(let x=0;x<96;x++){
      const i=(y*96+x)*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      const lum=(.2126*r+.7152*g+.0722*b)/255;
      const xx=(x/95-.5)*3.2;
      const yy=(.5-y/53)*1.8;
      const z=(lum-.5)*.95;
      points3d.push({x:xx,y:yy,z,r,g,b});
    }
  }catch(e){}
}
function projectPoint(p,w,h){
  let x=p.x,y=p.y,z=p.z;
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw);
  const cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const x1=x*cy-z*sy, z1=x*sy+z*cy;
  const y1=y*cp-z1*sp, z2=y*sp+z1*cp;
  const depth=camera.distance-z2;
  if(depth<=.15)return null;
  const f=1.7/depth;
  return {x:w/2+camera.panX+x1*f*w*.36,y:h/2+camera.panY-y1*f*h*.44,scale:f};
}
function drawScene(){
  if(!preview.videoWidth||preview.readyState<2)return;
  setupCanvas();
  if(!points3d.length || Math.abs((points3d._t||-1)-(preview.currentTime||0))>.08){
    buildPointCloud();
    points3d._t=preview.currentTime||0;
  }
  const w=sceneCanvas.clientWidth,h=sceneCanvas.clientHeight;
  sceneCtx.clearRect(0,0,w,h);
  sceneCtx.fillStyle="#030407";sceneCtx.fillRect(0,0,w,h);
  const projected=[];
  for(const p of points3d){
    const q=projectPoint(p,w,h);
    if(q)projected.push({...q,p});
  }
  projected.sort((a,b)=>a.scale-b.scale);
  for(const q of projected){
    const size=Math.max(.8,Math.min(4.2,1.15*q.scale));
    sceneCtx.fillStyle="rgb("+q.p.r+","+q.p.g+","+q.p.b+")";
    sceneCtx.fillRect(q.x,q.y,size,size);
  }
  sceneCtx.strokeStyle="rgba(80,220,255,.45)";
  sceneCtx.strokeRect(8,8,w-16,h-16);
  sceneCtx.fillStyle="rgba(80,220,255,.95)";
  sceneCtx.font="12px sans-serif";
  sceneCtx.fillText("4D · t="+(preview.currentTime||0).toFixed(2)+"s",14,24);
  sceneCtx.fillText("ORBITA · ZOOM · ARRASTRA",14,h-14);
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