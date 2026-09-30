// The frontend's ESLint configuration, kept here so it is unit-tested: ESLint's
// config file, `eslint.config.ts`, only delegates to this module (decision 0012).
import vitest from '@vitest/eslint-plugin'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import { globalIgnores } from 'eslint/config'
import vue from 'eslint-plugin-vue'

/** `create-vue`'s configuration with the stricter, type-aware rule sets. */
export function eslintConfig() {
  return defineConfigWithVueTs(
    { name: 'app/files-to-lint', files: ['**/*.{vue,ts,mts,tsx}'] },
    globalIgnores(['**/dist/**']),
    vue.configs['flat/recommended'],
    vueTsConfigs.recommendedTypeChecked,
    { ...vitest.configs.recommended, files: ['**/*.test.ts', 'tests/**'] },
    // Formatting belongs to Prettier, so rules that would fight it are off.
    skipFormatting,
  )
}
