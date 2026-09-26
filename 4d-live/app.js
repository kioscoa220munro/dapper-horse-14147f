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

function setupCanvas(){
  if(sceneCanvas)return;
  sceneCanvas=document.createElement("canvas");
  sceneCanvas.className="sceneCanvas";
  sceneHost.innerHTML="";
  sceneHost.appendChild(sceneCanvas);
  sceneCtx=sceneCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize",resizeCanvas);
}
function resizeCanvas(){
  if(!sceneCanvas)return;
  const r=sceneHost.getBoundingClientRect();
  const w=Math.max(320,Math.floor(r.width)),h=Math.max(220,Math.floor(r.height));
  const d=Math.min(window.devicePixelRatio||1,2);
  sceneCanvas.width=w*d;sceneCanvas.height=h*d;sceneCanvas.style.width=w+"px";sceneCanvas.style.height=h+"px";
  sceneCtx.setTransform(d,0,0,d,0,0);
}
function drawScene(){
  if(!preview.videoWidth||preview.readyState<2)return;
  setupCanvas();
  const w=sceneCanvas.clientWidth,h=sceneCanvas.clientHeight;
  sceneCtx.clearRect(0,0,w,h);
  sceneCtx.fillStyle="#030407";sceneCtx.fillRect(0,0,w,h);
  const scale=Math.min((w-30)/preview.videoWidth,(h-30)/preview.videoHeight);
  const dw=preview.videoWidth*scale,dh=preview.videoHeight*scale,x=(w-dw)/2,y=(h-dh)/2;
  sceneCtx.save();
  sceneCtx.translate(w/2,h/2);
  const z=1+0.035*Math.sin((preview.currentTime||0)*2);
  sceneCtx.scale(z,z);
  sceneCtx.translate(-w/2,-h/2);
  sceneCtx.globalAlpha=.95;
  sceneCtx.drawImage(preview,x,y,dw,dh);
  sceneCtx.restore();
  sceneCtx.strokeStyle="rgba(80,220,255,.55)";
  sceneCtx.strokeRect(x,y,dw,dh);
  sceneCtx.fillStyle="rgba(80,220,255,.9)";
  sceneCtx.font="12px sans-serif";
  sceneCtx.fillText("4D · t="+(preview.currentTime||0).toFixed(2)+"s",12,20);
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