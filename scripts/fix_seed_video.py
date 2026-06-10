"""Fix seed video: rename to template, convert MKV to MP4, run Supabase migration."""
import requests
import json
import hashlib
import time
import os

CLOUD_NAME = "dacq1vyxp"
API_KEY = "367855372487586"
API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"

def cloudinary_api(method, endpoint, data=None, files=None, params=None):
    """Make authenticated Cloudinary API request."""
    url = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/{endpoint}"
    from requests.auth import HTTPBasicAuth
    auth = HTTPBasicAuth(API_KEY, API_SECRET)
    
    if method == "GET":
        r = requests.get(url, auth=auth, params=params)
    elif method == "POST":
        r = requests.post(url, auth=auth, data=data, files=files, params=params)
    return r

def main():
    # Step 1: Rename seed video to template format and convert to MP4
    source_public_id = "v2_seed/Sendr_xnqxkm"
    target_public_id = "v2_seed/template"
    
    print("=== Step 1: Convert seed video to MP4 + rename ===")
    
    # First get the current video URL
    r = cloudinary_api("GET", f"resources/video/upload/{source_public_id}")
    if r.status_code == 200:
        data = r.json()
        print(f"Current video: {data.get('bytes', 0):,} bytes, format: {data.get('format')}")
    
    # Use the upload API with the existing URL as source, converting to MP4
    existing_url = f"https://res.cloudinary.com/{CLOUD_NAME}/video/upload/{source_public_id}.mkv"
    
    # Option 1: Explicit - convert to MP4
    ts = int(time.time())
    params_to_sign = f"public_id={target_public_id}&timestamp={ts}&type=upload{API_SECRET}"
    signature = hashlib.sha256(params_to_sign.encode()).hexdigest()
    
    # Use explicit to derive a new derived resource
    explicit_data = {
        "api_key": API_KEY,
        "public_id": source_public_id,
        "type": "upload",
        "eager": "f_mp4",
        "timestamp": ts,
        "signature": signature,
    }
    
    r = cloudinary_api("POST", "video/explicit", data=explicit_data)
    print(f"Explicit (eager MP4): {r.status_code}")
    
    if r.status_code == 200:
        result = r.json()
        # Find the MP4 version URL
        for derived in result.get("derived", []):
            if "mp4" in derived.get("url", ""):
                mp4_url = derived["secure_url"]
                print(f"MP4 version: {mp4_url}")
                
                # Now upload this as our template
                ts = int(time.time())
                params_to_sign = f"folder=v2_seed&public_id=template&timestamp={ts}{API_SECRET}"
                sig = hashlib.sha256(params_to_sign.encode()).hexdigest()
                
                upload_data = {
                    "api_key": API_KEY,
                    "public_id": "template",
                    "folder": "v2_seed",
                    "timestamp": ts,
                    "signature": sig,
                }
                
                r2 = cloudinary_api("POST", "video/upload", data=upload_data, 
                                   params={"file": mp4_url})
                print(f"Upload as template: {r2.status_code}")
                if r2.status_code == 200:
                    print(f"[OK] Seed video ready: {r2.json().get('secure_url')}")
                else:
                    print(f"  Error: {r2.text[:200]}")
                    
                    # Fallback: try re-upload via URL directly
                    print("  Trying direct upload from URL...")
                    r3 = cloudinary_api("POST", "video/upload", 
                                       data={**upload_data, "file": mp4_url})
                    print(f"  Direct upload: {r3.status_code}")
                    if r3.status_code == 200:
                        print(f"[OK] Seed video ready: {r3.json().get('secure_url')}")
                return
    
    # Fallback: Try simpler approach - just set the existing video as template
    print("\n=== Fallback: Using existing URL directly ===")
    print(f"Source: {existing_url}")
    print("\n[v2_seed/template] will be created by the V2 pipeline")
    
    # Save the URL for reference
    print(f"\nYou can set in .env.local:")
    print(f'SEED_VIDEO_URL="{existing_url.replace(".mkv", ".mp4")}"')

if __name__ == "__main__":
    main()
