// The ESLint configuration for repository code that runs in Node: the tooling, the
// repository-level verification and the root config files. ESLint's config file,
// `eslint.config.ts`, only delegates to this module (decision 0012); the frontend
// has its own configuration in `src-ui/`.
import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'

/**
 * The recommended rules with type information, as the frontend uses. None of them
 * format code, so nothing here competes with Prettier.
 */
export function eslintConfig() {
  return defineConfig(
    globalIgnores(['src-ui/**', 'src-tauri/**', 'coverage/**', 'test-results/**']),
    {
      files: ['**/*.ts'],
      extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: fileURLToPath(new URL('..', import.meta.url)),
        },
      },
    },
    {
      ...vitest.configs.recommended,
      files: ['**/*.test.ts'],
      rules: {
        ...vitest.configs.recommended.rules,
        // Vitest's expect takes an optional failure message.
        'vitest/valid-expect': ['error', { maxArgs: 2 }],
        // Helpers such as `expectReportFailure` assert on the test's behalf.
        'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*'] }],
      },
    },
    {
      // Each stage is a named step that the npm scripts select; it fails by throwing.
      files: ['tests/backend-coverage-stages.test.ts'],
      rules: { 'vitest/expect-expect': 'off' },
    },
  )
}
