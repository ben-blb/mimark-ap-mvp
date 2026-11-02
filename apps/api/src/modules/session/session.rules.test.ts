import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateTemporaryPassword,
  hashSecret,
  isLoginBlocked,
  normalizeEmail,
  readSession,
  type Session,
  signSession,
  verifySecret,
} from './session.rules.js';

const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';
const NOW = new Date('2026-10-20T15:00:00Z');
const session: Session = {
  userId: 'u1',
  actor: 'Ana',
  role: 'payables',
  mustChangePassword: false,
  expiresAt: new Date('2026-10-20T23:00:00Z'),
};

describe('contraseña y código de configuración', () => {
  it('AC-013-05 acepta la contraseña correcta contra su hash', () => {
    expect(verifySecret('mi-contrasena-larga', hashSecret('mi-contrasena-larga'))).toBe(true);
  });

  it('AC-013-06 rechaza una contraseña incorrecta o un hash mal formado', () => {
    const hash = hashSecret('mi-contrasena-larga');
    expect(verifySecret('otra-contrasena', hash)).toBe(false);
    expect(verifySecret('mi-contrasena-larga', 'texto-plano')).toBe(false);
  });

  it.each([
    [9, 0, false],
    [10, 0, true],
    [0, 4, false],
    [0, 5, true],
    [3, 5, true],
  ])('AC-013-07 bloqueo con %i fallas de IP y %i del correo → %s', (ip, email, blocked) => {
    expect(isLoginBlocked(ip, email)).toBe(blocked);
  });

  it('AC-013-05 normaliza el correo', () => {
    expect(normalizeEmail('  Ana@Mimark.MX ')).toBe('ana@mimark.mx');
  });

  it('AC-013-21 la contraseña temporal tiene 16 caracteres legibles y depende del azar dado', () => {
    const a = generateTemporaryPassword(Uint8Array.from({ length: 16 }, (_, i) => i));
    const b = generateTemporaryPassword(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(a).not.toBe(b);
  });
});

describe('token de sesión', () => {
  it('AC-013-05 un token firmado se lee de vuelta con usuario, rol, bandera y vigencia', () => {
    expect(readSession(signSession(session, SECRET), SECRET, NOW)).toEqual(session);
  });

  it('AC-013-08 rechaza tokens alterados, firmados con otro secreto, vencidos, mal formados o sin userId', () => {
    const token = signSession(session, SECRET);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ i: 'u1', a: 'Ana', r: 'admin', m: false, e: 9e15 }),
    ).toString('base64url');
    const legacy = Buffer.from(JSON.stringify({ a: 'Ana', r: 'admin', e: 9e15 })).toString(
      'base64url',
    );

    expect(readSession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readSession(token, 'otro-secreto-de-al-menos-32-caracteres', NOW)).toBeNull();
    expect(readSession(token, SECRET, new Date('2026-10-21T00:00:00Z'))).toBeNull();
    expect(readSession('basura', SECRET, NOW)).toBeNull();
    expect(readSession(undefined, SECRET, NOW)).toBeNull();
    // Cookie con el formato anterior (spec 001), aun bien firmada.
    expect(
      readSession(
        `${legacy}.${createHmac('sha256', SECRET).update(legacy).digest('base64url')}`,
        SECRET,
        NOW,
      ),
    ).toBeNull();
  });
});

describe('hash mal formado', () => {
  it('AC-013-06 un hash vacío o truncado nunca valida', () => {
    expect(verifySecret('cualquiera', 'scrypt$a$b')).toBe(false);
    expect(verifySecret('', 'scrypt$a$b')).toBe(false);
  });
});
