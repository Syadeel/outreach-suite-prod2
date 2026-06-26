"""
modal_ivm.py — IVM Studio deployed on Modal with A10G GPU
CatVTON runs locally on the same GPU. No API calls needed.
"""
from __future__ import annotations
import os, sys, io, uuid, json, time, tempfile
from pathlib import Path

import modal
from modal import App, Image, asgi_app

MODEL_CACHE = "/cache"
APP_NAME = "ivm-studio"

image = (
    Image.debian_slim(python_version="3.10")
    .apt_install("git", "wget", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install("torch==2.5.1", "torchvision==0.20.1",
                 extra_index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("gradio==4.44.0", "pillow", "requests", "opencv-python-headless",
                 "diffusers==0.30.3", "transformers==4.48.0", "accelerate==0.26.1",
                 "huggingface_hub==0.30.2", "safetensors", "tqdm", "numpy==1.26.4", "einops")
    .run_commands("git clone --depth=1 https://github.com/Zheng-Chong/CatVTON.git /cache/CatVTON")
)

app = App(APP_NAME, image=image)

# ── CatVTON engine (loaded once per warm container) ─────────────────
_ENGINE = None

def get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    import torch
    sys.path.insert(0, os.path.join(MODEL_CACHE, "CatVTON", "model"))
    sys.path.insert(0, os.path.join(MODEL_CACHE, "CatVTON"))
    from model.pipeline import CatVTONPipeline
    import torch.nn as nn

    print("[IVM] Loading CatVTON engine...")
    pipe = CatVTONPipeline(
        base_ckpt="runwayml/stable-diffusion-v1-5",
        attn_ckpt="zhengchong/CatVTON",
        attn_ckpt_version="mix",
        weight_dtype=torch.float16,
        device="cuda",
        skip_safety_check=True,
    )
    # Fix conv_in for 9 channels
    old = pipe.unet.conv_in
    new = nn.Conv2d(9, old.out_channels, old.kernel_size,
                    old.stride, old.padding, bias=old.bias is not None).to(pipe.unet.device, dtype=pipe.unet.dtype)
    with torch.no_grad():
        new.weight[:, :4] = old.weight
        if old.bias is not None:
            new.bias.copy_(old.bias)
    pipe.unet.conv_in = new
    
    _ENGINE = pipe
    print("[IVM] Engine ready!")
    return _ENGINE

def generate_mask(img_size, cloth_type):
    from PIL import Image, ImageDraw
    W, H = img_size
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    if cloth_type == "upper":
        d.rectangle([int(W*0.1), 0, int(W*0.9), int(H*0.55)], fill=255)
    elif cloth_type == "lower":
        d.rectangle([int(W*0.1), int(H*0.45), int(W*0.9), H], fill=255)
    else:
        d.rectangle([int(W*0.05), 0, int(W*0.95), H], fill=255)
    return mask

# ── Gradio app (lazy-imported inside function) ──────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{font-family:'Inter',sans-serif;box-sizing:border-box}
body{background:#0f0f13!important}
.gradio-container{max-width:1100px!important;margin:0 auto!important;padding:20px!important;background:transparent!important}
footer{display:none!important}
h1{font-size:2.5em;font-weight:800;background:linear-gradient(135deg,#a855f7,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.gr-box,.gr-form{border-radius:16px!important;border:1px solid rgba(255,255,255,0.06)!important;background:#1a1a23!important}
input,select{background:#222!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:10px!important;color:#fff!important}
.gr-button-primary{background:linear-gradient(135deg,#a855f7,#7c3aed)!important;border:none!important;border-radius:10px!important;color:#fff!important;font-weight:600!important;padding:12px 24px!important}
.badge{display:inline-block;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.25);color:#a855f7;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
"""

@app.function(image=image, gpu="A10G", scaledown_window=300, min_containers=1)
@asgi_app()
def web():
    import gradio as gr
    from PIL import Image as PILImage
    import torch
    
    def tryon(person_img, garment_img, cloth_type):
        t0 = time.time()
        pipe = get_engine()
        person = PILImage.fromarray(person_img).convert("RGB")
        garment = PILImage.fromarray(garment_img).convert("RGB")
        mask = generate_mask(person.size, cloth_type)
        result = pipe(
            image=person, condition_image=garment, mask=mask,
            num_inference_steps=30, guidance_scale=2.5,
            height=1024, width=768,
            generator=torch.Generator(device="cuda").manual_seed(42),
        )
        w, h = result[0].size
        result[0] = result[0].crop((0, int(h*0.30), w, h))
        return result[0], f"<span class='badge'>CatVTON ({(time.time()-t0):.1f}s)</span>"
    
    with gr.Blocks(title="IVM Studio", css=CSS) as demo:
        gr.Markdown("# IVM Studio\n### Upload + click → AI dresses the model")
        with gr.Row():
            with gr.Column():
                person = gr.Image(label="Model Photo", sources="upload")
                garment = gr.Image(label="Garment Photo", sources="upload")
                cloth_type = gr.Dropdown(["tops", "bottoms", "overall"], value="overall", label="Garment Type")
                btn = gr.Button("Dress the Model", variant="primary")
            with gr.Column():
                result = gr.Image(label="Result (body only, face hidden)")
                badge = gr.HTML("")
        btn.click(fn=tryon, inputs=[person, garment, cloth_type], outputs=[result, badge])
    
    return demo.app
