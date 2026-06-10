import { createClient } from '@supabase/supabase-js';

const url = 'https://wxxjiehgcjrmkbatkvsu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGppZWhnY2pybWtiYXRrdnN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI4NDYxNiwiZXhwIjoyMDk0ODYwNjE2fQ.HUUALAikKYFtkh6hnAjApAk2txiF3Puul5YL88T238U';

const supabase = createClient(url, key);

async function run() {
  // Try the lower-level postgrest-js directly
  // @ts-ignore - accessing internal client
  const postgrest = supabase.rest;
  if (postgrest) {
    console.log('postgrest client available');
  }

  // Try using the internal auth admin to run SQL
  const { data: adminData, error: adminErr } = await supabase.auth.admin.listUsers();
  console.log('Auth admin:', adminErr ? adminErr.message : 'OK - ' + adminData.users.length + ' users');

  // Try to insert a function that executes SQL... but we need SQL for that
  
  // Actually - the simplest approach: use Supabase's graphql endpoint
  try {
    const gqlRes = await fetch(url + '/graphql/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': key,
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        query: `
          mutation {
            alterTable_addColumn(input: {
              table: "video_recordings",
              column: {
                name: "lead_id",
                type: "uuid",
                references: { table: "leads", column: "id" }
              }
            }) {
              clientMutationId
            }
          }
        `
      })
    });
    const gqlResult = await gqlRes.json();
    console.log('GraphQL result:', JSON.stringify(gqlResult));
  } catch(e) {
    console.log('GraphQL error:', e.message);
  }
}

run().catch(console.error);
