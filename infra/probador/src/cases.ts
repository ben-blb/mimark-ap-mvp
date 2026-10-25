import { ACCEPTANCE_CASES } from './cases-acceptance.js';
import { SECURITY_CASES } from './cases-security.js';

export { toCaseResult, type Ctx } from './case-kit.js';

/** Los 12 casos, en el orden del reporte. */
export const CASES = [...ACCEPTANCE_CASES, ...SECURITY_CASES];
