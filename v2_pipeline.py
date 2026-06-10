"""
v2_pipeline.py — FULLY AUTOMATED V2 Pipeline.
One command: text -> voice clone -> upload -> LatentSync -> download.

Usage:
  python v2_pipeline.py --script "Hey, this is my AI video."

Requires:
  - Modal CLI configured (pip install modal)
  - Cloudinary creds (in CONFIG below)
  - ffprobe on PATH
"""

import os, sys, time, json, hashlib, argparse, subprocess
from pathlib import Path

# === CONFIGURATION — edit once ===
QWEN3_URL = "https://adelshah020--qwen3-tts-generate.modal.run"
LATENTSYNC_APP = "latentsync-v16-original"
CLOUD_NAME = "dacq1vyxp"
CLOUD_API_KEY = "367855372487586"
CLOUD_API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"

OUTPUT_DIR = Path("F:/OpenWork/projects/voicekit/output")
VOICE_REF_URL = "https://res.cloudinary.com/dacq1vyxp/video/upload/v1781112795/v2_voice_ref/voice_ref_optimized_30s.wav"
VOICE_REF_TEXT = ("Hey, real quick question, what percentage of your Fintech users actually activate on their first "
                  "transaction? Because here's what the data shows, Fintech activation sits at 5%.")
DEFAULT_FACE_VIDEO_URL = "https://res.cloudinary.com/dacq1vyxp/video/upload/v1781118782/v2_face/video_1781118774.mp4"

DEFAULT_SCRIPT = ("Hey, I just figured out how to make an AI video. It was way harder than I expected. "
                  "The GPU kept crashing but I finally got it to work. Now my digital twin can say whatever "
                  "I want. Pretty cool right?")


def step(n, total, label):
    print(f"\n[{n}/{total}] {label}")


# ═══════════════════════════════════════════════════════
# STEP 1: Voice Cloning via Qwen3-TTS
# ═══════════════════════════════════════════════════════

def generate_tts(text, language="English", x_vector=True):
    import requests
    print(f"  Text: '{text[:60]}...' ({len(text)} chars)")

    payload = {
        "text": text,
        "language": language,
        "ref_audio_url": VOICE_REF_URL,
        "x_vector_only": x_vector,
        "max_new_tokens": 2048,
    }
    if not x_vector:
        payload["ref_text"] = VOICE_REF_TEXT

    t0 = time.time()
    r = requests.post(QWEN3_URL, json=payload, timeout=600)
    r.raise_for_status()
    elapsed = time.time() - t0

    ts = int(t0)
    out_path = OUTPUT_DIR / f"tts_{ts}.wav"
    with open(out_path, "wb") as f:
        f.write(r.content)

    # Verify
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True, timeout=30)
    tts_dur = float(dur.stdout.strip()) if dur.stdout.strip() else 0
    print(f"  ✓ TTS generated in {elapsed:.0f}s: {out_path.name} ({tts_dur:.1f}s)")
    return str(out_path), tts_dur


# ═══════════════════════════════════════════════════════
# STEP 2: Upload to Cloudinary
# ═══════════════════════════════════════════════════════

def upload_to_cloudinary(file_path):
    import requests
    ts = int(time.time())
    public_id = f"v2_tts/v2_{ts}"

    params = {"timestamp": ts, "public_id": public_id, "type": "upload"}
    sig_str = "&".join(f"{k}={v}" for k, v in sorted(params.items())) + CLOUD_API_SECRET
    sig = hashlib.sha1(sig_str.encode()).hexdigest()

    with open(file_path, "rb") as f:
        r = requests.post(
            f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/auto/upload",
            data={"timestamp": ts, "public_id": public_id, "type": "upload",
                  "signature": sig, "api_key": CLOUD_API_KEY},
            files={"file": (os.path.basename(file_path), f, "audio/wav")},
        )
    r.raise_for_status()
    url = r.json()["secure_url"]
    print(f"  ✓ Uploaded: {url}")
    return url


# ═══════════════════════════════════════════════════════
# STEP 3: Spawn LatentSync on Modal A10G (detached)
# ═══════════════════════════════════════════════════════

def spawn_latentsync(video_url, audio_url, inference_steps=25, guidance_scale=1.5, seed=1247):
    import modal

    f = modal.Function.from_name(LATENTSYNC_APP, "run_inference")

    call = f.spawn(
        video_url=video_url,
        audio_url=audio_url,
        inference_steps=inference_steps,
        guidance_scale=guidance_scale,
        seed=seed,
        enable_deepcache=True,
    )
    fc_id = call.object_id
    print(f"  ✓ Spawned inference: {fc_id}")
    return fc_id


# ═══════════════════════════════════════════════════════
# STEP 4: Wait for inference to finish
# ═══════════════════════════════════════════════════════

