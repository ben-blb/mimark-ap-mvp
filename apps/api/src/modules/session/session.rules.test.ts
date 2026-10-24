import { describe, expect, it } from 'vitest';
import {
  hashAccessCode,
  isLoginBlocked,
  readSession,
  type Session,
  signSession,
  verifyAccessCode,
} from './session.rules.js';

const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';
const NOW = new Date('2026-10-20T15:00:00Z');
const session: Session = {
  actor: 'Ana',
  role: 'payables',
  expiresAt: new Date('2026-10-20T23:00:00Z'),
};

describe('código de acceso', () => {
  it('AC-001-01 acepta el código correcto contra su hash', () => {
    expect(verifyAccessCode('mi-codigo-largo', hashAccessCode('mi-codigo-largo'))).toBe(true);
  });

  it('AC-001-02 rechaza un código incorrecto o un hash mal formado', () => {
    const hash = hashAccessCode('mi-codigo-largo');
    expect(verifyAccessCode('otro-codigo', hash)).toBe(false);
    expect(verifyAccessCode('mi-codigo-largo', 'texto-plano')).toBe(false);
  });

  it('AC-001-03 bloquea a partir del décimo intento fallido', () => {
    expect(isLoginBlocked(9)).toBe(false);
    expect(isLoginBlocked(10)).toBe(true);
  });
});

describe('token de sesión', () => {
  it('AC-001-01 un token firmado se lee de vuelta con actor, rol y vigencia', () => {
    expect(readSession(signSession(session, SECRET), SECRET, NOW)).toEqual(session);
  });

  it('AC-001-04 rechaza tokens alterados, firmados con otro secreto, vencidos o mal formados', () => {
    const token = signSession(session, SECRET);
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ a: 'Ana', r: 'admin', e: 9e15 })).toString(
      'base64url',
    );

    expect(readSession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readSession(token, 'otro-secreto-de-al-menos-32-caracteres', NOW)).toBeNull();
    expect(readSession(token, SECRET, new Date('2026-10-21T00:00:00Z'))).toBeNull();
    expect(readSession('basura', SECRET, NOW)).toBeNull();
    expect(readSession(undefined, SECRET, NOW)).toBeNull();
  });
});
