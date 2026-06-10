"""Try GitHub media CDN for MuseTalk demo videos."""
import requests

sources = [
    "https://media.githubusercontent.com/media/TMElyralab/MuseTalk/main/assets/demo/mans/mans.mp4",
    "https://media.githubusercontent.com/media/TMElyralab/MuseTalk/main/assets/demo/sit/sit.mp4",
    "https://media.githubusercontent.com/media/TMElyralab/MuseTalk/main/assets/demo/video1/video1.mp4",
    "https://media.githubusercontent.com/media/TMElyralab/MuseTalk/main/assets/demo/yongen/yongen.mp4",
]

for s in sources:
    try:
        r = requests.head(s, timeout=15, allow_redirects=True)
        print(f"{s.split('/')[-1]}: {r.status_code} - {r.headers.get('Content-Length', '?')}")
    except Exception as e:
        print(f"{s.split('/')[-1]}: Error - {e}")
