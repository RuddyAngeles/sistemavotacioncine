import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'worker-configuration.d.ts'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    files: ['src/server/**/*.ts', 'src/shared/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.worker, ...globals.node },
    },
  },

  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },


  {
    // En estos ficheros co-exportamos variantes y hooks junto al componente,
    // que es el patron habitual de shadcn/ui. El aviso de Fast Refresh solo
    // afecta al recargado en caliente durante el desarrollo.
    files: ['src/client/components/ui/**/*.tsx', 'src/client/hooks/**/*.tsx', 'src/client/components/common/field.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
)
