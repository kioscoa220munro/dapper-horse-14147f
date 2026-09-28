import os, uuid, subprocess, threading, time
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT=Path(os.getenv("DATA_DIR","/data"))
ROOT.mkdir(parents=True,exist_ok=True)
JOBS={}

app=FastAPI(title="4D Engine")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])

def run_job(job_id, video_path):
    job=JOBS[job_id]
    job.update(status="running",progress=5,message="Extrayendo captura")
    try:
        out=ROOT/job_id
        out.mkdir(parents=True,exist_ok=True)
        frames=out/"frames"; frames.mkdir(exist_ok=True)
        subprocess.run(["ffmpeg","-y","-i",str(video_path),"-vf","fps=8","-q:v","2",str(frames/"%06d.jpg")],check=True)
        job.update(progress=20,message="Frames listos")
        command=os.getenv("RECONSTRUCTION_COMMAND","")
        if not command:
            raise RuntimeError("RECONSTRUCTION_COMMAND no está configurado: el worker no ejecutará una reconstrucción simulada.")
        env=os.environ.copy()
        env.update(JOB_ID=job_id,VIDEO=str(video_path),FRAMES=str(frames),OUTPUT=str(out))
        subprocess.run(command,shell=True,check=True,env=env,cwd=str(out))
        scene=next(iter(out.glob("*.4dgs")),None)
        if scene is None:
            raise RuntimeError("El reconstruidor terminó sin producir un archivo .4dgs.")
        job.update(status="completed",progress=100,message="Escena 4D lista",scene_url=f"/jobs/{job_id}/scene",gaussians=None)
    except Exception as e:
        job.update(status="failed",progress=100,message="Reconstrucción fallida",error=str(e))

@app.get("/health")
def health(): return {"ok":True,"gpu":os.getenv("CUDA_VISIBLE_DEVICES","auto")}

@app.post("/jobs")
async def create_job(video:UploadFile=File(...)):
    if not video.filename: raise HTTPException(400,"Falta el video")
    jid=uuid.uuid4().hex
    path=ROOT/(jid+"_"+Path(video.filename).name)
    path.write_bytes(await video.read())
    JOBS[jid]={"id":jid,"status":"queued","progress":0,"message":"En cola","video":video.filename}
    threading.Thread(target=run_job,args=(jid,path),daemon=True).start()
    return JOBS[jid]

@app.get("/jobs/{job_id}/scene")
def get_scene(job_id:str):
    if job_id not in JOBS: raise HTTPException(404,"Job no encontrado")
    scene=next((p for p in (ROOT/job_id).glob("*.4dgs")),None)
    if scene is None: raise HTTPException(404,"Escena todavía no disponible")
    return FileResponse(scene,media_type="application/octet-stream",filename=scene.name)

@app.get("/jobs/{job_id}")
def get_job(job_id:str):
    if job_id not in JOBS: raise HTTPException(404,"Job no encontrado")
    return JOBS[job_id]
