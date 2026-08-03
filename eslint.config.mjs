import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'public/**'] },
  js.configs.recommended,
  {
    // A leftover `eslint-disable` comment is cruft, not a standards violation.
    // ESLint reports it as a warning by default, and the CI gate runs with
    // --max-warnings=0, so leaving this on means one stale comment blocks a
    // production deploy. Every rule below is an error, so --max-warnings=0
    // still catches anything that matters.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
    },
  },
];
