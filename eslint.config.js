// ESLint flat config. Replaces the Biome linter (E01-16) with the same scope `pnpm lint` had (`src/`).
//
// Rules that report pre-existing violations are warnings, with their counts recorded in
// .docs/testing/baseline.md; new code should not add to them.
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated shadcn / AI-elements components are not linted (as with Biome).
    ignores: ['src/components/ui/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    plugins: {
      react,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Errors in Biome: useImportType and noTsIgnore. Biome's useExportType is covered by `isolatedModules` in
      // tsconfig.json (re-exporting a type without `export type` fails type checking).
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],

      // Import order with Biome's groups: node builtins, `@/`, packages, other aliases, relative paths, with no blank
      // line between them (as Biome left the code). Side-effect imports (CSS) stay first, followed by a blank line.
      'simple-import-sort/imports': [
        'error',
        { groups: [['^\\u0000'], ['^node:', '^@/', '^@?\\w', '^[#~$%]', '^\\.']] },
      ],
      'simple-import-sort/exports': 'error',

      // Warnings in Biome.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react/no-array-index-key': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'prefer-template': 'warn',
      'no-cond-assign': 'warn',
      radix: 'warn',
      'jsx-a11y/prefer-tag-over-role': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'warn',

      // New with ESLint (React Compiler and core checks); pre-existing violations.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/globals': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',

      // Off in Biome: terminal code matches control characters on purpose.
      'no-control-regex': 'off',
      // TypeScript already reports undefined names.
      'no-undef': 'off',
    },
  },
);
