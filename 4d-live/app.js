import { createSession } from "https://cdn.jsdelivr.net/gh/arrival-space/splat.js@main/src/index.js";
import { extractSharpFrames } from "https://cdn.jsdelivr.net/gh/arrival-space/splat.js@main/src/io/video.js";

const $ = (id) => document.getElementById(id);
const preview = $("preview");
const workspace = $("workspace");
const timeline = $("timeline");
const scene = $("scene");

let currentUrl = null;
let currentFile = null;
let session = null;
let pickedFrames = [];
let cameraTimes = [];
let cameraMeta = [];
let reconstructed = false;
let training = false;

function state(message) { $("state").textContent = message; }
function setPipeline(n) { for (let i = 1; i <= 7; i++) $("p" + i)?.classList.toggle("active", i <= n); }
function status(job, message) { $("jobState").textContent = job; if (message) state(message); }
function fmtTime(t) { return `${(Number(t) || 0).toFixed(2)} s`; }
function showMessage(title, message) { scene.innerHTML = `<div class="sceneEmpty"><b>${title}</b><span>${message}</span></div>`; }
function canUseWebGPU() { return typeof navigator !== "undefined" && !!navigator.gpu; }

function resizeCanvas(canvas) {
  const r = scene.getBoundingClientRect();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
}

function nearestCameraIndex(t) {
  if (!cameraTimes.length) return -1;
  let best = 0, dist = Infinity;
  for (let i = 0; i < cameraTimes.length; i++) {
    const d = Math.abs(cameraTimes[i] - t);
    if (d < dist) { dist = d; best = i; }
  }
  return best;
}

function syncTime() {
  const t = Number(preview.currentTime || 0);
  timeline.value = String(t);
  $("time").textContent = fmtTime(t);
  $("viewerTime").textContent = `t = ${fmtTime(t)}`;
  if (reconstructed && session && cameraMeta.length) {
    const ci = nearestCameraIndex(t);
    if (ci >= 0) { try { session.view.lookThrough(ci); } catch (e) { console.warn(e); } }
  }
}

function loadVideo(file, url) {
  if (currentUrl && currentUrl !== url) URL.revokeObjectURL(currentUrl);
  currentUrl = url || URL.createObjectURL(file);
  currentFile = file;
  preview.src = currentUrl;
  preview.load();
  preview.controls = true;
  preview.playsInline = true;
  workspace.classList.remove("hidden");
  $("fileName").textContent = file.name || "Video";
  $("duration").textContent = "0.00 s";
  $("frames").textContent = "—";
  $("points").textContent = "—";
  $("exportPly").hidden = true;
  $("analyze").disabled = false;
  reconstructed = false;
  training = false;
  status("LOCAL", "Video cargado · listo para reconstruir");
  setPipeline(1);
  showMessage("VISOR 4D", "La escena aparecerá después de la reconstrucción real.");
}

window.addEventListener("a220-video-selected", (e) => loadVideo(e.detail.file, e.detail.url));

preview.addEventListener("loadedmetadata", () => {
  if (!Number.isFinite(preview.duration) || preview.duration <= 0) { state("No se pudo leer la duración del video."); return; }
  $("duration").textContent = fmtTime(preview.duration);
  timeline.max = preview.duration;
  timeline.value = 0;
  syncTime();
});
preview.addEventListener("timeupdate", syncTime);
preview.addEventListener("play", () => $("play4d").textContent = "⏸ Pausar");
preview.addEventListener("pause", () => $("play4d").textContent = "▶ Reproducir");
preview.addEventListener("error", () => state("No se pudo decodificar el video. Probá MP4/H.264."));

$("play4d").onclick = async () => {
  try { if (preview.paused) await preview.play(); else preview.pause(); }
  catch { state("Tocá ▶ en el reproductor del video."); }
};
timeline.oninput = () => { if (Number.isFinite(preview.duration)) preview.currentTime = Number(timeline.value); syncTime(); };

async function extractVideoFrames(file) {
  setPipeline(2);
  status("ANALIZANDO", "Analizando nitidez y movimiento del video…");
  const result = await extractSharpFrames(file, {
    maxFrames: matchMedia("(any-pointer: coarse)").matches ? 48 : 100,
    minFrames: 12,
    minGapSec: 0.15,
    maxGapSec: 0.35,
    thumbs: false,
    onProgress: (e) => {
      const pct = e.stage === "scan" ? 10 + (e.done / Math.max(1, e.total)) * 20 : 30 + (e.done / Math.max(1, e.total)) * 15;
      state(`Preparando fotogramas · ${Math.round(pct)}%`);
    },
  });
  if (!result.frames || result.frames.length < 8) throw new Error("El video no tiene suficientes fotogramas conectables.");
  return result;
}

