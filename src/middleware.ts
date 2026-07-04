import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const hostname = req.nextUrl.hostname || '';
  const pathname = req.nextUrl.pathname;

  // Templates subdomain — require login
  if (hostname.includes('templates.thecapitalacquisition.com')) {
    // Allow login page, API, and static assets
    if (
      pathname === '/templates-login' ||
      pathname.startsWith('/api/templates-login') ||
      pathname.startsWith('/api/templates-password') ||
      pathname.startsWith('/_next') ||
      pathname === '/favicon.ico' ||
      pathname.endsWith('.svg') ||
      pathname.endsWith('.png')
    ) {
      return NextResponse.next();
    }

    // Check JWT session cookie
    const sessionCookie = req.cookies.get('templates_session');
    if (sessionCookie?.value) {
      try {
        const { verifySessionToken } = await import('@/lib/auth-edge');
        const payload = await verifySessionToken(sessionCookie.value);
        if (payload && payload.authenticated) {
          return NextResponse.next();
        }
      } catch {}
    }

    // No auth — redirect to login page
    const returnUrl = encodeURIComponent(req.url);
    return NextResponse.redirect(new URL(`/templates-login?return=${returnUrl}`, req.url));
  }

  // Everything else — pass through (auth handled by page-level checks)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
