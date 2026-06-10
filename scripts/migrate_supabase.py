"""Run Supabase migration SQL programmatically."""
import requests
import json

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U"
PROJECT_REF = "wxxjiehgcjrmkbatkvsu"

# Supabase Management API - requires a PAT token
# But we can try the internal management API
headers = {
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}

# Read SQL
with open("F:\\OpenWork\\projects\\outreach-suite\\supabase_v2_migration.sql", "r", encoding="utf-8") as f:
    sql = f.read()

# Try the Management API for the project
print("=== Trying Management API ===")
try:
    r = requests.post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        headers=headers,
        json={"query": sql}
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Try the internal database API
print("\n=== Trying Internal DB API ===")
try:
    r = requests.post(
        f"https://{PROJECT_REF}.supabase.co/rest/v1/exec",
        headers={
            **headers,
            "apikey": SERVICE_KEY,
        },
        json={"query": sql}
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Last resort: show the SQL and tell user to run manually
print("\n" + "=" * 60)
print("MANUAL STEP REQUIRED:")
print("=" * 60)
print(f"1. Go to https://supabase.com/dashboard/project/{PROJECT_REF}")
print("2. Open SQL Editor")
print("3. Paste this SQL and click Run:")
print("-" * 40)
print(sql[:2000])
