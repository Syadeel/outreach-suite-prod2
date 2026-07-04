import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

function corsHeaders() {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://templates.thecapitalacquisition.com';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// GET: verify password
export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password');
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400, headers: corsHeaders() });
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('uploads')
      .download('templates-password.txt');

    if (error || !data) {
      const valid = password === process.env.TEMPLATES_PASSWORD;
      return NextResponse.json({ valid }, { headers: corsHeaders() });
    }

    const stored = await data.text();
    const valid = password === stored.trim();
    return NextResponse.json({ valid }, { headers: corsHeaders() });
  } catch {
    const valid = password === process.env.TEMPLATES_PASSWORD;
    return NextResponse.json({ valid }, { headers: corsHeaders() });
  }
}

// POST: change password
export async function POST(req: NextRequest) {
  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new password required' }, { status: 400, headers: corsHeaders() });
  }

  if (newPassword.length < 4) {
    return NextResponse.json({ error: 'New password must be at least 4 characters' }, { status: 400, headers: corsHeaders() });
  }

  let storedPassword = process.env.TEMPLATES_PASSWORD;
  try {
    const { data } = await supabaseAdmin.storage
      .from('uploads')
      .download('templates-password.txt');
    if (data) {
      storedPassword = (await data.text()).trim();
    }
  } catch {}

  if (currentPassword !== storedPassword) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401, headers: corsHeaders() });
  }

  const blob = new Blob([newPassword], { type: 'text/plain' });
  const { error } = await supabaseAdmin.storage
    .from('uploads')
    .upload('templates-password.txt', blob, {
      contentType: 'text/plain',
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: 'Failed to save new password' }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json({ success: true }, { headers: corsHeaders() });
}
