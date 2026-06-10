"""
modal_qwen3_tts.py — Qwen3-TTS voice cloning on Modal.
Uses Qwen3-TTS-12Hz-1.7B-Base for high-quality 3-second voice cloning.
FastAPI endpoint for integration with the V2 lip-sync pipeline.
"""
from __future__ import annotations
import os, tempfile, time, urllib.request, traceback

import modal

APP_NAME = "qwen3-tts"
MODEL_DIR = "/root/qwen3_model"
_model = None


def _download_model() -> None:
    """Download Qwen3-TTS model weights during image build."""
    from huggingface_hub import snapshot_download
    if os.path.isdir(MODEL_DIR) and os.listdir(MODEL_DIR):
        return
    os.makedirs(MODEL_DIR, exist_ok=True)
    print("Downloading Qwen3-TTS Tokenizer...")
    snapshot_download("Qwen/Qwen3-TTS-Tokenizer-12Hz", local_dir=os.path.join(MODEL_DIR, "tokenizer"))
    print("Downloading Qwen3-TTS-12Hz-1.7B-Base...")
    snapshot_download("Qwen/Qwen3-TTS-12Hz-1.7B-Base", local_dir=os.path.join(MODEL_DIR, "base"))
    print("Model download complete.")


image = (
    modal.Image.debian_slim(python_version="3.12")
    .env({"PYTHONIOENCODING": "utf-8"})
    .apt_install("git", "ffmpeg", "espeak-ng")
    .pip_install(
        "torch",
        "torchaudio",
        "accelerate",
        "soundfile",
        "librosa",
        "qwen-tts",
        "fastapi",
        "uvicorn",
        "pydantic",
        "huggingface_hub",
        "einops",
    )
    .run_function(_download_model)
)

app = modal.App(APP_NAME, image=image)


def _load_model():
    """Load Qwen3-TTS model once; subsequent calls return cached instance."""
    import torch
    global _model
    if _model is not None:
        return _model
    
    from qwen_tts import Qwen3TTSModel
    
    print("Loading Qwen3-TTS-12Hz-1.7B-Base...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    _model = Qwen3TTSModel.from_pretrained(
        os.path.join(MODEL_DIR, "base"),
        device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
    )
    
    print(f"Qwen3-TTS loaded on {device}")
    return _model


@app.function(
    image=image,
    gpu="T4",
    timeout=600,
    max_containers=1,
    scaledown_window=600,
)
@modal.fastapi_endpoint(method="POST", docs=True)
def generate(data: dict = {}):
    """Generate speech with voice cloning using Qwen3-TTS.
    
    Accepts JSON body with fields:
      - text (str, required): text to synthesize
      - language (str): language code (default "English")
      - ref_audio_url (str): URL to voice reference audio
      - ref_text (str, optional): transcript of reference audio
      - x_vector_only (bool): if true, skip ref_text (default false)
      - max_new_tokens (int): max generation tokens (default 2048)
    """
    import torch
    import soundfile as sf
    import librosa
    import numpy as np
    from fastapi.responses import Response

    start = time.time()
    try:
        text = data.get("text", "")
        language = data.get("language", "English")
        ref_audio_url = data.get("ref_audio_url", "")
        ref_text = data.get("ref_text", "")
        x_vector_only = data.get("x_vector_only", False)
        max_new_tokens = data.get("max_new_tokens", 2048)

        if not text:
            return Response(
                '{"error":"Provide text in JSON body"}',
                400, media_type="application/json",
            )
        if not ref_audio_url:
            return Response(
                '{"error":"Provide ref_audio_url for voice cloning"}',
                400, media_type="application/json",
            )

        # Load model (cached on subsequent warm calls)
        model = _load_model()

        with tempfile.TemporaryDirectory() as tmp:
            ref_path = os.path.join(tmp, "ref.wav")

            # Download reference audio
            print(f"Downloading reference audio...")
            with urllib.request.urlopen(ref_audio_url, timeout=60) as resp:
                with open(ref_path, "wb") as f:
                    f.write(resp.read())
            print(f"  {os.path.getsize(ref_path)} bytes")

            # Normalize to expected format
            audio, _ = librosa.load(ref_path, sr=24000, mono=True)
            sf.write(ref_path, audio, 24000)

            print(f"Generating voice clone...")
            print(f"  text: '{text[:60]}...' ({len(text)} chars)")
            print(f"  language: {language}")
            print(f"  x_vector_only: {x_vector_only}")
            print(f"  max_new_tokens: {max_new_tokens}")

            # Build voice clone prompt
            prompt_kwargs = {
                "ref_audio": ref_path,
            }
            if not x_vector_only and ref_text:
                prompt_kwargs["ref_text"] = ref_text
            
            prompt = model.create_voice_clone_prompt(
                **prompt_kwargs,
                x_vector_only_mode=x_vector_only,
            )

            # Generate speech
            wavs, sr = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt,
                max_new_tokens=max_new_tokens,
            )

            dur = round(time.time() - start, 1)
            wav = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
            expected_secs = len(wav) / sr if hasattr(wav, '__len__') else 0
            print(f"Generated in {dur}s, audio: {expected_secs:.1f}s at {sr}Hz")

            out_path = os.path.join(tmp, "out.wav")
            sf.write(out_path, wav, sr)
            with open(out_path, "rb") as f:
                audio_bytes = f.read()

        return Response(
            audio_bytes, media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=qwen3_tts.wav",
                "X-Duration": str(dur),
                "X-Audio-Len": str(expected_secs),
            },
        )

    except Exception as e:
        tb = traceback.format_exc()
        print(f"ERROR: {e}\n{tb[-2000:]}")
        return Response(
            f'{{"error":"{e}"}}',
            500, media_type="application/json",
        )


@app.local_entrypoint()
def test():
    import requests

    WEB_URL = generate.get_web_url()
    print(f"Testing via {WEB_URL}")

    ref_url = "https://res.cloudinary.com/dacq1vyxp/video/upload/v1781106295/v2_voice_ref/voice_ref_clean_15s.wav"

    s = requests.Session()
    r = s.post(
        WEB_URL,
        json={
            "text": "Hey there, I just figured out how to make an AI video. It was way harder than I expected.",
            "language": "English",
            "ref_audio_url": ref_url,
            "x_vector_only": True,
            "max_new_tokens": 2048,
        },
        timeout=600,
    )
    if r.status_code == 200:
        print(f"SUCCESS: {len(r.content)} bytes")
        with open("qwen3_tts_test_output.wav", "wb") as f:
            f.write(r.content)
        print("Saved to qwen3_tts_test_output.wav")
    else:
        print(f"Status: {r.status_code}")
        print(r.text[:500])
