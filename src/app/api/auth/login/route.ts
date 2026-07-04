import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword, isBcryptHash, setSessionCookie } from '@/lib/auth';

// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 5) return false;
  record.count++;
  return true;
}

// Default valid usernames
const DEFAULT_USERNAMES = ['admin', 'adeel'];

async function getValidUsernames(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'dashboard_username')
      .single();
    
    const customUsername = data?.value?.toLowerCase().trim();
    if (customUsername) {
      return [customUsername, ...DEFAULT_USERNAMES];
    }
  } catch {}
  return DEFAULT_USERNAMES;
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username and password are required' }, { status: 400 });
    }

    // Validate username
    const validUsernames = await getValidUsernames();
    if (!validUsernames.includes(username.toLowerCase().trim())) {
      return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Try again in 1 minute.' }, { status: 429 });
    }

    // Check password: env vars OR Supabase settings table
    const envPassword = process.env.DASHBOARD_PASSWORD || process.env.OS_PASSWORD;
    let isValid = envPassword ? password === envPassword : false;

    // If env password doesn't match, check Supabase settings table
    if (!isValid) {
      // Try os_password (plain text from settings table)
      const { data: pwdData } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'os_password')
        .single();

      if (pwdData?.value) {
        isValid = password === pwdData.value;
      }

      // Also check dashboard_password_hash (bcrypt/sha256)
      if (!isValid) {
        const { data: hashData } = await supabaseAdmin
          .from('settings')
          .select('value')
          .eq('key', 'dashboard_password_hash')
          .single();

        if (hashData?.value) {
          if (isBcryptHash(hashData.value)) {
            isValid = await verifyPassword(password, hashData.value);
          } else {
            const { createHash } = await import('crypto');
            const inputHash = createHash('sha256').update(password).digest('hex');
            if (hashData.value === inputHash) {
              isValid = true;
              const newHash = await hashPassword(password);
              await supabaseAdmin
                .from('settings')
                .update({ value: newHash })
                .eq('key', 'dashboard_password_hash');
            }
          }
        }
      }
    }

    if (isValid) {
      const { name, value, options } = await setSessionCookie('os_session', 'admin');
      const response = NextResponse.json({ success: true });
      response.cookies.set(name, value, options);
      return response;
    }

    return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
