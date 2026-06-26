import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const PASSWORD = process.env.OS_PASSWORD || 'capital123';
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get('host') || '';

  // Voicekit subdomain rewrite
  if (host.includes('voicekit.thecapitalacquisition.com')) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/voicekit-embed', req.url));
    }
  }

  // Public paths
  if (
    pathname === '/' ||
    pathname === '/voicekit-embed' ||
    pathname.startsWith('/landing') ||
    pathname.startsWith('/api/tracking') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/poll-replies') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cloudinary') ||
    pathname.startsWith('/api/screenshot') ||
    pathname.startsWith('/api/video-recordings') ||
    pathname.startsWith('/api/upload')
  ) {
    return NextResponse.next();
  }

  // Check session cookie first (fast path)
  const sessionCookie = req.cookies.get('os_session');
  if (sessionCookie?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Check HTTP Basic Auth against env var
  const basicAuth = req.headers.get('authorization');
  if (basicAuth) {
    try {
      const authValue = basicAuth.split(' ')[1];
      const [, pwd] = atob(authValue).split(':');
      if (pwd === PASSWORD) {
        return NextResponse.next();
      }
    } catch {
      // Invalid header
    }
  }

  return new NextResponse('Authentication required to access the Outreach Suite.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
