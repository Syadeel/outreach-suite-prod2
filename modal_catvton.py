"""
modal_catvton.py — CatVTON on Modal A10G
Lightweight VTON: 899M params, SD1.5, <8GB VRAM at 1024x768
Direct pipeline call (no subprocess). Returns PNG bytes.
"""
from __future__ import annotations
import io, os, tempfile, uuid, sys
from pathlib import Path
import modal
from modal import App, Image

MODEL_CACHE = "/cache"
APP_NAME = "catvton"

image = (
    Image.debian_slim(python_version="3.10")
    .apt_install("git", "wget", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "diffusers==0.30.3", "transformers==4.48.0", "accelerate==0.26.1",
        "huggingface_hub==0.30.2", "opencv-python-headless", "pillow",
        "safetensors", "tqdm", "numpy==1.26.4", "einops",
    )
    .run_commands(
        "git clone --depth=1 https://github.com/Zheng-Chong/CatVTON.git /cache/CatVTON",
    )
)

app = App(APP_NAME, image=image)


@app.function(image=image, gpu="A10G", timeout=1800)
def run(
    person_image_url: str,
    cloth_image_url: str,
    cloth_type: str = "overall",
    steps: int = 30,
    guidance: float = 2.5,
    seed: int = 42,
    width: int = 768,
    height: int = 1024,
) -> bytes:
    """Run CatVTON inference. Returns PNG bytes."""
    import requests as req
    from PIL import Image, ImageDraw
    import torch

    tmp = Path(tempfile.mkdtemp())
    person_path = tmp / "person.jpg"
    cloth_path = tmp / "cloth.jpg"

    for url, dest in [(person_image_url, person_path), (cloth_image_url, cloth_path)]:
        r = req.get(url, stream=True, timeout=300)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

    person = Image.open(person_path).convert("RGB")
    cloth = Image.open(cloth_path).convert("RGB")

    # Auto-generate body mask based on cloth type
    W, H = person.size
    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)
    if cloth_type == "upper":
        draw.rectangle([int(W*0.1), 0, int(W*0.9), int(H*0.55)], fill=255)
    elif cloth_type == "lower":
        draw.rectangle([int(W*0.1), int(H*0.45), int(W*0.9), H], fill=255)
    else:
        draw.rectangle([int(W*0.05), 0, int(W*0.95), H], fill=255)

    # Add CatVTON source to path
    catvton_dir = os.path.join(MODEL_CACHE, "CatVTON")
    sys.path.insert(0, os.path.join(catvton_dir, "model"))
    sys.path.insert(0, catvton_dir)

    from model.pipeline import CatVTONPipeline

    print(f"[CatVTON] Loading pipeline (version=mix, fp16)...")
    pipe = CatVTONPipeline(
        base_ckpt="runwayml/stable-diffusion-v1-5",
        attn_ckpt="zhengchong/CatVTON",
        attn_ckpt_version="mix",
        weight_dtype=torch.float16,
        device="cuda",
        skip_safety_check=True,
    )
    # Fix: UNet conv_in must accept 9 channels (4 person + 4 cloth + 1 mask)
    import torch.nn as nn
    old_conv = pipe.unet.conv_in
    new_conv = nn.Conv2d(9, old_conv.out_channels, old_conv.kernel_size,
                         old_conv.stride, old_conv.padding,
                         bias=old_conv.bias is not None).to(pipe.unet.device, dtype=pipe.unet.dtype)
    with torch.no_grad():
        new_conv.weight[:, :4] = old_conv.weight
        if old_conv.bias is not None:
            new_conv.bias.copy_(old_conv.bias)
    pipe.unet.conv_in = new_conv
    print("[CatVTON] Fixed conv_in: 4 -> 9 channels")

    print(f"[CatVTON] Running {steps} steps...")
    generator = torch.Generator(device="cuda").manual_seed(seed)
    result_images = pipe(
        image=person,
        condition_image=cloth,
        mask=mask,
        num_inference_steps=steps,
        guidance_scale=guidance,
        height=height,
        width=width,
        generator=generator,
    )

    buf = io.BytesIO()
    result_images[0].save(buf, format="PNG")
    return buf.getvalue()


@app.function(image=image, gpu="A10G", timeout=1800)
def run_local(person_bytes: bytes, cloth_bytes: bytes, cloth_type: str = "overall",
              steps: int = 30, guidance: float = 2.5, seed: int = 42) -> bytes:
    """Run CatVTON with image bytes directly. No URLs needed. For local clients."""
    import tempfile, os, io
    from PIL import Image, ImageDraw
    import torch
    import sys

    tmp = tempfile.mkdtemp()
    pp = os.path.join(tmp, "person.jpg")
    cp = os.path.join(tmp, "cloth.jpg")
    with open(pp, "wb") as f: f.write(person_bytes)
    with open(cp, "wb") as f: f.write(cloth_bytes)

    person = Image.open(pp).convert("RGB")
    cloth = Image.open(cp).convert("RGB")
    W, H = person.size

    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)
    if cloth_type == "upper":
        draw.rectangle([int(W*0.1), 0, int(W*0.9), int(H*0.55)], fill=255)
    elif cloth_type == "lower":
        draw.rectangle([int(W*0.1), int(H*0.45), int(W*0.9), H], fill=255)
    else:
        draw.rectangle([int(W*0.05), 0, int(W*0.95), H], fill=255)

    catvton_dir = os.path.join(MODEL_CACHE, "CatVTON")
    sys.path.insert(0, os.path.join(catvton_dir, "model"))
    sys.path.insert(0, catvton_dir)
    from model.pipeline import CatVTONPipeline
    import torch.nn as nn

    pipe = CatVTONPipeline(
        base_ckpt="runwayml/stable-diffusion-v1-5",
        attn_ckpt="zhengchong/CatVTON",
        attn_ckpt_version="mix",
        weight_dtype=torch.float16, device="cuda", skip_safety_check=True)
    old = pipe.unet.conv_in
    new = nn.Conv2d(9, old.out_channels, old.kernel_size, old.stride, old.padding, bias=old.bias is not None).to(pipe.unet.device, dtype=pipe.unet.dtype)
    with torch.no_grad():
        new.weight[:, :4] = old.weight
        if old.bias is not None: new.bias.copy_(old.bias)
    pipe.unet.conv_in = new

    result = pipe(image=person, condition_image=cloth, mask=mask,
                  num_inference_steps=steps, guidance_scale=guidance,
                  height=1024, width=768,
                  generator=torch.Generator(device="cuda").manual_seed(seed))
    buf = io.BytesIO()
    result[0].save(buf, format="PNG")
    return buf.getvalue()


@app.local_entrypoint()
def main(
    person_url: str = "",
    cloth_url: str = "",
    cloth_type: str = "overall",
):
    if not person_url or not cloth_url:
        print("Usage: modal run modal_catvton.py --person-url <URL> --cloth-url <URL> --cloth-type overall")
        return
    result_bytes = run.remote(person_url, cloth_url, cloth_type)
    out = f"catvton_{uuid.uuid4().hex[:8]}.png"
    with open(out, "wb") as f:
        f.write(result_bytes)
    print(f"Saved: {out} ({len(result_bytes)} bytes)")
