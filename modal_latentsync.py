"""
modal_latentsync.py -- LatentSync v1.6 on Modal (A10G, 512x512)
================================================================
Fixes teeth/lips blurriness from v1.5. Requires A10G GPU (24 GB).

Usage:
    modal run modal_latentsync.py --video-url <URL> --audio-url <URL>
"""

from __future__ import annotations

import argparse
import cv2
import os
import shutil
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
import requests as req_lib  # avoid shadowing 'requests' module

import modal
from modal import App, Image, Volume

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_CACHE = "/cache"
LATENTSYNC_SRC = "/latentsync"
APP_NAME = "latentsync-v16"

# ---------------------------------------------------------------------------
# Container image -- pinned versions matching LatentSync requirements
# ---------------------------------------------------------------------------
image = (
    Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "ffmpeg", "libgl1-mesa-glx", "libglib2.0-0",
        "wget", "libsm6", "libxext6", "libxrender-dev", "libgomp1",
        "build-essential",
    )
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1", "torchaudio==2.5.1",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "diffusers==0.32.2", "transformers==4.48.0", "decord==0.6.0",
        "accelerate==0.26.1", "einops==0.7.0", "omegaconf==2.3.0",
        "opencv-python==4.9.0.80", "mediapipe==0.10.11",
        "python_speech_features==0.6", "librosa==0.10.1",
        "scenedetect==0.6.1", "ffmpeg-python==0.2.0", "imageio==2.31.1",
        "imageio-ffmpeg==0.5.1", "lpips==0.1.4", "face-alignment==1.4.1",
        "huggingface_hub==0.30.2", "numpy==1.26.4", "kornia==0.8.0",
        "insightface==0.7.3", "DeepCache==0.1.1", "onnxruntime-gpu==1.21.0",
        "soundfile", "av", "pillow", "safetensors", "tqdm", "requests",
    )
    .run_commands(f"git clone https://github.com/bytedance/LatentSync.git {LATENTSYNC_SRC}")
)

# ---------------------------------------------------------------------------
# Persistent volume -- caches ~4 GB of model weights across runs
# ---------------------------------------------------------------------------
models_vol = Volume.from_name("latentsync-v16-models", create_if_missing=True)

app = App(APP_NAME, image=image)


# ---------------------------------------------------------------------------
# Core inference function (runs on Modal GPU container)
# ---------------------------------------------------------------------------

CONFIG_PATH = os.path.join(LATENTSYNC_SRC, "configs", "unet", "stage2_512.yaml")
CKPT_CACHE = os.path.join(MODEL_CACHE, "checkpoints")
CKPT_PATH = os.path.join(CKPT_CACHE, "latentsync_unet.pt")


