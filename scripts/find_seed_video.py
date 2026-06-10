"""Find a free talking-head seed video and upload to Cloudinary."""
import requests
import json
import sys
import urllib.parse

# --- Step 1: Search Pixabay for talking person videos ---
PIXABAY_KEY = "47055516-e69e5aa4b59b0d6b7206776f2"

print("=== Searching Pixabay for talking-head videos ===")

queries = ["talking woman", "talking man", "business woman talking", "person speaking"]

all_results = []

for q in queries:
    url = f"https://pixabay.com/api/videos/?key={PIXABAY_KEY}&q={urllib.parse.quote(q)}&per_page=5"
    try:
        r = requests.get(url, timeout=15)
        data = r.json()
        for hit in data.get("hits", []):
            v = hit.get("videos", {})
            # Prefer small/medium quality with direct download
            for size_key in ["medium", "small"]:
                size = v.get(size_key, {})
                if size and size.get("url"):
                    result = {
                        "id": hit["id"],
                        "url": size["url"],
                        "width": size.get("width"),
                        "height": size.get("height"),
                        "duration": hit.get("duration"),
                        "tags": hit.get("tags", ""),
                        "page_url": hit.get("pageURL"),
                    }
                    all_results.append(result)
                    break
    except Exception as e:
        print(f"  Error for '{q}': {e}")

# Deduplicate by URL
seen = set()
unique = []
for r in all_results:
    if r["url"] not in seen:
        seen.add(r["url"])
        unique.append(r)

print(f"\nFound {len(unique)} unique free talking-head videos:\n")

# Recommend the best one (front-facing, reasonable duration)
best = None
for r in unique:
    print(f"  Pixabay #{r['id']}:")
    print(f"    Duration: {r['duration']}s  Size: {r['width']}x{r['height']}")
    print(f"    Tags: {r['tags']}")
    print(f"    Download: {r['url']}")
    print(f"    Page: {r['page_url']}")
    print()
    if best is None and r["duration"] and r["duration"] <= 30 and r["duration"] >= 5:
        if r["width"] and r["width"] >= 480:
            best = r

if best:
    print(f"=== RECOMMENDED: Pixabay #{best['id']} ===")
    print(f"Download URL: {best['url']}")
else:
    print("No ideal video found, picking first available...")
    if unique:
        best = unique[0]
        print(f"Fallback: Pixabay #{best['id']} - {best['url']}")

if best:
    print(f"\nTo download and upload to Cloudinary:")
    print(f"  # Download")
    print(f'  curl -L -o seed_video.mp4 "{best["url"]}"')
    print(f"  # Upload to Cloudinary")
    print(f"  python scripts/upload_seed.py seed_video.mp4")
