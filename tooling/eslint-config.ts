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
        parserOptions: { projectService: true, tsconfigRootDir: fileURLToPath(new URL('..', import.meta.url)) },
      },
    },
    { ...vitest.configs.recommended, files: ['**/*.test.ts'] },
  )
}
