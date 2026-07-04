import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/auth';

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

export async function POST(req: NextRequest) {
  const PASSWORD = process.env.TEMPLATES_PASSWORD || process.env.OS_PASSWORD;
  if (!PASSWORD) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 1 minute.' }, { status: 429 });
  }

  const { password } = await req.json();

  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  if (password !== PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Create JWT session token with template_viewer role
  const { name, value, options } = await setSessionCookie('templates_session', 'template_viewer', '.thecapitalacquisition.com');
  const res = NextResponse.json({ success: true });
  res.cookies.set(name, value, options);

  return res;
}