@app.function(
    image=image,
    gpu="A10G",       # 24 GB VRAM -- enough for v1.6 (needs 18 GB)
    timeout=3600,     # 1 hour max (actual run ~3-8 min)
    volumes={MODEL_CACHE: models_vol},
)
def run_inference(
    video_url: str,
    audio_url: str,
    inference_steps: int = 20,
    guidance_scale: float = 1.5,
    seed: int = 1247,
    enable_deepcache: bool = True,
) -> str:
    """
    Download LatentSync v1.6 model, download inputs, run inference,
    return path to output MP4.
    """
    start = time.time()

    # -- 1. Download model weights (cached on Volume) --------------------
    print("[1/5] Ensuring model weights are cached...")
    _ensure_models()

    # -- 2. Set up environment ------------------------------------------
    sys.path.insert(0, LATENTSYNC_SRC)
    _setup_symlinks()

    # -- 3. Download inputs --------------------------------------------
    tmp = tempfile.mkdtemp()
    vpath = os.path.join(tmp, "input_video.mp4")
    apath = os.path.join(tmp, "input_audio.wav")
    output_path = os.path.join(tmp, "output_video.mp4")

    for url, dest, label in [(video_url, vpath, "video"), (audio_url, apath, "audio")]:
        print(f"[2/5] Downloading {label}...")
        # Use requests with retry (more reliable than urlretrieve on Modal)
        for attempt in range(3):
            try:
                resp = req_lib.get(url, timeout=120)
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    f.write(resp.content)
                break
            except Exception as e:
                if attempt == 2:
                    raise
                print(f"  Download failed (attempt {attempt+1}/3): {e}")
                time.sleep(5)
        print(f"  {os.path.getsize(dest) / 1024:.0f} KB")

    # -- 4. Run inference (in-process, no subprocess) -------------------
    # Change to LatentSync dir so relative paths in inference.py work
    original_cwd = os.getcwd()
    os.chdir(LATENTSYNC_SRC)

    print(f"[3/5] Running LatentSync v1.6 inference "
          f"(steps={inference_steps}, guidance={guidance_scale}, "
          f"deepcache={enable_deepcache}, seed={seed})")
    sys.stdout.flush()

    _do_inference(
        video_path=vpath,
        audio_path=apath,
        output_path=output_path,
        inference_steps=inference_steps,
        guidance_scale=guidance_scale,
        seed=seed,
        enable_deepcache=enable_deepcache,
    )

    # Restore original working directory
    os.chdir(original_cwd)

    if not os.path.exists(output_path):
        raise RuntimeError("Inference completed but output file not found")

    dur = round(time.time() - start, 1)
    size_mb = os.path.getsize(output_path) / 1e6
    print(f"[4/5] Done in {dur}s ({size_mb:.1f} MB)")

    # -- 5. Copy to volume so _fetch_output can access it ----------------
    vol_output_dir = os.path.join(MODEL_CACHE, "output")
    os.makedirs(vol_output_dir, exist_ok=True)
    vol_output = os.path.join(vol_output_dir, "lipsync_v16_final.mp4")
    shutil.copy2(output_path, vol_output)

    # Write metadata for later inspection
    try:
        _write_meta_to_volume(
            video_url=video_url,
            audio_url=audio_url,
            inference_steps=inference_steps,
            guidance_scale=guidance_scale,
            seed=seed,
            enable_deepcache=enable_deepcache,
            duration_s=dur,
            size_mb=round(size_mb, 1),
            status="completed",
        )
    except Exception as e:
        print(f"  [warn] Failed to write metadata: {e}")

    models_vol.commit()
    print(f"[5/5] Copied to volume: {vol_output}")
    return vol_output


# ---------------------------------------------------------------------------
# Model setup helpers
# ---------------------------------------------------------------------------


def _ensure_models():
    """Download LatentSync v1.6 checkpoint if not already cached on volume."""
    import huggingface_hub as hf

    ckpt_dir = Path(CKPT_CACHE)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    main_ckpt = ckpt_dir / "latentsync_unet.pt"

    if main_ckpt.exists():
        print(f"  [cached] {main_ckpt.stat().st_size / 1e6:.0f} MB")
        return

    print("  Downloading LatentSync v1.6 from HuggingFace (~4 GB, one-time)...")
    hf.snapshot_download(
        "ByteDance/LatentSync-1.6",
        local_dir=str(ckpt_dir),
        allow_patterns=["*"],
    )
    models_vol.commit()
    print(f"  [done] {main_ckpt.stat().st_size / 1e6:.0f} MB")


def _setup_symlinks():
    """Symlink checkpoints and auxiliary files into the repo dirs."""
    # Checkpoints
    repo_ckpt = Path(LATENTSYNC_SRC) / "checkpoints"
    if not repo_ckpt.exists():
        os.symlink(CKPT_CACHE, str(repo_ckpt))
        print(f"  Symlinked checkpoints -> {repo_ckpt}")

    # VGG16 for LPIPS loss
    hub_dir = Path.home() / ".cache" / "torch" / "hub" / "checkpoints"
    hub_dir.mkdir(parents=True, exist_ok=True)
    vgg16_src = Path(CKPT_CACHE) / "auxiliary" / "vgg16-397923af.pth"
    vgg16_dst = hub_dir / "vgg16-397923af.pth"
    if vgg16_src.exists() and not vgg16_dst.exists():
        os.symlink(str(vgg16_src), str(vgg16_dst))
        print(f"  Symlinked vgg16 -> {vgg16_dst}")


