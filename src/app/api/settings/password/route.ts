import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword, isBcryptHash } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function verifyPasswordWithFallback(inputPassword: string): Promise<boolean> {
  // Check env vars first
  const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD;
  if (envPassword && inputPassword === envPassword) return true;

  // Check Supabase os_password
  const { data: pwdData } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'os_password')
    .single();
  if (pwdData?.value && inputPassword === pwdData.value) return true;

  // Check DB stored hash
  const { data: hashData } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'dashboard_password_hash')
    .single();

  if (hashData?.value) {
    if (isBcryptHash(hashData.value)) {
      return verifyPassword(inputPassword, hashData.value);
    }
    const { createHash } = await import('crypto');
    const inputHash = createHash('sha256').update(inputPassword).digest('hex');
    if (hashData.value === inputHash) {
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

// PUT: Change password
export async function PUT(request: NextRequest) {
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

    // Hash with bcrypt and save
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
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
