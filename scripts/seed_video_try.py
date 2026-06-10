"""Try to download a free talking-head video and upload to Cloudinary."""

import requests
import os
import hashlib
import time
import sys

# Try multiple sources
SOURCES = [
    # MuseTalk demo videos from GitHub
    "https://github.com/TMElyralab/MuseTalk/raw/main/assets/demo/mans/mans.mp4",
    "https://github.com/TMElyralab/MuseTalk/raw/main/assets/demo/sit/sit.mp4",
    "https://github.com/TMElyralab/MuseTalk/raw/main/assets/demo/video1/video1.mp4",
    "https://github.com/TMElyralab/MuseTalk/raw/main/assets/demo/yongen/yongen.mp4",
    # These are known to exist in many forks
    "https://huggingface.co/datasets/Xuanhua/DeepLiveCam/resolve/main/examples/example.mp4",
]

def upload_to_cloudinary(filepath):
    CLOUD_NAME = "dacq1vyxp"
    CLOUD_API_KEY = "367855372487586"
    CLOUD_API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"
    
    url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload"
    timestamp = int(time.time())
    public_id = "template"
    folder = "v2_seed"
    
    params_to_sign = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{CLOUD_API_SECRET}"
    signature = hashlib.sha256(params_to_sign.encode()).hexdigest()
    
    try:
        with open(filepath, "rb") as f:
            files = {"file": f}
            data = {
                "api_key": CLOUD_API_KEY,
                "public_id": public_id,
                "folder": folder,
                "timestamp": timestamp,
                "signature": signature,
            }
            r = requests.post(url, files=files, data=data, timeout=120)
            if r.status_code == 200:
                return r.json().get("secure_url")
            print(f"Upload failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"Upload error: {e}")
    return None


if __name__ == "__main__":
    headers = {"User-Agent": "Mozilla/5.0"}
    
    for url in SOURCES:
        print(f"Trying: {url}")
        try:
            r = requests.head(url, headers=headers, timeout=15, allow_redirects=True)
            if r.status_code == 200:
                size = r.headers.get("Content-Length", "unknown")
                print(f"  Found! Size: {size} bytes")
                
                # Download
                r2 = requests.get(url, headers=headers, timeout=120, allow_redirects=True)
                r2.raise_for_status()
                data = r2.content
                print(f"  Downloaded: {len(data):,} bytes")
                
                if len(data) < 100000:
                    print(f"  Too small ({len(data)} bytes), skipping")
                    continue
                
                tmp = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "seed_video.mp4")
                with open(tmp, "wb") as f:
                    f.write(data)
                
                print(f"  Saved to {tmp}")
                print(f"  Uploading to Cloudinary...")
                
                cloud_url = upload_to_cloudinary(tmp)
                if cloud_url:
                    print(f"\n[OK] Seed video uploaded!")
                    print(f"  URL: {cloud_url}")
                    sys.exit(0)
                else:
                    print(f"\n Upload failed but video is saved at {tmp}")
            else:
                print(f"  Status: {r.status_code}")
        except Exception as e:
            print(f"  Error: {e}")
    
    print("\n Could not automatically download seed video.")
    print("Please manually upload a talking-head MP4 to Cloudinary:")
    print("  - Folder: v2_seed")
    print("  - Public ID: template")
    print("  - Or set SEED_VIDEO_URL in .env.local")
