"""
modal_idm_vton.py — IDM-VTON on Modal A10G (ECCV 2024)
Professional VTON. Call via modal.Function.from_name("idm-vton", "run").remote()
"""
from __future__ import annotations
import os, sys, tempfile, uuid, io, gc
from pathlib import Path
import modal
from modal import App, Image, Volume

MODEL_DIR = "/models"
REPO_DIR = "/repo"
APP_NAME = "idm-vton"

# ── Image ────────────────────────────────────────────────────────────
image = (
    Image.from_registry("nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "wget", "build-essential", "ninja-build",
                 "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6", "libxrender-dev",
                 "clang")
    .run_commands(
        "pip install torch==2.1.2 torchvision==0.16.2 --extra-index-url https://download.pytorch.org/whl/cu121",
        "pip install wheel numpy==1.24.4",
        "pip install 'detectron2@git+https://github.com/facebookresearch/detectron2.git' --no-build-isolation",
        "pip install diffusers==0.25.0 transformers==4.36.2 accelerate==0.26.1 "
        "opencv-python-headless==4.7.0.72 pillow==9.4.0 "
        "scipy==1.10.1 scikit-image==0.21.0 "
        "huggingface_hub==0.25.0 einops tqdm==4.64.1 "
        "matplotlib==3.7.4 omegaconf config==0.5.1 "
        "onnxruntime==1.16.2 safetensors fvcore cloudpickle requests av")
    .run_commands(f"git clone --depth=1 https://github.com/yisol/IDM-VTON.git {REPO_DIR}")
)

vol = Volume.from_name("idm-vton-weights", create_if_missing=True)
app = App(APP_NAME, image=image)

# ── Download weights (one-time) ──────────────────────────────────────
@app.function(volumes={MODEL_DIR: vol}, timeout=1800)
def download_weights():
    from huggingface_hub import snapshot_download
    ckpt_dir = os.path.join(MODEL_DIR, "ckpt")
    os.makedirs(ckpt_dir, exist_ok=True)
    print("Downloading IDM-VTON model weights (~7GB)...")
    snapshot_download("yisol/IDM-VTON", local_dir=os.path.join(MODEL_DIR, "idm"))
    print("Downloading DensePose checkpoint...")
    snapshot_download("yisol/IDM-VTON", allow_patterns=["ckpt/densepose/**"],
                      local_dir=os.path.join(MODEL_DIR, "idm_preprocess"))
    print("Downloading parsing & openpose...")
    snapshot_download("yisol/IDM-VTON", allow_patterns=["ckpt/humanparsing/**", "ckpt/openpose/**"],
                      local_dir=os.path.join(MODEL_DIR, "idm_preprocess"))
    vol.commit()
    print("Weights ready!")

