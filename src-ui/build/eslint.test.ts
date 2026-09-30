// @vitest-environment node
// The config runs in Node, so its test does too.
import { ESLint, type Linter } from 'eslint'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { eslintConfig } from './eslint'

let eslint: ESLint
beforeAll(() => {
  eslint = new ESLint({
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    overrideConfigFile: true,
    // typescript-eslint types the same config objects more loosely than ESLint does.
    overrideConfig: eslintConfig() as Linter.Config[],
  })
})

// The rules reported for source text linted in place of an existing file: type-aware
// rules only lint files the TypeScript projects include, but take the text given.
async function rules(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId)
}

const vueFile = 'src/components/EmptyState.vue'
const component = (template: string, script = '') =>
  `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n${template}\n</template>\n`

test('Vue templates follow the recommended rules', async () => {
  expect(await rules(component('<ul><li v-for="n in 3">{{ n }}</li></ul>'), vueFile))
    .toContain('vue/require-v-for-key')
  expect(await rules(component('<div v-bind:hidden="true" />'), vueFile))
    .toContain('vue/v-bind-style')
})

test('type-aware rules catch unawaited promises in scripts and components', async () => {
  const floating = 'export async function load() {}\nload()\n'
  expect(await rules(floating, 'src/format.ts')).toContain('@typescript-eslint/no-floating-promises')
  expect(await rules(component('<p />', floating.replace('export ', '')), vueFile))
    .toContain('@typescript-eslint/no-floating-promises')
})

test('tests follow the Vitest rules', async () => {
  const duplicate = "import { expect, test } from 'vitest'\ntest('a', () => { expect(1).toBe(1) })\ntest('a', () => { expect(2).toBe(2) })\n"
  expect(await rules(duplicate, 'src/messages.test.ts')).toContain('vitest/no-identical-title')
  expect(await rules(duplicate, 'tests/app.test.ts')).toContain('vitest/no-identical-title')
})

test('formatting is left to Prettier', async () => {
  const crowded = component('<input\n    id="a" v-model="d" type="text" class="b" aria-label="c">', "import { ref } from 'vue'\nconst d = ref('')")
  expect(await rules(crowded, vueFile)).toEqual([])
})

test('build output is not linted', async () => {
  expect(await eslint.isPathIgnored('dist/assets/index.js')).toBe(true)
  expect(await eslint.isPathIgnored('src/main.ts')).toBe(false)
})
