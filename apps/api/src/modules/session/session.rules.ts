import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Role } from '@mimark/contracts/session';
import { z } from 'zod';

/** Reglas del acceso (spec 001). Puras: el reloj, el secreto y el hash llegan como parámetros. */

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface Session {
  actor: string;
  role: Role;
  expiresAt: Date;
}

/** Hash del código de acceso: 'scrypt$<sal>$<hash>' en base64url. */
export function hashAccessCode(code: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(code, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyAccessCode(code: string, storedHash: string): boolean {
  const [scheme, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(code, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function isLoginBlocked(recentFailures: number): boolean {
  return recentFailures >= MAX_FAILED_LOGINS;
}

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/** Token de la cookie: '<payload>.<firma>'. La firma HMAC impide alterar actor, rol o vigencia. */
export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ a: session.actor, r: session.role, e: session.expiresAt.getTime() }),
  ).toString('base64url');
  return `${payload}.${hmac(payload, secret)}`;
}

const TokenPayload = z.object({ a: z.string().min(1), r: Role, e: z.number() });

/** Devuelve la sesión si el token es auténtico y vigente; si no, null. */
export function readSession(token: string | undefined, secret: string, now: Date): Session | null {
  const [payload, signature, ...rest] = token?.split('.') ?? [];
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(hmac(payload, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const parsed = TokenPayload.safeParse(parseJson(Buffer.from(payload, 'base64url').toString()));
  if (!parsed.success || parsed.data.e <= now.getTime()) return null;
  return { actor: parsed.data.a, role: parsed.data.r, expiresAt: new Date(parsed.data.e) };
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
