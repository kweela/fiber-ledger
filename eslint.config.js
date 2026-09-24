import { defineConfig, globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default defineConfig(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([
    'dist/**',
    'node_modules/**',
    'docs/.vitepress/dist/**',
    'docs/.vitepress/cache/**',
  ]),
  {
    rules: {
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],
      'newline-before-return': 'error',
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  eslintConfigPrettier,
)