def wait_for_inference(fc_id, poll_interval=30, max_polls=60):
    import modal

    fc = modal.FunctionCall.from_id(fc_id)
    print(f"  Waiting for inference (poll every {poll_interval}s):", end="", flush=True)

    for i in range(max_polls):
        try:
            result = fc.get(timeout=poll_interval + 10)
            print(f" done!")
            return result
        except TimeoutError:
            print(".", end="", flush=True)
        except Exception as e:
            if "timeout" in str(e).lower():
                print(".", end="", flush=True)
            else:
                raise

    print(f"\n  ⚠ Max polls ({max_polls}) reached. Check: modal function get {fc_id}")
    return None


# ═══════════════════════════════════════════════════════
# STEP 5: Download result video from Modal volume
# ═══════════════════════════════════════════════════════

def fetch_output(output_path=None):
    import modal

    if output_path is None:
        output_path = str(OUTPUT_DIR / f"v2_final_{int(time.time())}.mp4")

    f = modal.Function.from_name(LATENTSYNC_APP, "_fetch_output")

    # The output on the volume is always at this path
    vol_path = "/cache/output/lipsync_v16_final.mp4"
    print(f"  Fetching from volume: {vol_path}")
    out_bytes = f.remote(vol_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f_out:
        f_out.write(out_bytes)

    size_mb = len(out_bytes) / 1e6
    print(f"  ✓ Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path


# ═══════════════════════════════════════════════════════
# UTILITY: Just check volume status
# ═══════════════════════════════════════════════════════

def check_volume():
    import modal
    f = modal.Function.from_name(LATENTSYNC_APP, "check_volume")
    result = f.remote()
    if result["output_exists"]:
        print(f"  Output exists: {result['size_mb']} MB")
    else:
        print("  No output on volume yet")
    if result.get("meta"):
        print(f"  Meta: {json.dumps(result['meta'], indent=4)}")
    return result


def main():
    parser = argparse.ArgumentParser(description="V2 Pipeline - Voice Clone + Lip-Sync")
    parser.add_argument("--script", default=DEFAULT_SCRIPT, help="Text to synthesize")
    parser.add_argument("--language", default="English")
    parser.add_argument("--video-url", default=DEFAULT_FACE_VIDEO_URL,
                       help="Source face video URL (Cloudinary)")
    parser.add_argument("--x-vector", action="store_true", default=True,
                       help="x_vector_only mode (default: True)")
    parser.add_argument("--no-x-vector", dest="x_vector", action="store_false")
    parser.add_argument("--steps", type=int, default=25, help="LatentSync inference steps")
    parser.add_argument("--guidance", type=float, default=1.5, help="Guidance scale")
    parser.add_argument("--seed", type=int, default=1247)
    parser.add_argument("--no-tts", action="store_true", help="Skip TTS, use existing audio")
    parser.add_argument("--audio-url", help="Existing audio Cloudinary URL (with --no-tts)")
    parser.add_argument("--poll-only", help="Poll + fetch for existing function call ID")
    parser.add_argument("--check-vol", action="store_true", help="Just check volume status")
    args = parser.parse_args()

    # Utility modes
    if args.check_vol:
        check_volume()
        return

    total_steps = 5
    tts_path = None
    audio_url = None
    fc_id = None

    print("\n" + "=" * 56)
    print("  V2 PIPELINE - Voice Clone -> Lip-Sync")
    print("  Reference: 30s optimized voice (Cloudinary)")
    print("  TTS: Qwen3-TTS on T4 | Sync: LatentSync v1.6 on A10G")
    print("=" * 56)

    start_time = time.time()

    if args.poll_only:
        fc_id = args.poll_only
        total_steps = 2  # just wait + fetch

    elif args.no_tts and args.audio_url:
        audio_url = args.audio_url

    else:
        # STEP 1: TTS
        step(1, total_steps, "Voice Cloning (Qwen3-TTS on T4)")
        tts_path, tts_dur = generate_tts(args.script, args.language, args.x_vector)

        # STEP 2: Upload to Cloudinary
        step(2, total_steps, "Uploading to Cloudinary")
        audio_url = upload_to_cloudinary(tts_path)

    # STEP 3: Spawn LatentSync (skip if --poll-only)
    if fc_id is None:
        step(3, total_steps, "Spawning LatentSync (Modal A10G)")
        fc_id = spawn_latentsync(args.video_url, audio_url, args.steps, args.guidance, args.seed)

    # STEP 4: Wait
    step(4, total_steps, "Waiting for Inference")
    result = wait_for_inference(fc_id)
    if result is None:
        print(f"\n  ⚠ Run --poll-only {fc_id} later to resume")
        return

    # STEP 5: Fetch
    step(5, total_steps, "Downloading Result")
    output = fetch_output()

    elapsed = time.time() - start_time
    print(f"\n{'=' * 56}")
    print(f"  [OK] PIPELINE COMPLETE in {elapsed / 60:.1f} minutes!")
    print(f"  Output: {output}")
    print(f"{'=' * 56}")


if __name__ == "__main__":
    main()
