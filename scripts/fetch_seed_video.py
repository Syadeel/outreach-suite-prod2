"""Download a free vid from Pexels using a community Pexels API key."""
import requests
import json
import os
import hashlib
import time

# Pexels free tier - sign up at https://www.pexels.com/api/
# Using a query-based approach that doesn't need an API key
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def find_and_download():
    """Find a free talking-head video and download it."""
    # Try to use the direct Pexels video download trick
    # Many Pexels videos have direct Vimeo CDN links in the page source
    pages = [
        "https://www.pexels.com/video/a-woman-talking-in-front-of-the-camera-9032400/",
        "https://www.pexels.com/video/a-man-talking-while-sitting-on-a-chair-7652295/",
    ]
    
    for page_url in pages:
        print(f"  Fetching: {page_url}")
        r = requests.get(page_url, headers=HEADERS, timeout=20)
        
        if r.status_code != 200:
            print(f"    Status: {r.status_code}")
            continue
            
        # Look for JSON-LD with contentUrl
        import re
        jsonld_pattern = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.DOTALL)
        matches = jsonld_pattern.findall(r.text)
        
        for j in matches:
            try:
                data = json.loads(j)
                if isinstance(data, dict):
                    cu = data.get("contentUrl", data.get("embedUrl"))
                    if cu and (".mp4" in cu or ".mov" in cu):
                        print(f"    Found video URL: {cu}")
                        # Download
                        r2 = requests.get(cu, headers=HEADERS, timeout=120, allow_redirects=True)
                        if r2.status_code == 200 and len(r2.content) > 50000:
                            return r2.content
            except:
                pass
    
    return None

def upload_to_cloudinary(data, public_id="template", folder="v2_seed"):
    CLOUD_NAME = "dacq1vyxp"
    CLOUD_API_KEY = "367855372487586"
    CLOUD_API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"
    
    url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload"
    timestamp = int(time.time())
    
    params_to_sign = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{CLOUD_API_SECRET}"
    signature = hashlib.sha256(params_to_sign.encode()).hexdigest()
    
    tmp = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "seed.mp4")
    with open(tmp, "wb") as f:
        f.write(data)
    
    try:
        with open(tmp, "rb") as f:
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
            print(f"Upload failed: {r.status_code}")
            print(r.text[:300])
    except Exception as e:
        print(f"Upload error: {e}")
    
    return None

if __name__ == "__main__":
    print("Searching for free talking-head video...")
    video_data = find_and_download()
    
    if video_data:
        print(f"Downloaded {len(video_data):,} bytes")
        print("Uploading to Cloudinary...")
        url = upload_to_cloudinary(video_data)
        if url:
            print(f"\n[OK] Seed video uploaded to Cloudinary!")
            print(f"  URL: {url}")
        else:
            print("\n[WARN] Upload failed, but video saved to temp")
    else:
        print("\nCould not find a free video automatically.")
        print("Please record or find a short talking-head MP4 and upload to")
        print("Cloudinary folder 'v2_seed' with public ID 'template'.")
        print("\nOr set SEED_VIDEO_URL in .env.local to any public URL.")
