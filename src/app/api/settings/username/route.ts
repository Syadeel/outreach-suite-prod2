import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyRequestSecurity } from '@/lib/auth';

export const maxDuration = 30;

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
    console.error('[Username] GET error:', err.message);
    return NextResponse.json({ username: 'admin', validUsernames: DEFAULT_USERNAMES });
  }
}

// PUT: Change username
export async function PUT(request: Request) {
  if (!verifyRequestSecurity(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

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

    // Verify current password
    const { hashPassword, verifyPassword, isBcryptHash } = await import('@/lib/auth');
    
    const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD;
    let passwordValid = envPassword ? currentPassword === envPassword : false;

    if (!passwordValid) {
      const { data } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'dashboard_password_hash')
        .single();

      if (data) {
        if (isBcryptHash(data.value)) {
          passwordValid = await verifyPassword(currentPassword, data.value);
        } else {
          const { createHash } = await import('crypto');
          const inputHash = createHash('sha256').update(currentPassword).digest('hex');
          passwordValid = data.value === inputHash;
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
    console.error('[Username] PUT error:', err.message);
    return NextResponse.json({ error: 'Failed to change username' }, { status: 500 });
  }
}
