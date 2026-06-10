"""Check MuseTalk demo directory contents via GitHub API."""
import requests

r = requests.get("https://api.github.com/repos/TMElyralab/MuseTalk/contents/assets/demo", timeout=15)
if r.status_code == 200:
    for item in r.json():
        name = item["name"]
        typ = item["type"]
        size = item["size"]
        print(f"{name:40s} {typ:10s} {size} bytes")
        
        # If it's a directory, list it too
        if typ == "dir":
            r2 = requests.get(item["url"], timeout=15)
            if r2.status_code == 200:
                for child in r2.json():
                    print(f"  {child['name']:36s} {child['type']:10s} {child['size']} bytes")
else:
    print(f"API error: {r.status_code}")
    print(r.text[:500])