# ---------------------------------------------------------------------------
# Actual inference logic (pure Python, no subprocess)
# ---------------------------------------------------------------------------


def _ensure_scheduler_config():
    """Create configs/scheduler_config.json if missing (needed by inference.py)."""
    import json
    cfg_path = Path(LATENTSYNC_SRC) / "configs" / "scheduler_config.json"
    if cfg_path.exists():
        return
    # Default DDIM scheduler config used by LatentSync
    scheduler_cfg = {
        "_class_name": "DDIMScheduler",
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "beta_start": 0.00085,
        "clip_sample": False,
        "num_train_timesteps": 1000,
        "set_alpha_to_one": False,
        "steps_offset": 1,
        "trained_betas": None,
        "skip_prk_steps": True,
    }
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg_path, "w") as f:
        json.dump(scheduler_cfg, f, indent=2)
    print(f"  Created scheduler config at {cfg_path}")


def _do_inference(
    video_path: str,
    audio_path: str,
    output_path: str,
    inference_steps: int,
    guidance_scale: float,
    seed: int,
    enable_deepcache: bool,
):
    """Import and call LatentSync's inference.main() directly."""
    import torch
    from omegaconf import OmegaConf

    print(f"  [debug] CUDA available: {torch.cuda.is_available()}")
    print(f"  [debug] GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE'}")
    sys.stdout.flush()

    # Verify inputs exist
    for p in [video_path, audio_path]:
        if not os.path.exists(p):
            raise FileNotFoundError(f"Missing input: {p}")
        print(f"  [debug] Input OK: {p} ({os.path.getsize(p)/1e6:.1f} MB)")

    # Verify checkpoint exists
    if not os.path.exists(CKPT_PATH):
        alt_paths = list(Path(CKPT_CACHE).rglob("*.pt"))
        print(f"  [ERROR] Checkpoint not found at {CKPT_PATH}")
        print(f"  [ERROR] Available .pt files in {CKPT_CACHE}: {[str(p.name) for p in alt_paths]}")
        raise FileNotFoundError(f"Checkpoint missing: {CKPT_PATH}")
    else:
        print(f"  [debug] Checkpoint OK: {CKPT_PATH} ({os.path.getsize(CKPT_PATH)/1e9:.2f} GB)")

    # Check config
    if not os.path.exists(CONFIG_PATH):
        alt_configs = list(Path(LATENTSYNC_SRC).rglob("stage2*.yaml"))
        print(f"  [ERROR] Config not found at {CONFIG_PATH}")
        print(f"  [ERROR] Available: {[str(p) for p in alt_configs]}")
        raise FileNotFoundError(f"Config missing: {CONFIG_PATH}")
    else:
        print(f"  [debug] Config OK: {CONFIG_PATH}")
        with open(CONFIG_PATH) as f:
            print(f"  [debug] Config content:\n{f.read()}")
    sys.stdout.flush()

    _ensure_scheduler_config()

    config = OmegaConf.load(CONFIG_PATH)
    print(f"  [debug] Config loaded: cross_attention_dim={config.model.cross_attention_dim}, "
          f"resolution={config.data.resolution}")

    # Override runtime params in config
    config.run.guidance_scale = guidance_scale
    config.run.inference_steps = inference_steps
    config.run.seed = seed if seed != -1 else 1247

    # Build same Namespace that scripts.inference.main() expects
    args = argparse.Namespace(
        unet_config_path=CONFIG_PATH,
        inference_ckpt_path=CKPT_PATH,
        video_path=video_path,
        audio_path=audio_path,
        video_out_path=output_path,
        inference_steps=inference_steps,
        guidance_scale=guidance_scale,
        temp_dir=os.path.join(os.path.dirname(output_path), "temp"),
        seed=seed,
        enable_deepcache=enable_deepcache,
    )

    print(f"  [debug] Args: guidance_scale={args.guidance_scale}, steps={args.inference_steps}, "
          f"seed={args.seed}, deepcache={args.enable_deepcache}")
    print(f"  [debug] Video: {args.video_path}")
    print(f"  [debug] Audio: {args.audio_path}")
    print(f"  [debug] Output: {args.video_out_path}")
    sys.stdout.flush()

    from scripts.inference import main as infer_main

    print(f"  [debug] Starting inference engine at {time.strftime('%H:%M:%S')}...")
    sys.stdout.flush()
    infer_main(config, args)
    print(f"  [debug] Inference finished at {time.strftime('%H:%M:%S')}.")

    # Verify output
    if os.path.exists(output_path):
        print(f"  [debug] Output file created: {output_path} ({os.path.getsize(output_path)/1e6:.1f} MB)")
    else:
        raise RuntimeError("Inference finished but output file NOT found!")

    # Check if output differs from input
    cap = cv2.VideoCapture(video_path)
    ret1, frame1 = cap.read()
    cap.release()
    cap2 = cv2.VideoCapture(output_path)
    ret2, frame2 = cap2.read()
    cap2.release()
    if ret1 and ret2:
        diff = cv2.norm(frame1, frame2, cv2.NORM_L2)
        print(f"  [debug] Input/Output first frame diff (L2 norm): {diff:.1f}")
        if diff < 10:
            print(f"  [WARNING] Frames are nearly identical! Check guidance_scale / model loading")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Add a metadata JSON for the volume output
