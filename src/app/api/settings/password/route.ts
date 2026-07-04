import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword, isBcryptHash, setSessionCookie } from '@/lib/auth';
import { verifyRequestSecurity } from '@/lib/auth';

export const maxDuration = 30;

async function verifyPasswordWithFallback(inputPassword: string): Promise<boolean> {
  // Check env vars first (plaintext comparison)
  const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD;
  if (envPassword && inputPassword === envPassword) return true;

  // Check DB stored hash
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'dashboard_password_hash')
    .single();

  if (data) {
    // Support both bcrypt and legacy SHA-256 hashes
    if (isBcryptHash(data.value)) {
      return verifyPassword(inputPassword, data.value);
    }
    // Legacy SHA-256 migration: re-hash with bcrypt on successful login
    const { createHash } = await import('crypto');
    const inputHash = createHash('sha256').update(inputPassword).digest('hex');
    if (data.value === inputHash) {
      // Migrate to bcrypt
      const newHash = await hashPassword(inputPassword);
      await supabaseAdmin
        .from('settings')
        .update({ value: newHash })
        .eq('key', 'dashboard_password_hash');
      return true;
    }
  }

  return false;
}

// GET: Check password status
export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['dashboard_password_hash', 'password_updated_at']);

    const hashEntry = data?.find((d: any) => d.key === 'dashboard_password_hash');
    const tsEntry = data?.find((d: any) => d.key === 'password_updated_at');

    return NextResponse.json({
      hasCustomPassword: !!hashEntry,
      lastUpdated: tsEntry?.value || null,
    });
  } catch (err: any) {
    console.error('[Settings] GET error:', err.message);
    return NextResponse.json({ error: 'Failed to check password status' }, { status: 500 });
  }
}

// PUT: Change password
export async function PUT(request: Request) {
  // CSRF protection
  if (!verifyRequestSecurity(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password required' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }

    const isValid = await verifyPasswordWithFallback(currentPassword);
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash with bcrypt
    const hashed = await hashPassword(newPassword);
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert([
        { key: 'dashboard_password_hash', value: hashed },
        { key: 'password_updated_at', value: now },
      ], { onConflict: 'key' });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Settings] PUT error:', err.message);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}

// DELETE: Reset to env default
export async function DELETE() {
  try {
    const { error } = await supabaseAdmin
      .from('settings')
      .delete()
      .in('key', ['dashboard_password_hash', 'password_updated_at']);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Settings] DELETE error:', err.message);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
