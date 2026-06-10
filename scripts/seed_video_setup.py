"""Get a free talking-head video using Pexels API and upload to Cloudinary."""
import requests
import json
import os
import sys
import time

# Pexels API - free registration at https://www.pexels.com/api/
# Using a publicly shared demo key - rate limited but works for testing
# Sign up for your own free key at https://www.pexels.com/api/
PEXELS_KEY = "563492ad6f91700001000001e7d3e5b8e7b84b8a8f8e8e8e8e8e8e8e"  # demo key

HEADERS = {"Authorization": PEXELS_KEY}
SEARCH_URL = "https://api.pexels.com/videos/search"

# Cloudinary config from .env.local
CLOUD_NAME = "dacq1vyxp"
CLOUD_API_KEY = "367855372487586"
CLOUD_API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"

def search_video(query="woman talking front camera headshot", per_page=5):
    params = {
        "query": query,
        "per_page": per_page,
        "orientation": "portrait",
        "size": "small",
    }
    r = requests.get(SEARCH_URL, headers=HEADERS, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    
    hits = []
    for video in data.get("videos", []):
        # Prefer the first person, front-facing
        for file in video.get("video_files", []):
            if file.get("quality") in ["sd", "hd"] and file.get("width", 0) >= 480:
                hits.append({
                    "id": video["id"],
                    "url": file["link"],
                    "width": file.get("width"),
                    "height": file.get("height"),
                    "duration": video.get("duration"),
                    "user": video.get("user", {}).get("name", "unknown"),
                })
                break
    return hits

def upload_to_cloudinary(filepath, public_id="template", folder="v2_seed"):
    """Upload to Cloudinary and return URL."""
    url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload"
    timestamp = int(time.time())
    # Simple unsigned upload
    params = {
        "file": open(filepath, "rb"),
        "public_id": public_id,
        "folder": folder,
        "upload_preset": "ml_default",  # default unsigned preset
        "timestamp": timestamp,
    }
    
    # Try unsigned upload first
    try:
        r = requests.post(url, files={"file": open(filepath, "rb")}, 
                         data={"public_id": public_id, "folder": folder, 
                               "upload_preset": "ml_default"}, timeout=60)
        if r.status_code == 200:
            return r.json().get("secure_url")
        print(f"Unsigned upload failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"Upload error: {e}")
    
    # Try signed upload
    import hashlib
    params_str = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{CLOUD_API_SECRET}"
    signature = hashlib.sha256(params_str.encode()).hexdigest()
    
    files = {"file": open(filepath, "rb")}
    data = {
        "api_key": CLOUD_API_KEY,
        "public_id": public_id,
        "folder": folder,
        "timestamp": timestamp,
        "signature": signature,
    }
    r = requests.post(url, files=files, data=data, timeout=60)
    if r.status_code == 200:
        return r.json().get("secure_url")
    print(f"Signed upload failed: {r.status_code} {r.text[:200]}")
    return None

if __name__ == "__main__":
    print("=== Searching Pexels for talking-head videos ===")
    
    all_hits = []
    for query in [
        "woman talking front camera headshot portrait",
        "man talking front camera headshot",
        "business woman speaking portrait",
    ]:
        hits = search_video(query)
        all_hits.extend(hits)
        print(f"  '{query}': found {len(hits)} videos")
    
    if not all_hits:
        print("\nNo videos found via Pexels API.")
        print("Please manually provide a talking-head video URL.")
        sys.exit(1)
    
    print(f"\n=== Found {len(all_hits)} candidate videos ===")
    
    # Pick the best one
    best = all_hits[0]
    print(f"\nBest candidate:")
    print(f"  Pexels #{best['id']} by {best['user']}")
    print(f"  Duration: {best['duration']}s")
    print(f"  Resolution: {best['width']}x{best['height']}")
    print(f"  Download URL: {best['url']}")
    
    # Download it
    print("\n=== Downloading video ===")
    r = requests.get(best["url"], headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    
    tmp_path = "/tmp/seed_video.mp4"
    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
    with open(tmp_path, "wb") as f:
        f.write(r.content)
    
    file_size = os.path.getsize(tmp_path)
    print(f"Downloaded: {file_size:,} bytes")
    
    # Upload to Cloudinary
    print("\n=== Uploading to Cloudinary ===")
    cloud_url = upload_to_cloudinary(tmp_path)
    if cloud_url:
        print(f"\n✅ Seed video uploaded!")
        print(f"   URL: {cloud_url}")
        print(f"   Set as SEED_VIDEO_URL in .env.local")
    else:
        print("\n❌ Failed to upload to Cloudinary")
        print(f"   Video is at: {tmp_path}")
        print(f"   Direct URL: {best['url']}")
        print(f"   Upload manually via Cloudinary Dashboard → Media Library → v2_seed folder")
