import type { Role } from '@mimark/contracts/session';

/** Campos que agregan request-context.ts y session.guard.ts a cada petición. */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      session?: { actor: string; role: Role; expiresAt: Date };
    }
    interface Locals {
      errorCode?: string;
    }
  }
}

export {};
