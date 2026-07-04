import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Valid usernames (default)
const DEFAULT_USERNAMES = ['admin', 'adeel'];

// GET: Get current username
export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'dashboard_username')
      .single();

    return NextResponse.json({
      username: data?.value || 'admin',
      validUsernames: DEFAULT_USERNAMES,
    });
  } catch (err: any) {
    return NextResponse.json({ username: 'admin', validUsernames: DEFAULT_USERNAMES });
  }
}

// PUT: Change username
export async function PUT(request: NextRequest) {
  try {
    const { currentPassword, newUsername } = await request.json();

    if (!currentPassword || !newUsername) {
      return NextResponse.json({ error: 'Current password and new username required' }, { status: 400 });
    }

    if (newUsername.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 });
    }

    // Verify current password — check env vars OR Supabase settings
    const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD;
    let passwordValid = envPassword ? currentPassword === envPassword : false;

    // Also check Supabase os_password
    if (!passwordValid) {
      const { data: pwdData } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'os_password')
        .single();

      if (pwdData?.value) {
        passwordValid = currentPassword === pwdData.value;
      }
    }

    // Also check bcrypt hash
    if (!passwordValid) {
      const { data: hashData } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'dashboard_password_hash')
        .single();

      if (hashData?.value) {
        const { verifyPassword, isBcryptHash } = await import('@/lib/auth');
        if (isBcryptHash(hashData.value)) {
          passwordValid = await verifyPassword(currentPassword, hashData.value);
        }
      }
    }

    if (!passwordValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Save new username
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert(
        { key: 'dashboard_username', value: newUsername.toLowerCase().trim() },
        { onConflict: 'key' }
      );

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, username: newUsername.toLowerCase().trim() });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to change username' }, { status: 500 });
  }
}
