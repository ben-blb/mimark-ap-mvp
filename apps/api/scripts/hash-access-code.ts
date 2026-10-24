import { hashAccessCode } from '../src/modules/session/session.rules.js';

// Uso: pnpm --filter @mimark/api access:hash "<código>"
// Copia el resultado a ACCESS_CODE_HASH (en .env o en las variables de Vercel).
const code = process.argv[2];
if (!code || code.length < 12) {
  console.error('Escribe un código de al menos 12 caracteres: access:hash "<código>"');
  process.exit(1);
}
console.log(hashAccessCode(code));
