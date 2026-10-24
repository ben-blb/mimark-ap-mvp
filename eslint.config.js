// Reglas de estilo y de arquitectura que revisa una máquina. Los límites entre capas
// (quién importa a quién) viven en .dependency-cruiser.cjs.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Las reglas de negocio (*.rules.ts) son funciones puras: mismo input, mismo output. */
const PURE_RULES = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Las reglas son puras: recibe `today`/`now` como parámetro en vez de leer el reloj.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Las reglas son puras: recibe `now` como parámetro en vez de usar Date.now().',
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'Las reglas no leen variables de entorno: el service les pasa la configuración.',
  },
  {
    selector: 'AwaitExpression',
    message: 'Las reglas no hacen I/O: carga los datos en el service y pásalos como argumentos.',
  },
];

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/generated/**',
    '**/node_modules/**',
    '**/coverage/**',
    'apps/api/.storage/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.rules.ts'],
    rules: { 'no-restricted-syntax': ['error', ...PURE_RULES] },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-console': ['error'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Prohibido (PS-01): el contenido de documentos, del modelo o de usuarios se muestra siempre como texto.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'apps/api/test/**/*.ts'],
    rules: {
      // supertest devuelve cuerpos `any`; las aserciones validan la forma.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'max-lines': 'off',
    },
  },
);
