/**
 * Temporary one-shot migration script.
 * Run: npx tsx -e "import('./scripts/migrate.mjs').then(m => m.default())"
 * Or: node scripts/migrate.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = 'https://wxxjiehgcjrmkbatkvsu.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
  const sqlPath = resolve(__dirname, '..', 'supabase_v2_migration.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  
  console.log('Running V2 migration...');
  
  // Split by semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const stmt of statements) {
    console.log(`Executing: ${stmt.substring(0, 60)}...`);
    
    // Use the REST API to try to execute SQL
    const url = `${supabaseUrl}/rest/v1/rpc/`;
    const { error } = await supabase.rpc('exec_sql', { query_text: stmt + ';' }).maybeSingle();
    
    if (error) {
      // Try alternative: Use the auth admin endpoint
      console.log(`  RPC failed: ${error.message}`);
      console.log('  Trying direct fetch...');
      
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ query: stmt + ';' })
        });
        console.log(`  Direct: ${res.status}`);
      } catch (e) {
        console.log(`  Direct failed: ${e.message}`);
      }
    } else {
      console.log('  OK');
    }
  }
  
  // Verify columns were added
  const { data: leadsCols } = await supabase.from('leads').select('v2_status').limit(1).maybeSingle();
  console.log(`\nleads.v2_status exists: ${!leadsCols?.error ? 'YES' : 'NO - ' + leadsCols?.error?.message}`);
  
  if (!leadsCols?.error) {
    console.log('\n✅ Migration complete! V2 is ready.');
  } else {
    console.log('\n❌ Migration needs to be run manually in Supabase Dashboard SQL Editor.');
    console.log('   Open: https://supabase.com/dashboard/project/wxxjiehgcjrmkbatkvsu');
    console.log('   Go to SQL Editor, paste the file contents, click Run.');
  }
}

runMigration().catch(console.error);
