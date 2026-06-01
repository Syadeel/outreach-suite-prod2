import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // If no password is provided in ENV, fallback to a default one.
  const PASSWORD = process.env.OS_PASSWORD || 'capital123'; 
  
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get('host') || '';

  // If user is accessing via voicekit subdomain, rewrite root to the embed page
  if (host.includes('voicekit.thecapitalacquisition.com')) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/voicekit-embed', req.url));
    }
  }
  
  // Public paths that do not require authentication
  if (
    pathname === '/' ||
    pathname === '/voicekit-embed' ||
    pathname.startsWith('/landing') || 
    pathname.startsWith('/api/tracking') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/poll-replies') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // Require HTTP Basic Auth for all other routes
  const basicAuth = req.headers.get('authorization');
  
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');
    
    if (pwd === PASSWORD) {
      return NextResponse.next();
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