def _write_meta_to_volume(video_url, audio_url, inference_steps, guidance_scale, seed, enable_deepcache, duration_s, size_mb, status="completed", error=None):
    """Write run metadata to the volume so we can check it later."""
    import json
    meta = {
        "status": status,
        "duration_s": duration_s,
        "size_mb": size_mb,
        "video_url": video_url,
        "audio_url": audio_url,
        "steps": inference_steps,
        "guidance": guidance_scale,
        "seed": seed,
        "deepcache": enable_deepcache,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if error:
        meta["error"] = str(error)
    vol_output_dir = os.path.join(MODEL_CACHE, "output")
    os.makedirs(vol_output_dir, exist_ok=True)
    meta_path = os.path.join(vol_output_dir, "lipsync_v16_meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    models_vol.commit()


@app.function(volumes={MODEL_CACHE: models_vol})
def check_volume() -> dict:
    """Check what's on the volume — output file + metadata."""
    import json
    out_path = os.path.join(MODEL_CACHE, "output", "lipsync_v16_final.mp4")
    meta_path = os.path.join(MODEL_CACHE, "output", "lipsync_v16_meta.json")
    result = {"output_exists": False, "size_mb": 0, "meta": {}}
    if os.path.exists(out_path):
        result["output_exists"] = True
        result["size_mb"] = round(os.path.getsize(out_path) / 1e6, 1)
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            result["meta"] = json.load(f)
    return result


# CLI entrypoint -- usage: modal run modal_latentsync.py --video-url ... --audio-url ...
# ---------------------------------------------------------------------------


@app.local_entrypoint()
def cli(
    video_url: str = "",
    audio_url: str = "",
    steps: int = 20,
    guidance: float = 1.5,
    seed: int = 1247,
    no_deepcache: bool = False,
    output: str | None = None,
    spawn: bool = False,
    check_vol: bool = False,
    fetch_vol: bool = False,
):
    """Run LatentSync v1.6 inference.

    Args:
        video_url: URL to input face MP4
        audio_url: URL to input audio (WAV/MP3)
        steps: Inference steps [20-50]
        guidance: Guidance scale [1.0-3.0]
        seed: Random seed (-1 for random)
        no_deepcache: Disable DeepCache
        output: Local output file path (optional)
        spawn: Spawn and return immediately (detached mode)
        check_vol: Check volume for completed output
        fetch_vol: Fetch output from volume
    """
    # -- Volume check mode (no GPU needed) --------------------------------
    if check_vol:
        result = check_volume.remote()
        if result["output_exists"]:
            print(f"Output exists on volume: {result['size_mb']} MB")
        else:
            print("No output on volume yet.")
        if result.get("meta"):
            import json
            print(f"Meta: {json.dumps(result['meta'], indent=2)}")
        return

    # -- Volume fetch mode (no GPU needed) --------------------------------
    if fetch_vol:
        print("Fetching from volume...")
        # Use forward slashes (Linux path in Modal container)
        vol_path = "/cache/output/lipsync_v16_final.mp4"
        out_bytes = _fetch_output.remote(vol_path)
        timestamp = int(time.time())
        local_out = output or f"F:/OpenWork/projects/voicekit/output/latentsync_v16_{timestamp}.mp4"
        os.makedirs(os.path.dirname(local_out), exist_ok=True)
        with open(local_out, "wb") as f:
            f.write(out_bytes)
        print(f"Saved: {local_out} ({len(out_bytes)/1e6:.1f} MB)")
        return

    # -- Normal mode: validate URLs ---------------------------------------
    if not video_url or not audio_url:
        print("ERROR: --video-url and --audio-url are required")
        print()
        print("Usage: modal run modal_latentsync.py --video-url <URL> --audio-url <URL> [--steps 20] [--guidance 1.5]")
        print("  Or:   modal run modal_latentsync.py --check-vol")
        print("  Or:   modal run modal_latentsync.py --fetch-vol")
        return

    print("=" * 54)
    print("  LatentSync v1.6 -- 512x512 high-quality lip sync")
    print("  GPU: A10G (24 GB)")
    print("=" * 54)
    print()
    print(f"  Video:  {video_url}")
    print(f"  Audio:  {audio_url}")
    print(f"  Steps:  {steps}")
    print(f"  Guidance: {guidance}")
    print(f"  DeepCache: {not no_deepcache}")
    print()

    if spawn:
        # -- Spawn mode: fire-and-forget, returns immediately -------------
        call = run_inference.spawn(
            video_url=video_url,
            audio_url=audio_url,
            inference_steps=steps,
            guidance_scale=guidance,
            seed=seed,
            enable_deepcache=not no_deepcache,
        )
        print(f"Inference SPAWNED! Call ID: {call.object_id}")
        print(f"Function saves output to volume when done.")
        print(f"Check: modal run modal_latentsync.py --check-vol")
        print(f"Fetch: modal run modal_latentsync.py --fetch-vol")
    else:
        # -- Normal mode: run synchronously and fetch ---------------------
        result_path = run_inference.remote(
            video_url=video_url,
            audio_url=audio_url,
            inference_steps=steps,
            guidance_scale=guidance,
            seed=seed,
            enable_deepcache=not no_deepcache,
        )

        print(f"\n[download] Fetching result from Modal...")
        out_bytes = _fetch_output.remote(result_path)

        timestamp = int(time.time())
        local_out = output or f"F:/OpenWork/projects/voicekit/output/latentsync_v16_{timestamp}.mp4"
        os.makedirs(os.path.dirname(local_out), exist_ok=True)
        with open(local_out, "wb") as f:
            f.write(out_bytes)

        print(f"\nDONE! Video saved to: {local_out}")
        print(f"  Size: {len(out_bytes) / 1e6:.1f} MB")


@app.function(volumes={MODEL_CACHE: models_vol})
def _fetch_output(path: str) -> bytes:
    """Read output file from Modal container and return bytes."""
    with open(path, "rb") as f:
        return f.read()
