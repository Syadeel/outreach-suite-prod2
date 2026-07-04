// Quick script to run SQL migration via Supabase RPC
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://wxxjiehgcjrmkbatkvsu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U'
);

const sql = fs.readFileSync('F:/OpenWork/projects/outreach-suite/supabase_batch_migration.sql', 'utf8');

async function run() {
  // Try exec_sql RPC (custom function)
  let { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (!error) {
    console.log('Migration via exec_sql RPC succeeded:', data);
    return;
  }
  console.log('exec_sql RPC failed:', error.message);
  console.log('Trying query_raw RPC...');

  // Try query_raw
  ({ data, error } = await supabase.rpc('query_raw', { q: sql }));
  if (!error) {
    console.log('Migration via query_raw succeeded:', data);
    return;
  }
  console.log('query_raw RPC failed:', error.message);
  console.log('');
  console.log('=== MANUAL STEP REQUIRED ===');
  console.log('1. Go to https://supabase.com/dashboard/project/wxxjiehgcjrmkbatkvsu');
  console.log('2. Open SQL Editor');
  console.log('3. Paste the content of: supabase_batch_migration.sql');
  console.log('4. Click Run');
}

run();
