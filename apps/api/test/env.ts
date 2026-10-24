/**
 * Entorno de pruebas. Nada de aquí sirve fuera de las pruebas.
 * El hash corresponde al código TEST_ACCESS_CODE.
 */
export const TEST_ACCESS_CODE = 'codigo-de-prueba';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/mimark_test',
  ACCESS_CODE_HASH: 'scrypt$fHYPnJRvifvBclLHTZbotQ$Mwb61Wzdcwqp1ElDbd5fz7elB9xwmMTGFOqKj-ItP8Q',
  SESSION_SECRET: 'test-secret-que-solo-existe-en-las-pruebas-0123456789',
  BUSINESS_TZ: 'America/Monterrey',
};
