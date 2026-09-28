(function(){
"use strict";
const $=id=>document.getElementById(id);
const preview=$("preview"), workspace=$("workspace"), timeline=$("timeline");
let currentUrl=null, engineUrl=(window.__4D_ENGINE_URL__||"").replace(/\/$/,""), sceneFile=null, sceneReady=false;

function state(s){$("state").textContent=s;}
function syncTime(){
  const t=preview.currentTime||0;
  if(document.activeElement!==timeline)timeline.value=t;
  $("time").textContent=t.toFixed(2)+" s";
  $("viewerTime").textContent="t = "+t.toFixed(2)+" s";
}
function loadVideo(file,url){
  if(currentUrl&&currentUrl!==url)URL.revokeObjectURL(currentUrl);
  currentUrl=url||URL.createObjectURL(file);
  preview.src=currentUrl; preview.load(); preview.controls=true; preview.playsInline=true;
  workspace.classList.remove("hidden");
  $("fileName").textContent=file.name||"Video";
  $("duration").textContent="0.00 s"; $("frames").textContent="—";
  $("jobState").textContent=engineUrl?"GPU LISTO":"LOCAL";
  state(engineUrl?"Video cargado · motor GPU disponible":"Video cargado · visor listo");
}
window.addEventListener("a220-video-selected",e=>loadVideo(e.detail.file,e.detail.url));
window.addEventListener("a220-scene-selected",e=>{
  sceneFile=e.detail.file; workspace.classList.remove("hidden");
  sceneReady=true; $("jobState").textContent="4DGS"; $("points").textContent="—";
  state("Escena .4dgs seleccionada · lista para visor");
  setPipeline(7);
  showSceneMessage("Escena .4dgs recibida. El renderizador 4D se conecta al archivo cuando el paquete de visor esté desplegado.");
});
preview.addEventListener("loadedmetadata",()=>{
  if(!isFinite(preview.duration)||preview.duration<=0){state("No se pudo leer el video.");return;}
  $("duration").textContent=preview.duration.toFixed(2)+" s";
  $("frames").textContent=String(Math.ceil(preview.duration*30));
  timeline.max=preview.duration; timeline.value=0; syncTime();
});
preview.addEventListener("timeupdate",syncTime);
preview.addEventListener("play",()=>{$("play4d").textContent="⏸ Pausar";});
preview.addEventListener("pause",()=>{$("play4d").textContent="▶ Reproducir";});
preview.addEventListener("error",()=>state("No se pudo decodificar el video. Probá MP4/H.264."));
$("play4d").onclick=async()=>{try{if(preview.paused)await preview.play();else preview.pause();}catch(e){state("Tocá ▶ en el reproductor del video.");}};
timeline.oninput=()=>{if(isFinite(preview.duration))preview.currentTime=+timeline.value;};

function setPipeline(n){
  for(let i=2;i<=7;i++)$("p"+i).classList.toggle("active",i<=n);
}
function showSceneMessage(a){
  $("scene").innerHTML='<div class="sceneEmpty"><b>VISOR 4D</b><span>'+a+'</span></div>';
}
function setProgress(label,n){
  state(label+" · "+n+"%");
  $("jobState").textContent=n>=100?"LISTO":"PROCESANDO";
  setPipeline(Math.max(2,Math.min(7,Math.floor(n/17)+2)));
}

async function analyze(){
  if(!preview.src){state("Primero seleccioná un video.");return;}
  const b=$("analyze"); b.disabled=true;
  if(!engineUrl){
    setPipeline(2);
    $("jobState").textContent="SIN GPU";
    showSceneMessage("El video está listo. Falta conectar el worker GPU que ejecuta COLMAP/SfM + 4D Gaussian Splatting. No se muestra una escena falsa.");
    state("Motor GPU no conectado · captura preparada");
    b.disabled=false; return;
  }
  try{
    const blob=await fetch(preview.src).then(r=>r.blob());
    const fd=new FormData();
    fd.append("video",blob,$("fileName").textContent||"capture.mp4");
    setProgress("Subiendo captura",5);
    const r=await fetch(engineUrl+"/jobs",{method:"POST",body:fd});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const job=await r.json();
    const id=job.id;
    for(;;){
      await new Promise(r=>setTimeout(r,1800));
      const s=await fetch(engineUrl+"/jobs/"+encodeURIComponent(id)).then(r=>r.json());
      setProgress(s.message||s.status||"Procesando",Number(s.progress||0));
      if(s.status==="completed"){
        $("jobState").textContent="4DGS";
        $("points").textContent=s.gaussians??"—";
        state("Reconstrucción 4D terminada");
        if(s.scene_url)loadRemoteScene(s.scene_url);
        break;
      }
      if(s.status==="failed")throw new Error(s.error||"falló el worker");
    }
  }catch(e){
    $("jobState").textContent="ERROR";
    state("Error del motor: "+e.message);
    showSceneMessage("El worker GPU devolvió un error. La captura original sigue guardada en el celular.");
  }finally{b.disabled=false;}
}
async function loadRemoteScene(url){
  sceneReady=true; setPipeline(7);
  showSceneMessage("Escena 4D recibida. Cargando renderizador…");
  window.dispatchEvent(new CustomEvent("a220-4d-scene-ready",{detail:{url}}));
}
$("analyze").onclick=analyze;
showSceneMessage("Sin escena todavía · seleccioná un video y ejecutá Reconstruir 4D.");
})();