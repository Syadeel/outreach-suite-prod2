"""Try to execute Supabase migration via API."""
import requests
import json

SUPABASE_URL = "https://wxxjiehgcjrmkbatkvsu.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U"

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}

# Read the SQL file
with open("F:\\OpenWork\\projects\\outreach-suite\\supabase_v2_migration.sql", "r", encoding="utf-8") as f:
    sql_content = f.read()

print("SQL file loaded, length:", len(sql_content))
print()

# Method 1: Try to call exec_sql if it exists
print("=== Method 1: exec_sql RPC ===")
for func_name in ["exec_sql", "execute_sql", "run_sql", "pg_query"]:
    try:
        r = requests.post(
            SUPABASE_URL + f"/rest/v1/rpc/{func_name}",
            headers=headers,
            json={"query": sql_content, "query_text": sql_content, "sql": sql_content},
        )
        print(f"  {func_name}: {r.status_code} - {r.text[:200]}")
    except Exception as e:
        print(f"  {func_name}: error - {e}")

# Method 2: Try creating a simple migration function first
# We can't run ALTER TABLE, but we CAN try using a raw POST
print()
print("=== Method 2: Direct SQL via content profile ===")
try:
    # Some Supabase projects have the raw SQL endpoint available
    r = requests.post(
        SUPABASE_URL + "/rest/v1/",
        headers={**headers, "Content-Profile": "public"},
        json=[{}],
    )
    print(f"  Profile test: {r.status_code} - {r.text[:200]}")
except Exception as e:
    print(f"  Profile test: {e}")

# Method 3: Use the Auth endpoint which has SQL access
print()
print("=== Method 3: Auth admin endpoint ===")
try:
    # Check if we can use the auth admin API
    r = requests.get(
        SUPABASE_URL + "/auth/v1/admin/users",
        headers=headers,
    )
    print(f"  Auth admin: {r.status_code} - {r.text[:200]}")
except Exception as e:
    print(f"  Auth admin: {e}")

print()
print("NOTE: To run the migration, please:")
print("1. Go to https://supabase.com/dashboard/project/wxxjiehgcjrmkbatkvsu")
print("2. Open SQL Editor")
print("3. Paste the SQL from supabase_v2_migration.sql")
print("4. Click Run")
