import requests, json

SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U'
headers = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY}
SUPABASE_URL = 'https://wxxjiehgcjrmkbatkvsu.supabase.co'

r = requests.get(SUPABASE_URL + '/rest/v1/leads?select=id,first_name,last_name,company&v2_status=eq.pending&limit=3', headers=headers)
if r.status_code < 400:
    leads = r.json()
    print(json.dumps(leads, indent=2))
    if len(leads) > 0:
        print(f'Lead ID for testing: {leads[0]["id"]}')
else:
    print(f'Error: {r.text}')
