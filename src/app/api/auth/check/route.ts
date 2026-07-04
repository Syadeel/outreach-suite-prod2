import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth-edge';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('os_session')?.value;
  if (session) {
    const payload = await verifySessionToken(session);
    if (payload && payload.authenticated) {
      return NextResponse.json({ authenticated: true, role: payload.role });
    }
  }
  return NextResponse.json({ authenticated: false });
}