# ── Inference class (stays warm on GPU) ──────────────────────────────
@app.cls(gpu="A10G", volumes={MODEL_DIR: vol}, scaledown_window=300, min_containers=1)
class VTON:
    @modal.enter()
    def load(self):
        """Load all models into GPU memory (once per container lifetime)."""
        import torch
        sys.path.insert(0, REPO_DIR)
        from src.tryon_pipeline import StableDiffusionXLInpaintPipeline as TryonPipeline
        from src.unet_hacked_garmnet import UNet2DConditionModel as UNet2DConditionModel_ref
        from src.unet_hacked_tryon import UNet2DConditionModel
        from diffusers import DDPMScheduler, AutoencoderKL
        from transformers import (CLIPImageProcessor, CLIPVisionModelWithProjection,
                                  CLIPTextModel, CLIPTextModelWithProjection, AutoTokenizer)
        from preprocess.humanparsing.run_parsing import Parsing
        from preprocess.openpose.run_openpose import OpenPose
        from torchvision import transforms

        base = os.path.join(MODEL_DIR, "idm")
        self.device = "cuda"
        self.tensor_transform = transforms.Compose([
            transforms.ToTensor(), transforms.Normalize([0.5], [0.5])])

        print("Loading UNet...")
        unet = UNet2DConditionModel.from_pretrained(base, subfolder="unet", torch_dtype=torch.float16)
        unet.requires_grad_(False)

        print("Loading tokenizers...")
        self.tokenizer_one = AutoTokenizer.from_pretrained(base, subfolder="tokenizer", use_fast=False)
        self.tokenizer_two = AutoTokenizer.from_pretrained(base, subfolder="tokenizer_2", use_fast=False)

        print("Loading text encoders...")
        self.text_encoder_one = CLIPTextModel.from_pretrained(base, subfolder="text_encoder", torch_dtype=torch.float16)
        self.text_encoder_two = CLIPTextModelWithProjection.from_pretrained(base, subfolder="text_encoder_2", torch_dtype=torch.float16)
        self.image_encoder = CLIPVisionModelWithProjection.from_pretrained(base, subfolder="image_encoder", torch_dtype=torch.float16)

        print("Loading VAE...")
        self.vae = AutoencoderKL.from_pretrained(base, subfolder="vae", torch_dtype=torch.float16)

        print("Loading UNet encoder...")
        self.unet_encoder = UNet2DConditionModel_ref.from_pretrained(base, subfolder="unet_encoder", torch_dtype=torch.float16)
        self.unet_encoder.requires_grad_(False)
        self.image_encoder.requires_grad_(False)
        self.vae.requires_grad_(False)
        unet.requires_grad_(False)
        self.text_encoder_one.requires_grad_(False)
        self.text_encoder_two.requires_grad_(False)

        print("Building pipeline...")
        noise_scheduler = DDPMScheduler.from_pretrained(base, subfolder="scheduler")
        self.pipe = TryonPipeline.from_pretrained(
            base, unet=unet, vae=self.vae,
            feature_extractor=CLIPImageProcessor(),
            text_encoder=self.text_encoder_one, text_encoder_2=self.text_encoder_two,
            tokenizer=self.tokenizer_one, tokenizer_2=self.tokenizer_two,
            scheduler=noise_scheduler, image_encoder=self.image_encoder,
            torch_dtype=torch.float16)
        self.pipe.unet_encoder = self.unet_encoder
        self.pipe.to(self.device)

        print("Loading preprocessing models...")
        self.parsing_model = Parsing(0)
        self.openpose_model = OpenPose(0)
        self.openpose_model.preprocessor.body_estimation.model.to(self.device)

        print("Models ready!")

    @modal.method()
    def run(self, person_url: str, garment_url: str, garment_desc: str = "",
            steps: int = 30, seed: int = 42, auto_mask: bool = True) -> bytes:
        import requests as req
        from PIL import Image
        import torch
        import numpy as np
        import apply_net
        from detectron2.data.detection_utils import convert_PIL_to_numpy, _apply_exif_orientation
        from utils_mask import get_mask_location
        from torchvision.transforms.functional import to_pil_image

        device = self.device
        tmp = Path(tempfile.mkdtemp())
        person_path, garment_path = tmp / "person.jpg", tmp / "garment.jpg"

        for url, dest in [(person_url, person_path), (garment_url, garment_path)]:
            r = req.get(url, stream=True, timeout=300)
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192): f.write(chunk)

        garm_img = Image.open(garment_path).convert("RGB").resize((768, 1024))
        human_img_orig = Image.open(person_path).convert("RGB")
        human_img = human_img_orig.resize((768, 1024))

        # Mask
        if auto_mask:
            keypoints = self.openpose_model(human_img.resize((384, 512)))
            model_parse, _ = self.parsing_model(human_img.resize((384, 512)))
            mask, _ = get_mask_location("hd", "upper_body", model_parse, keypoints)
            mask = mask.resize((768, 1024))
        else:
            from PIL import ImageDraw
            mask = Image.new("L", (768, 1024), 0)
            ImageDraw.Draw(mask).rectangle([50, 100, 718, 950], fill=255)

        # DensePose
        print("Running DensePose...")
        human_img_arg = _apply_exif_orientation(human_img.resize((384, 512)))
        human_img_arg = convert_PIL_to_numpy(human_img_arg, format="BGR")
        args = apply_net.create_argument_parser().parse_args((
            "show", os.path.join(REPO_DIR, "configs", "densepose_rcnn_R_50_FPN_s1x.yaml"),
            os.path.join(MODEL_DIR, "idm_preprocess", "ckpt", "densepose", "model_final_162be9.pkl"),
            "dp_segm", "-v", "--opts", "MODEL.DEVICE", device))
        pose_img = args.func(args, human_img_arg)[:, :, ::-1]
        pose_img = Image.fromarray(pose_img).resize((768, 1024))

        # Unload preprocessing models to save VRAM for SDXL
        self.openpose_model.preprocessor.body_estimation.model.to("cpu")
        gc.collect()
        torch.cuda.empty_cache()

        # Encode prompts
        prompt = "model is wearing " + garment_desc
        neg = "monochrome, lowres, bad anatomy, worst quality, low quality"
        (pe, npe, ppe, nppe) = self.pipe.encode_prompt(
            prompt, 1, True, negative_prompt=neg)
        (pec, _, _, _) = self.pipe.encode_prompt(
            "a photo of " + garment_desc, 1, False, negative_prompt=neg)

        pose_t = self.tensor_transform(pose_img).unsqueeze(0).to(device, torch.float16)
        garm_t = self.tensor_transform(garm_img).unsqueeze(0).to(device, torch.float16)
        gen = torch.Generator(device).manual_seed(seed) if seed >= 0 else None

        print(f"Running SDXL ({steps} steps)...")
        images = self.pipe(
            prompt_embeds=pe.to(device, torch.float16),
            negative_prompt_embeds=npe.to(device, torch.float16),
            pooled_prompt_embeds=ppe.to(device, torch.float16),
            negative_pooled_prompt_embeds=nppe.to(device, torch.float16),
            num_inference_steps=steps, generator=gen, strength=1.0,
            pose_img=pose_t, text_embeds_cloth=pec.to(device, torch.float16),
            cloth=garm_t.to(device, torch.float16), mask_image=mask,
            image=human_img, height=1024, width=768,
            ip_adapter_image=garm_img.resize((768, 1024)),
            guidance_scale=2.0)[0]

        buf = io.BytesIO()
        images[0].save(buf, format="PNG")
        return buf.getvalue()


@app.local_entrypoint()
def main():
    print("Deploy: modal deploy modal_idm_vton.py")
    print("Then run: python -c \"import modal; f = modal.Function.from_name('idm-vton', 'VTON.run'); print(f.remote('person_url', 'garment_url'))\"")
