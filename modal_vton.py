"""
modal_vton.py -- OOTDiffusion on Modal (A10G)
Exposes HTTP endpoint for IVM space.
"""
from __future__ import annotations
import os, shutil, sys, tempfile, subprocess
from pathlib import Path
import modal
from modal import App, Image, Volume, asgi_app
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_CACHE = "/cache"
APP_NAME = "ootdiffusion-vton"

image = (
    Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "wget", "libgl1-mesa-glx", "libglib2.0-0", "build-essential")
    .pip_install("fastapi", "pydantic", "uvicorn",
                 "torch==2.5.1", "torchvision==0.20.1",
                 extra_index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("diffusers==0.32.2", "transformers==4.48.0", "accelerate==0.26.1",
                 "opencv-python", "pillow", "safetensors", "tqdm", "requests",
                 "huggingface_hub==0.30.2", "numpy==1.26.4", "einops", "omegaconf")
    .run_commands(f"git clone https://github.com/levihsu/OOTDiffusion.git {MODEL_CACHE}/OOTDiffusion")
)

models_vol = Volume.from_name("ootdiffusion-models", create_if_missing=True)
app = App(APP_NAME, image=image)

# ──────────────────────────────────────────────
# HTTP endpoint for IVM HF Space to call
# ──────────────────────────────────────────────
web_app = FastAPI()

class GenRequest(BaseModel):
    dress_image_url: str
    model_image_url: str
    blur_face: bool = True

@web_app.post("/generate")
async def generate(req: GenRequest):
    try:
        f = modal.Function.from_name(APP_NAME, "run_inference")
        result = f.remote(req.dress_image_url, req.model_image_url, req.blur_face)
        return {"success": True, "path": result}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.function(image=image, gpu="A10G", timeout=3600, volumes={MODEL_CACHE: models_vol})
@modal.asgi_app()
def fastapi_app():
    return web_app

# ──────────────────────────────────────────────
# Core inference function
# ──────────────────────────────────────────────

@app.function(image=image, gpu="A10G", timeout=3600, volumes={MODEL_CACHE: models_vol})
def run_inference(dress_image_url: str, model_image_url: str, blur_face: bool = True) -> str:
    import requests as req
    OOT_DIR = os.path.join(MODEL_CACHE, "OOTDiffusion")
    ckpt_dir = os.path.join(MODEL_CACHE, "checkpoints")
    os.makedirs(ckpt_dir, exist_ok=True)
    
    tmp = tempfile.mkdtemp()
    dress_path = os.path.join(tmp, "dress.jpg")
    model_path = os.path.join(tmp, "model.jpg")
    
    for url, dest in [(dress_image_url, dress_path), (model_image_url, model_path)]:
        r = req.get(url, stream=True, timeout=300)
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192): f.write(chunk)
    
    if not os.path.exists(os.path.join(ckpt_dir, "ootd.pt")):
        from huggingface_hub import hf_hub_download
        hf_hub_download("levihsu/OOTDiffusion", "ootd.pt", local_dir=ckpt_dir)
    
    cmd = [sys.executable, os.path.join(OOT_DIR, "run", "run_ootd.py"),
           "--model_path", model_path, "--cloth_path", dress_path,
           "--model_type", "dc", "--category", "2", "--gpu_id", "0"]
    result = subprocess.run(cmd, cwd=os.path.join(OOT_DIR, "run"), capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"OOTDiffusion failed: {result.stderr[-500:]}")
    
    out_dir = os.path.join(OOT_DIR, "run", "images_output")
    if os.path.exists(out_dir):
        files = sorted(Path(out_dir).iterdir(), key=os.path.getmtime, reverse=True)
        for f in files:
            if f.suffix in (".png", ".jpg") and "out_" in f.name:
                out_path = os.path.join(tmp, "result.png")
                shutil.copy2(str(f), out_path)
                if blur_face:
                    from PIL import Image, ImageFilter
                    img = Image.open(out_path).convert("RGB")
                    w, h = img.size
                    fb = (w//4, 0, w*3//4, h//3)
                    img.paste(img.crop(fb).filter(ImageFilter.GaussianBlur(25)), fb)
                    img.save(out_path)
                return out_path
    raise RuntimeError("No output")

@app.local_entrypoint()
def main(dress_url: str = "", model_url: str = "", blur: bool = True):
    if not dress_url or not model_url:
        print("Usage: modal run modal_vton.py --dress-url <URL> --model-url <URL>")
        return
    r = run_inference.remote(dress_url, model_url, blur)
    print(f"Result: {r}")