async function reconstruct() {
  if (!currentFile) { state("Primero seleccioná un video."); return; }
  if (!canUseWebGPU()) {
    status("SIN WEBGPU", "Este dispositivo/navegador no expone WebGPU. No se muestra una reconstrucción falsa.");
    showMessage("WEBGPU NO DISPONIBLE", "La reconstrucción real necesita WebGPU. Probá Chrome/Edge actualizado con aceleración gráfica activa.");
    return;
  }

  const button = $("analyze");
  button.disabled = true;
  $("exportPly").hidden = true;
  reconstructed = false;
  training = false;
  setPipeline(1);

  try {
    const result = await extractVideoFrames(currentFile);
    pickedFrames = result.frames;
    $("frames").textContent = String(pickedFrames.length);
    $("duration").textContent = fmtTime(result.duration);
    timeline.max = result.duration;
    status("PREPARANDO", `${pickedFrames.length} fotogramas nítidos seleccionados`);

    const phone = matchMedia("(any-pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 820;
    session = createSession({
      maxIters: phone ? 8000 : 14000,
      holdout: -1,
      maxViewW: Math.ceil(screen.width || 900),
      maxViewH: Math.ceil(screen.height || 700),
      initTarget: phone ? 30000 : 60000,
      frames: { featMaxDim: phone ? 720 : 960, trainMaxDim: phone ? 640 : 960 },
      trainer: { shDeg: 0, maxSplats: phone ? 180000 : 400000 },
      // GitHub Pages is a different origin from the Splat.js CDN. Its SIFT and
      // RANSAC workers must be same-origin, so use the library's deterministic
      // inline fallbacks until the workers are vendored into this site.
      workers: false,
      pairWorkers: false,
      ...(phone ? { lowMem: true, sfm: { workers: 3, uiYield: true } } : {}),
    });

    session.on("stage", (e) => {
      const stage = String(e.stage || "");
      if (stage === "decode") { setPipeline(2); status("FRAMES", `Decodificando ${e.done || 0}/${e.total || pickedFrames.length}`); }
      else if (stage === "solve") { setPipeline(3); status("SFM", `Recuperando poses · ${e.done || 0}/${e.total || pickedFrames.length}`); }
      else if (stage === "seed") { setPipeline(4); status("GAUSSIANS", "Inicializando Gaussianas…"); }
      else if (stage === "train") { setPipeline(5); status("ENTRENANDO", `${Math.round((e.done || 0) / Math.max(1, e.total || 1) * 100)}%`); }
    });
    session.on("metrics", (m) => {
      $("points").textContent = Number(m.splats || 0).toLocaleString("es-AR");
      if (training) status("GPU LOCAL", `Entrenando · ${m.iter || 0} ciclos`);
    });
    session.on("event", (e) => {
      if (e.kind === "device-lost") {
        training = false;
        status("GPU PERDIDA", "El dispositivo gráfico se perdió. La reconstrucción no fue inventada ni completada.");
        showMessage("GPU INTERRUMPIDA", "El sistema liberó el dispositivo WebGPU durante el entrenamiento.");
      }
      if (e.kind === "train-complete") {
        training = false;
        reconstructed = true;
        setPipeline(7);
        status("LISTO", "Reconstrucción 3D + trayectoria temporal terminada");
        $("exportPly").hidden = false;
        $("analyze").disabled = false;
      }
    });

    const files = pickedFrames.map((f) => ({ source: f.source, name: f.name, exif: f.exif }));
    await session.load(files);
    setPipeline(2);
    status("SFM", "Buscando correspondencias y poses…");
    await session.solve();
    if (!session.recon || session.recon.cams.length < 3) throw new Error(`Solo se pudieron registrar ${session.recon?.cams?.length || 0} cámaras.`);
    setPipeline(3);

    await session.seed();
    setPipeline(4);

    scene.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "gaussianCanvas";
    scene.appendChild(canvas);
    resizeCanvas(canvas);
    session.view.attach(canvas);
    new ResizeObserver(() => resizeCanvas(canvas)).observe(scene);

    cameraMeta = session.trainer.camMeta || [];
    cameraTimes = cameraMeta.map((c) => pickedFrames[c.imgIdx]?.t ?? 0);
    if (cameraMeta.length) session.view.lookThrough(0);
    setPipeline(5);
    training = true;
    status("GPU LOCAL", "Entrenamiento WebGPU iniciado…");
    session.start();
  } catch (e) {
    console.error(e);
    training = false;
    status("ERROR", e?.message || "Falló la reconstrucción real");
    showMessage("RECONSTRUCCIÓN FALLIDA", e?.message || "El motor no pudo completar la reconstrucción.");
    button.disabled = false;
  }
}

$("analyze").onclick = reconstruct;

$("exportPly").onclick = async () => {
  if (!session) return;
  const b = $("exportPly");
  b.disabled = true;
  try {
    state("Preparando archivo .PLY…");
    const blob = await session.exportPlyBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (currentFile?.name || "escena").replace(/.[^.]+$/, "") + "-4d-base.ply";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    status("LISTO", "Escena 3D exportada como .PLY");
  } catch (e) {
    state("No se pudo exportar: " + (e?.message || e));
  } finally { b.disabled = false; }
};

window.addEventListener("beforeunload", () => { try { session?.pause(); } catch {} });
