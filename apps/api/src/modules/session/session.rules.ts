import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Role, type SessionDto } from '@mimark/contracts/session';
import { z } from 'zod';

/** Reglas del acceso (specs 001 y 013). Puras: el reloj, el azar, el secreto y el hash llegan como parámetros. */

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 10;
export const MAX_FAILED_LOGINS_PER_EMAIL = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface Session {
  userId: string;
  actor: string;
  role: Role;
  /** La persona solo puede cambiar su contraseña hasta que lo haga (AC-013-11). */
  mustChangePassword: boolean;
  expiresAt: Date;
}

/** Hash de una contraseña o del código de configuración: 'scrypt$<sal>$<hash>' en base64url. */
export function hashSecret(code: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(code, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifySecret(code: string, storedHash: string): boolean {
  const [scheme, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length === 0) return false;
  const actual = scryptSync(code, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Bloqueo por intentos fallidos recientes: de la IP o, si se conoce, del correo (AC-013-07). */
export function toSessionDto(session: Session): SessionDto {
  return {
    userId: session.userId,
    actor: session.actor,
    role: session.role,
    mustChangePassword: session.mustChangePassword,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function isLoginBlocked(failuresByIp: number, failuresByEmail = 0): boolean {
  return failuresByIp >= MAX_FAILED_LOGINS || failuresByEmail >= MAX_FAILED_LOGINS_PER_EMAIL;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña temporal legible de 16 caracteres (sin 0/O/1/l/I). El azar llega como parámetro. */
export function generateTemporaryPassword(randomBytes16: Uint8Array): string {
  return Array.from(
    randomBytes16.subarray(0, 16),
    (b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length],
  ).join('');
}

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/** Token de la cookie: '<payload>.<firma>'. La firma HMAC impide alterar actor, rol o vigencia. */
export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      i: session.userId,
      a: session.actor,
      r: session.role,
      m: session.mustChangePassword,
      e: session.expiresAt.getTime(),
    }),
  ).toString('base64url');
  return `${payload}.${hmac(payload, secret)}`;
}

const TokenPayload = z.object({
  i: z.string().min(1),
  a: z.string().min(1),
  r: Role,
  m: z.boolean(),
  e: z.number(),
});

/** Devuelve la sesión si el token es auténtico y vigente; si no, null. */
export function readSession(token: string | undefined, secret: string, now: Date): Session | null {
  const [payload, signature, ...rest] = token?.split('.') ?? [];
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(hmac(payload, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const parsed = TokenPayload.safeParse(parseJson(Buffer.from(payload, 'base64url').toString()));
  if (!parsed.success || parsed.data.e <= now.getTime()) return null;
  return {
    userId: parsed.data.i,
    actor: parsed.data.a,
    role: parsed.data.r,
    mustChangePassword: parsed.data.m,
    expiresAt: new Date(parsed.data.e),
  };
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
