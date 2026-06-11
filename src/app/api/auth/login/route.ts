import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createHash } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    const envPassword = process.env.DASHBOARD_PASSWORD || 'capital123';
    let isValid = password === envPassword;

    // If env password doesn't match, check DB stored hash
    if (!isValid) {
      const { data } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'dashboard_password_hash')
        .single();

      if (data) {
        const inputHash = createHash('sha256').update(password).digest('hex');
        isValid = data.value === inputHash;
      }
    }

    if (isValid) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('os_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
      return response;
    }

    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
