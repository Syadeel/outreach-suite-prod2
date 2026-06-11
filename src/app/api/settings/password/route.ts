import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 30;

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function verifyPassword(inputPassword: string): Promise<boolean> {
  const inputHash = hashPassword(inputPassword);

  // Check env vars first
  const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD || 'capital123';
  if (inputPassword === envPassword) return true;

  // Check DB stored hash
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'dashboard_password_hash')
    .single();

  if (data) {
    return data.value === inputHash;
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Change password
export async function PUT(request: Request) {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password required' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }

    const isValid = await verifyPassword(currentPassword);
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    const hashed = hashPassword(newPassword);
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
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
