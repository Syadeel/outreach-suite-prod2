/**
 * Edge-compatible Authentication (JWT only, no bcrypt)
 * Used by middleware which runs in Edge Runtime
 */

import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.OS_PASSWORD || 'fallback-dev-secret-change-in-production'
);

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface SessionPayload {
  authenticated: boolean;
  role: 'admin' | 'template_viewer';
  iat: number;
  exp: number;
}

export async function createSessionToken(role: 'admin' | 'template_viewer' = 'admin'): Promise<string> {
  const token = await new SignJWT({ authenticated: true, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(JWT_SECRET);
  return token;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(
  cookieName: string,
  role: 'admin' | 'template_viewer' = 'admin',
  domain?: string
): Promise<{ name: string; value: string; options: any }> {
  const token = await createSessionToken(role);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE,
    path: '/',
    ...(domain ? { domain } : {}),
  };
  return { name: cookieName, value: token, options };
}

/**
 * Verify request is safe (GET/HEAD/OPTIONS) or has valid Origin/Referer.
 * For CSRF protection in Edge Runtime (can't use cookies directly).
 */
export function verifyRequestOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }
  
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (host && originUrl.host === host) return true;
    } catch {}
  }
  
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (host && refererUrl.host === host) return true;
    } catch {}
  }
  
  return false;
}
