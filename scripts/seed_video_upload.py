"""Extract video download URL from Pexels free video page and upload to Cloudinary."""
import requests
import re
import json
import os
import time
import hashlib

def get_pexels_download_url(page_url: str) -> str:
    """Extract direct MP4 download URL from a Pexels video page."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    r = requests.get(page_url, headers=headers, timeout=20)
    
    # Pattern 1: Vimeo CDN links in JSON-LD
    jsonld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', r.text, re.DOTALL)
    for j in jsonld:
        try:
            data = json.loads(j)
            if isinstance(data, dict):
                content_url = data.get("contentUrl")
                if content_url and content_url.endswith(".mp4"):
                    return content_url
        except:
            pass
    
    # Pattern 2: video tag source
    src = re.findall(r'<video[^>]*src="([^"]+\.mp4)"', r.text)
    if src:
        return src[0]
    
    # Pattern 3: Any MP4 URL in the page
    mp4s = re.findall(r'(https?://[^"\'>]+\.mp4)', r.text)
    for mp4 in mp4s:
        # Filter out tiny previews
        if "preview" not in mp4.lower() and "thumb" not in mp4.lower():
            return mp4
    
    # Pattern 4: download link
    download = re.findall(r'href="([^"]+\.mp4[^"]*)"', r.text)
    if download:
        return download[0]
    
    return None

def upload_to_cloudinary(filepath: str, public_id: str = "template", folder: str = "v2_seed") -> str:
    """Upload video to Cloudinary and return URL."""
    CLOUD_NAME = "dacq1vyxp"
    CLOUD_API_KEY = "367855372487586"
    CLOUD_API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"
    
    url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload"
    timestamp = int(time.time())
    
    # Try signed upload (more reliable)
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
            print(f"Cloudinary upload failed: {r.status_code} - {r.text[:200]}")
    except Exception as e:
        print(f"Upload error: {e}")
    
    return None

if __name__ == "__main__":
    # Try multiple Pexels video pages
    urls_to_try = [
        "https://www.pexels.com/video/a-woman-talking-in-front-of-the-camera-9032400/",
        "https://www.pexels.com/video/a-man-talking-while-sitting-on-a-chair-7652295/",
        "https://www.pexels.com/video/young-man-speaking-9709787/",
        "https://www.pexels.com/video/professional-woman-interview-in-studio-setup-31993853/",
    ]
    
    download_url = None
    for page_url in urls_to_try:
        print(f"Trying: {page_url}")
        dl = get_pexels_download_url(page_url)
        if dl:
            print(f"  Found: {dl}")
            download_url = dl
            break
        print("  No MP4 found")
    
    if not download_url:
        print("\nCould not find a free talking-head video download URL.")
        print("Manual step: Upload a talking-head MP4 to Cloudinary")
        print("  Folder: v2_seed")
        print("  Public ID: template")
        exit(1)
    
    # Download the video
    print(f"\nDownloading: {download_url}")
    r = requests.get(download_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=120, allow_redirects=True)
    r.raise_for_status()
    
    tmp_path = os.path.join(os.environ.get("TEMP", "/tmp"), "seed_video.mp4")
    with open(tmp_path, "wb") as f:
        f.write(r.content)
    print(f"Downloaded {len(r.content):,} bytes to {tmp_path}")
    
    # Upload to Cloudinary
    print("\nUploading to Cloudinary...")
    cloud_url = upload_to_cloudinary(tmp_path)
    
    if cloud_url:
        print(f"\n[OK] Seed video uploaded to Cloudinary:")
        print(f"  URL: {cloud_url}")
        print(f"\nAdd to .env.local:")
        print(f'  SEED_VIDEO_URL="{cloud_url}"')
    else:
        print(f"\n[WARN] Upload failed. Video saved at:")
        print(f"  {tmp_path}")
        print(f"\nManual upload:")
        print(f"  1. Go to https://cloudinary.com/console/media-library")
        print(f"  2. Upload {tmp_path} to folder 'v2_seed' with public ID 'template'")
        print(f"  3. Or set SEED_VIDEO_URL to any public URL of a talking head video")
