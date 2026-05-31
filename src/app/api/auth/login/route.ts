import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const correctPassword = process.env.DASHBOARD_PASSWORD || 'capital123';
    
    if (password === correctPassword) {
      const response = NextResponse.json({ success: true });
      // Set a secure, HTTP-only cookie that expires in 30 days
      response.cookies.set('os_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/'
      });
      return response;
    }
    
    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
