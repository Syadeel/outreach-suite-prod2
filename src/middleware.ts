import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth-edge';

export async function middleware(req: NextRequest) {
  const templatesPassword = process.env.TEMPLATES_PASSWORD;
  const pathname = req.nextUrl.pathname;
  const hostname = req.nextUrl.hostname || '';

  // Voicekit subdomain rewrite
  if (hostname.includes('voicekit.thecapitalacquisition.com')) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/voicekit-embed', req.url));
    }
  }

  // Templates subdomain — require login
  if (hostname.includes('templates.thecapitalacquisition.com')) {
    // Allow the login page, API, and static assets
    if (pathname === '/templates-login' || pathname.startsWith('/api/templates-login') ||
      pathname.startsWith('/api/templates-password') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
      return NextResponse.next();
    }

    // Check JWT session cookie
    const sessionCookie = req.cookies.get('templates_session');
    if (sessionCookie?.value) {
      const payload = await verifySessionToken(sessionCookie.value);
      if (payload && payload.authenticated) {
        return NextResponse.next();
      }
    }

    // Check HTTP Basic Auth
    const basicAuth = req.headers.get('authorization');
    if (basicAuth && templatesPassword) {
      try {
        const authValue = basicAuth.split(' ')[1];
        const decoded = atob(authValue);
        const colonIndex = decoded.indexOf(':');
        if (colonIndex !== -1) {
          const pwd = decoded.substring(colonIndex + 1);
          if (pwd === templatesPassword) {
            const { SignJWT } = await import('jose');
            const secret = new TextEncoder().encode(
              process.env.JWT_SECRET || process.env.OS_PASSWORD || 'fallback-dev-secret'
            );
            const token = await new SignJWT({ authenticated: true, role: 'template_viewer' })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt()
              .setExpirationTime('30d')
              .sign(secret);

            const res = NextResponse.next();
            res.cookies.set('templates_session', token, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 30,
              path: '/',
              domain: '.thecapitalacquisition.com',
            });
            return res;
          }
        }
      } catch {}
    }

    // No auth — redirect to login page
    const returnUrl = encodeURIComponent(req.url);
    return NextResponse.redirect(new URL(`/templates-login?return=${returnUrl}`, req.url));
  }

  // Main app paths — public routes (no auth needed)
  if (
    pathname === '/login' ||
    pathname === '/voicekit-embed' ||
    pathname === '/templates-login' ||
    pathname.startsWith('/landing') ||
    pathname.startsWith('/api/tracking') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/poll-replies') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cloudinary') ||
    pathname.startsWith('/api/screenshot') ||
    pathname.startsWith('/api/video-recordings') ||
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/api/templates-login')
  ) {
    return NextResponse.next();
  }

  // Check JWT session cookie (fast path)
  const sessionCookie = req.cookies.get('os_session');
  if (sessionCookie?.value) {
    const payload = await verifySessionToken(sessionCookie.value);
    if (payload && payload.authenticated) {
      return NextResponse.next();
    }
  }

  // No auth — redirect to custom login page (not Basic Auth)
  const returnUrl = encodeURIComponent(req.url);
  return NextResponse.redirect(new URL(`/login?return=${returnUrl}`, req.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
