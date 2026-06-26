"""
modal_vton_clean.py -- OOTDiffusion on Modal A10G (no web endpoint)
Professional VTON quality (CVPR 2024). Call via Function.from_name().remote()
"""
from __future__ import annotations
import os, shutil, sys, tempfile, subprocess, uuid
from pathlib import Path
import modal
from modal import App, Image

MODEL_CACHE = "/cache"
APP_NAME = "ootdiffusion-vton"

image = (
    Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "wget", "libgl1-mesa-glx", "libglib2.0-0", "build-essential")
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1",
        extra_index_url="https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "diffusers==0.24.0", "transformers==4.36.2", "accelerate==0.26.1",
        "opencv-python-headless==4.7.0.72", "pillow==9.4.0", "safetensors", "tqdm", "requests",
        "huggingface_hub==0.23.4", "numpy==1.24.4", "einops==0.7.0", "omegaconf",
        "config==0.5.1", "onnxruntime==1.16.2", "scikit-image==0.21.0", "matplotlib==3.7.4",
        "scipy==1.10.1"
    )
    .run_commands(
        f"git clone --depth=1 https://github.com/levihsu/OOTDiffusion.git {MODEL_CACHE}/OOTDiffusion"
    )
)

app = App(APP_NAME, image=image)


@app.function(image=image, gpu="A10G", timeout=3600)
def run_inference(dress_image_url: str, model_image_url: str, blur_face: bool = True) -> str:
    """Run OOTDiffusion inference on Modal A10G. Returns local path to result."""
    import requests as req
    
    OOT_DIR = os.path.join(MODEL_CACHE, "OOTDiffusion")
    ckpt_dir = os.path.join(OOT_DIR, "checkpoints")
    os.makedirs(ckpt_dir, exist_ok=True)
    
    tmp = tempfile.mkdtemp()
    dress_path = os.path.join(tmp, "dress.jpg")
    model_path = os.path.join(tmp, "model.jpg")
    
    for url, dest in [(dress_image_url, dress_path), (model_image_url, model_path)]:
        r = req.get(url, stream=True, timeout=300)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    
    # Download model weights via snapshot (cached after first run)
    dc_flag = os.path.join(ckpt_dir, "ootd", "ootd_dc", "checkpoint-36000")
    if not os.path.exists(dc_flag):
        from huggingface_hub import snapshot_download
        print("[OOTD] Downloading model weights (~10GB, one-time)...")
        snapshot_download(
            "levihsu/OOTDiffusion",
            allow_patterns=["checkpoints/ootd/**", "checkpoints/humanparsing/**", "checkpoints/openpose/**"],
            local_dir=OOT_DIR,  # downloads into /cache/OOTDiffusion/checkpoints/...
        )
        print("[OOTD] Weights ready")
    
    category = "2"
    
    cmd = [
        sys.executable, os.path.join(OOT_DIR, "run", "run_ootd.py"),
        "--model_path", model_path,
        "--cloth_path", dress_path,
        "--model_type", "dc",
        "--category", category,
        "--gpu_id", "0",
    ]
    
    env = {**os.environ, "PYTHONPATH": f"{OOT_DIR}:{os.path.join(OOT_DIR, 'run')}"}
    print(f"[OOTD] Running inference...")
    result = subprocess.run(
        cmd, cwd=os.path.join(OOT_DIR, "run"),
        capture_output=True, text=True, timeout=1800,
        env=env,
    )
    
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
    
    raise RuntimeError("No output image found")


@app.function(image=image, gpu="A10G", timeout=1800)
def run_simple(dress_url: str, model_url: str) -> bytes:
    """Simpler version returning PNG bytes (no blur)."""
    result_path = run_inference.remote(dress_url, model_url, blur_face=False)
    with open(result_path, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main(dress_url: str = "", model_url: str = ""):
    if not dress_url or not model_url:
        print("Usage: modal run modal_vton_clean.py --dress-url <URL> --model-url <URL>")
        return
    print("Deploying...")
    result_bytes = run_simple.remote(dress_url, model_url)
    out = f"ootd_{uuid.uuid4().hex[:8]}.png"
    with open(out, "wb") as f:
        f.write(result_bytes)
    print(f"Saved: {out} ({len(result_bytes)} bytes)")
