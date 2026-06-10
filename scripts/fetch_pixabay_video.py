"""Fetch free talking-head video URL from Pixabay."""
import requests
import re
import sys

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

url = "https://pixabay.com/videos/search/talking/"
r = requests.get(url, headers=headers, timeout=20)

# Find mp4 URLs
mp4s = []
for m in re.finditer(r"(https?://[^\s\"'<>]+\.mp4[^\s\"'<>]*)", r.text):
    mp4s.append(m.group(1))

print(f"Found {len(mp4s)} MP4 links")

# Filter for reasonable sizes (not too small, not logo/icon clips)
good = []
for u in mp4s:
    if any(kw in u.lower() for kw in ["woman", "man", "person", "face", "talking", "speaking", "interview"]):
        good.append(u)

if good:
    print("\nBest candidates:")
    for u in good[:5]:
        print(f"  {u}")
else:
    print("\nAll MP4s:")
    for u in mp4s[:10]:
        print(f"  {u}")
