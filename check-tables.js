const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith('#')) return;
  const parts = cleanLine.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let value = parts.slice(1).join('=').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function run() {
  const { data, error } = await supabase.from('inboxes').select('*').limit(1);
  if (error) {
    console.error("Supabase Error:", error);
    return;
  }
  
  // Try querying a templates table
  const { data: templatesData, error: templatesError } = await supabase.from('email_templates').select('*').limit(1);
  console.log("email_templates check error:", templatesError ? templatesError.message : "None (Table exists!)");
}
run();
