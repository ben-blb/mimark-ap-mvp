/**
 * Límites entre capas, revisados por una máquina en `pnpm layers` (parte de `pnpm check`).
 * Flujo del backend: controller → service → (rules | repository | client). Nunca al revés.
 * Cada regla explica en `comment` cómo arreglar la violación.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'reglas-puras',
      severity: 'error',
      comment:
        'Un *.rules.ts es una función pura: no conoce Nest, Prisma, repositorios ni clients. ' +
        'Carga los datos en el service y pásalos como argumentos.',
      from: { path: '\\.rules\\.ts$' },
      to: {
        path: [
          '@nestjs',
          '@prisma',
          'src/generated/',
          'src/common/db\\.ts$',
          '\\.(repository|service|controller|client)\\.ts$',
        ],
      },
    },
    {
      name: 'controller-sin-datos',
      severity: 'error',
      comment:
        'El controller solo traduce HTTP y llama UN método de su service. ' +
        'Mueve la consulta o la llamada externa al service.',
      from: { path: '\\.controller\\.ts$' },
      to: {
        path: ['@prisma', 'src/generated/', 'src/common/db\\.ts$', '\\.(repository|client)\\.ts$'],
      },
    },
    {
      name: 'service-no-llama-service',
      severity: 'error',
      comment:
        'Un service no llama a otro service. Si comparten lógica, extráela a un *.rules.ts; ' +
        'si necesitas datos de otro módulo, léelos con su repositorio.',
      from: { path: '\\.service\\.ts$' },
      to: { path: '\\.service\\.ts$' },
    },
    {
      name: 'repositorio-solo-datos',
      severity: 'error',
      comment:
        'Un repositorio solo habla con la base de datos; no conoce services, reglas ni HTTP.',
      from: { path: '\\.repository\\.ts$' },
      to: { path: '\\.(service|controller|rules|client)\\.ts$' },
    },
    {
      name: 'client-aislado',
      severity: 'error',
      comment:
        'Un client habla con UN tercero y devuelve tipos de contracts; no toca la base de datos ' +
        'ni decide reglas de negocio.',
      from: { path: 'src/integrations/.+\\.client\\.ts$' },
      to: { path: ['src/common/db\\.ts$', '\\.(repository|service|rules)\\.ts$'] },
    },
    {
      name: 'common-transversal',
      severity: 'error',
      comment: 'common/ es transversal: no depende de ningún módulo. Mueve el código al módulo.',
      from: { path: '^apps/api/src/common/' },
      to: { path: '^apps/api/src/modules/' },
    },
    {
      name: 'web-solo-http',
      severity: 'error',
      comment:
        'La web solo habla con la API por HTTP (lib/api-client.ts) y comparte tipos con ' +
        '@mimark/contracts. Nunca importa código del backend.',
      from: { path: '^apps/web/' },
      to: { path: ['^apps/api/', '@nestjs', '@prisma'] },
    },
    {
      name: 'contracts-solo-zod',
      severity: 'error',
      comment:
        'packages/contracts solo contiene esquemas Zod: no depende de las apps ni de otras librerías.',
      from: { path: '^packages/contracts/src/' },
      to: { path: ['^apps/', 'node_modules'], pathNot: ['/zod/'] },
    },
    {
      name: 'probador-caja-negra',
      severity: 'error',
      comment: 'El probador prueba la app desplegada solo por HTTP; no importa código de las apps.',
      from: { path: '^infra/' },
      to: { path: '^apps/' },
    },
    {
      name: 'sin-ciclos',
      severity: 'error',
      comment:
        'Dependencia circular: rompe el ciclo moviendo lo compartido a un *.rules.ts o a common/.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'import-roto',
      severity: 'error',
      comment: 'Este import no se puede resolver. Revisa la ruta (en el backend termina en .js).',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '/dist/',
        '/generated/',
        '\\.test\\.tsx?$',
        '/test/',
        'vitest\\.config',
        'vite\\.config',
      ],
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
