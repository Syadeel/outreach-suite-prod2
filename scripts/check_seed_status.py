"""Verify seed video is ready and find all available URLs."""
import requests
from requests.auth import HTTPBasicAuth

CLOUD_NAME = "dacq1vyxp"
API_KEY = "367855372487586"
API_SECRET = "nS_VVDTaYF4lMM_j7ZqdS-d-lzw"

# Check MKV URL
url = "https://res.cloudinary.com/dacq1vyxp/video/upload/v1780750776/v2_seed/template.mkv"
r = requests.head(url, timeout=15)
cl = r.headers.get("Content-Length", "?")
print(f"MKV: {r.status_code} ({cl} bytes)")

# Check MP4 URL
url_mp4 = "https://res.cloudinary.com/dacq1vyxp/video/upload/f_mp4/v1780750776/v2_seed/template.mkv"
r2 = requests.head(url_mp4, timeout=15)
cl2 = r2.headers.get("Content-Length", "?")
print(f"MP4 (f_mp4): {r2.status_code} ({cl2} bytes)")

# Check derived resources
r3 = requests.get(
    "https://api.cloudinary.com/v1_1/%s/resources/video/upload/v2_seed/template" % CLOUD_NAME,
    auth=HTTPBasicAuth(API_KEY, API_SECRET)
)
print(f"\nCloudinary API: {r3.status_code}")
if r3.status_code == 200:
    data = r3.json()
    derived = data.get("derived", [])
    print(f"Derived count: {len(derived)}")
    for d in derived:
        print(f"  - {d.get('secure_url')} ({d.get('format')}, {d.get('bytes')} bytes)")
    print(f"\nSecure URL: {data.get('secure_url')}")
    print(f"Public ID: {data.get('public_id')}")
    print(f"Format: {data.get('format')}")
    print(f"Duration: {data.get('duration')}")
    
    # The MP4 URL we'll use
    if not derived:
        print(f"\nNo MP4 derived yet. The MKV will work fine in the pipeline.")
        print(f"Use this URL: {data.get('secure_url')}")

# Also check if the original video with its version exists
r4 = requests.head(
    "https://res.cloudinary.com/dacq1vyxp/video/upload/f_mp4/v1780750776/v2_seed/template.mkv",
    timeout=15
)
print(f"\nf_mp4 derivative: {r4.status_code}")
if r4.status_code == 200:
    print(f"MP4 exists! Content-Length: {r4.headers.get('Content-Length')}")
