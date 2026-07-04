/**
 * Shared Authentication Library
 * - bcrypt password hashing
 * - JWT signed cookies
 * - CSRF token generation/verification
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

// JWT secret — derive from env or use a random key
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.OS_PASSWORD || 'fallback-dev-secret-change-in-production'
);

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ============================================
// PASSWORD HASHING (bcrypt)
// ============================================

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(input, storedHash);
}

// Check if a value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

// ============================================
// JWT TOKEN MANAGEMENT
// ============================================

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

// ============================================
// SESSION COOKIE HELPERS
// ============================================

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

// ============================================
// CSRF PROTECTION (Double Submit Cookie Pattern)
// ============================================

const CSRF_TOKEN_LENGTH = 32;

function generateRandomToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < CSRF_TOKEN_LENGTH; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify CSRF token using Double Submit Cookie pattern.
 * The client must send the token in both:
 * 1. A cookie named 'csrf_token'
 * 2. A header named 'x-csrf-token'
 */
export function verifyCsrfToken(request: Request): boolean {
  const headerToken = request.headers.get('x-csrf-token');
  if (!headerToken) return false;

  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.split('=');
      return [key.trim(), val.join('=').trim()];
    })
  );
  const cookieToken = cookies['csrf_token'];
  if (!cookieToken) return false;

  return headerToken === cookieToken;
}

/**
 * Verify request is safe (GET/HEAD/OPTIONS) or has valid CSRF token.
 * For single-user apps, this prevents cross-site form submissions.
 */
export function verifyRequestSecurity(request: Request): boolean {
  const method = request.method.toUpperCase();
  // Safe methods don't need CSRF protection
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }
  // For mutations, check CSRF token OR verify same-origin via Origin/Referer headers
  if (verifyCsrfToken(request)) return true;
  
  // Fallback: check Origin/Referer headers
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
